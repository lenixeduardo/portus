// LabSerial standalone prototype — original KMDF implementation (no com0com code).
// EXPERIMENTAL: requires Windows WDK compilation, driver signing, and VM validation.
// Two independently root-enumerated devices use one kernel driver and a shared pair.
// No dependency on the PORTUS application or on its Node/TypeScript runtime.
#include <ntddk.h>
#include <wdf.h>
#include <initguid.h>
#include <ntddser.h>

#define LAB_RING_CAPACITY 4096
#define LAB_ENDPOINT_COUNT 2

typedef struct _LAB_PORT {
    WDFDEVICE device;
    WDFQUEUE readQueue;
    UCHAR buffer[LAB_RING_CAPACITY];
    ULONG head;
    ULONG used;
    ULONG baudRate;
    SERIAL_LINE_CONTROL line;
    SERIAL_TIMEOUTS timeouts;
    SERIAL_CHARS chars;
    SERIAL_HANDFLOW handflow;
    ULONG modemControl;
    ULONG waitMask;
    BOOLEAN active;
} LAB_PORT;

typedef struct _LAB_DEVICE_CONTEXT { ULONG side; } LAB_DEVICE_CONTEXT;
WDF_DECLARE_CONTEXT_TYPE_WITH_NAME(LAB_DEVICE_CONTEXT, LabGetContext);

static FAST_MUTEX g_mutex;
static LAB_PORT g_port[LAB_ENDPOINT_COUNT];

EVT_WDF_DRIVER_DEVICE_ADD LabEvtDeviceAdd;
EVT_WDF_OBJECT_CONTEXT_CLEANUP LabEvtCleanup;
EVT_WDF_IO_QUEUE_IO_READ LabEvtRead;
EVT_WDF_IO_QUEUE_IO_WRITE LabEvtWrite;
EVT_WDF_IO_QUEUE_IO_DEVICE_CONTROL LabEvtIoctl;

#include "../core/labserial_ring.h"

/* Uses the same platform-neutral FIFO tested in user mode.
 * All accesses in this driver must hold g_mutex. */
static ULONG LabPop(LAB_PORT* port, PUCHAR output, ULONG count) {
    return (ULONG)LabRingPop(port->buffer, LAB_RING_CAPACITY,
                            &port->head, &port->used, output, count);
}

static ULONG LabPush(LAB_PORT* port, const UCHAR* input, ULONG count) {
    return (ULONG)LabRingPush(port->buffer, LAB_RING_CAPACITY,
                             port->head, &port->used, input, count);
}

// Reads queue when no bytes are available. Framework owns cancellation of queued requests.
// A draining worker must never leave a retrieved request uncompleted.
static VOID LabDrainReads(ULONG side) {
    for (;;) {
        WDFREQUEST request = NULL;
        WDFQUEUE queue;
        NTSTATUS status;
        PVOID out;
        size_t length;
        ULONG written;

        ExAcquireFastMutex(&g_mutex);
        if (!g_port[side].active || g_port[side].used == 0 || !g_port[side].readQueue) {
            ExReleaseFastMutex(&g_mutex);
            return;
        }
        queue = g_port[side].readQueue;
        // Temporary reference prevents queue disposal between lock and retrieval.
        WdfObjectReference(queue);
        ExReleaseFastMutex(&g_mutex);

        status = WdfIoQueueRetrieveNextRequest(queue, &request);
        WdfObjectDereference(queue);
        if (!NT_SUCCESS(status)) return;
        status = WdfRequestRetrieveOutputBuffer(request, 1, &out, &length);
        if (!NT_SUCCESS(status)) {
            WdfRequestComplete(request, status);
            continue;
        }
        ExAcquireFastMutex(&g_mutex);
        written = LabPop(&g_port[side], (PUCHAR)out,
            (ULONG)min(length, (size_t)LAB_RING_CAPACITY));
        ExReleaseFastMutex(&g_mutex);
        if (written == 0) {
            status = WdfRequestRequeue(request);
            if (!NT_SUCCESS(status)) WdfRequestComplete(request, status);
            return;
        }
        WdfRequestCompleteWithInformation(request, STATUS_SUCCESS, written);
    }
}

VOID LabEvtRead(WDFQUEUE queue, WDFREQUEST request, size_t length) {
    LAB_DEVICE_CONTEXT* ctx = LabGetContext(WdfIoQueueGetDevice(queue));
    NTSTATUS status;
    WDFQUEUE manual;
    if (length == 0) {
        WdfRequestCompleteWithInformation(request, STATUS_SUCCESS, 0);
        return;
    }
    ExAcquireFastMutex(&g_mutex);
    manual = g_port[ctx->side].readQueue;
    if (manual) WdfObjectReference(manual);
    ExReleaseFastMutex(&g_mutex);
    if (!manual) {
        WdfRequestComplete(request, STATUS_DEVICE_NOT_READY);
        return;
    }
    status = WdfRequestForwardToIoQueue(request, manual);
    WdfObjectDereference(manual);
    if (!NT_SUCCESS(status)) {
        WdfRequestComplete(request, status);
        return;
    }
    LabDrainReads(ctx->side);
}

VOID LabEvtWrite(WDFQUEUE queue, WDFREQUEST request, size_t length) {
    LAB_DEVICE_CONTEXT* ctx = LabGetContext(WdfIoQueueGetDevice(queue));
    ULONG remote = ctx->side == 0 ? 1 : 0;
    PVOID in;
    NTSTATUS status;
    ULONG transferred = 0;
    if (length == 0) {
        WdfRequestCompleteWithInformation(request, STATUS_SUCCESS, 0);
        return;
    }
    status = WdfRequestRetrieveInputBuffer(request, 1, &in, NULL);
    if (!NT_SUCCESS(status)) {
        WdfRequestComplete(request, status);
        return;
    }
    ExAcquireFastMutex(&g_mutex);
    if (g_port[remote].active) {
        transferred = LabPush(&g_port[remote], (const UCHAR*)in,
                              (ULONG)min(length, (size_t)LAB_RING_CAPACITY));
    }
    ExReleaseFastMutex(&g_mutex);
    if (transferred == 0) {
        WdfRequestComplete(request, STATUS_BUFFER_OVERFLOW);
        return;
    }
    WdfRequestCompleteWithInformation(request, STATUS_SUCCESS, transferred);
    LabDrainReads(remote);
}

static NTSTATUS LabReadIoctlOutput(WDFREQUEST request, PVOID* output, size_t needed) {
    return WdfRequestRetrieveOutputBuffer(request, needed, output, NULL);
}

static NTSTATUS LabReadIoctlInput(WDFREQUEST request, PVOID* input, size_t needed) {
    return WdfRequestRetrieveInputBuffer(request, needed, input, NULL);
}

VOID LabEvtIoctl(WDFQUEUE queue, WDFREQUEST request,
    size_t outputLength, size_t inputLength, ULONG code) {
    LAB_DEVICE_CONTEXT* ctx = LabGetContext(WdfIoQueueGetDevice(queue));
    LAB_PORT* port = &g_port[ctx->side];
    NTSTATUS status = STATUS_NOT_SUPPORTED;
    PVOID input = NULL;
    PVOID output = NULL;
    size_t information = 0;
    UNREFERENCED_PARAMETER(outputLength);
    UNREFERENCED_PARAMETER(inputLength);

    switch (code) {
    case IOCTL_SERIAL_SET_BAUD_RATE:
        status = LabReadIoctlInput(request, &input, sizeof(SERIAL_BAUD_RATE));
        if (NT_SUCCESS(status)) {
            ULONG rate = ((SERIAL_BAUD_RATE*)input)->BaudRate;
            if (rate == 0 || rate > 4000000) status = STATUS_INVALID_PARAMETER;
            else { ExAcquireFastMutex(&g_mutex); port->baudRate = rate; ExReleaseFastMutex(&g_mutex); }
        }
        break;
    case IOCTL_SERIAL_GET_BAUD_RATE:
        status = LabReadIoctlOutput(request, &output, sizeof(SERIAL_BAUD_RATE));
        if (NT_SUCCESS(status)) {
            ExAcquireFastMutex(&g_mutex);
            ((SERIAL_BAUD_RATE*)output)->BaudRate = port->baudRate;
            ExReleaseFastMutex(&g_mutex);
            information = sizeof(SERIAL_BAUD_RATE);
        }
        break;
    case IOCTL_SERIAL_SET_LINE_CONTROL:
        status = LabReadIoctlInput(request, &input, sizeof(SERIAL_LINE_CONTROL));
        if (NT_SUCCESS(status)) {
            SERIAL_LINE_CONTROL candidate = *(SERIAL_LINE_CONTROL*)input;
            if (candidate.WordLength < 5 || candidate.WordLength > 8 ||
                candidate.Parity > 4 || candidate.StopBits > 2) status = STATUS_INVALID_PARAMETER;
            else { ExAcquireFastMutex(&g_mutex); port->line = candidate; ExReleaseFastMutex(&g_mutex); }
        }
        break;
    case IOCTL_SERIAL_GET_LINE_CONTROL:
        status = LabReadIoctlOutput(request, &output, sizeof(SERIAL_LINE_CONTROL));
        if (NT_SUCCESS(status)) {
            ExAcquireFastMutex(&g_mutex); *(SERIAL_LINE_CONTROL*)output = port->line; ExReleaseFastMutex(&g_mutex);
            information = sizeof(SERIAL_LINE_CONTROL);
        }
        break;
    case IOCTL_SERIAL_SET_TIMEOUTS:
        status = LabReadIoctlInput(request, &input, sizeof(SERIAL_TIMEOUTS));
        if (NT_SUCCESS(status)) {
            ExAcquireFastMutex(&g_mutex); port->timeouts = *(SERIAL_TIMEOUTS*)input; ExReleaseFastMutex(&g_mutex);
        }
        break;
    case IOCTL_SERIAL_GET_TIMEOUTS:
        status = LabReadIoctlOutput(request, &output, sizeof(SERIAL_TIMEOUTS));
        if (NT_SUCCESS(status)) {
            ExAcquireFastMutex(&g_mutex); *(SERIAL_TIMEOUTS*)output = port->timeouts; ExReleaseFastMutex(&g_mutex);
            information = sizeof(SERIAL_TIMEOUTS);
        }
        break;
    case IOCTL_SERIAL_SET_WAIT_MASK:
        status = LabReadIoctlInput(request, &input, sizeof(ULONG));
        if (NT_SUCCESS(status)) {
            ExAcquireFastMutex(&g_mutex); port->waitMask = *(ULONG*)input; ExReleaseFastMutex(&g_mutex);
        }
        break;
    case IOCTL_SERIAL_GET_WAIT_MASK:
        status = LabReadIoctlOutput(request, &output, sizeof(ULONG));
        if (NT_SUCCESS(status)) {
            ExAcquireFastMutex(&g_mutex); *(ULONG*)output = port->waitMask; ExReleaseFastMutex(&g_mutex);
            information = sizeof(ULONG);
        }
        break;
    case IOCTL_SERIAL_GET_COMMSTATUS:
        status = LabReadIoctlOutput(request, &output, sizeof(SERIAL_STATUS));
        if (NT_SUCCESS(status)) {
            SERIAL_STATUS* result = (SERIAL_STATUS*)output;
            RtlZeroMemory(result, sizeof(*result));
            ExAcquireFastMutex(&g_mutex);
            result->AmountInInQueue = port->used;
            ExReleaseFastMutex(&g_mutex);
            information = sizeof(*result);
        }
        break;
    case IOCTL_SERIAL_GET_CHARS:
        status = LabReadIoctlOutput(request, &output, sizeof(SERIAL_CHARS));
        if (NT_SUCCESS(status)) {
            ExAcquireFastMutex(&g_mutex); *(SERIAL_CHARS*)output = port->chars; ExReleaseFastMutex(&g_mutex);
            information = sizeof(SERIAL_CHARS);
        }
        break;
    case IOCTL_SERIAL_SET_CHARS:
        status = LabReadIoctlInput(request, &input, sizeof(SERIAL_CHARS));
        if (NT_SUCCESS(status)) {
            ExAcquireFastMutex(&g_mutex); port->chars = *(SERIAL_CHARS*)input; ExReleaseFastMutex(&g_mutex);
        }
        break;
    case IOCTL_SERIAL_GET_HANDFLOW:
        status = LabReadIoctlOutput(request, &output, sizeof(SERIAL_HANDFLOW));
        if (NT_SUCCESS(status)) {
            ExAcquireFastMutex(&g_mutex); *(SERIAL_HANDFLOW*)output = port->handflow; ExReleaseFastMutex(&g_mutex);
            information = sizeof(SERIAL_HANDFLOW);
        }
        break;
    case IOCTL_SERIAL_SET_HANDFLOW:
        status = LabReadIoctlInput(request, &input, sizeof(SERIAL_HANDFLOW));
        if (NT_SUCCESS(status)) {
            // Active hardware/software handshakes are not emulated yet.
            SERIAL_HANDFLOW candidate = *(SERIAL_HANDFLOW*)input;
            if ((candidate.ControlHandShake & SERIAL_CTS_HANDSHAKE) ||
                (candidate.FlowReplace & SERIAL_AUTO_TRANSMIT) ||
                (candidate.FlowReplace & SERIAL_AUTO_RECEIVE)) {
                status = STATUS_NOT_SUPPORTED;
            } else {
                ExAcquireFastMutex(&g_mutex); port->handflow = candidate; ExReleaseFastMutex(&g_mutex);
            }
        }
        break;
    case IOCTL_SERIAL_GET_MODEMSTATUS:
        status = LabReadIoctlOutput(request, &output, sizeof(ULONG));
        if (NT_SUCCESS(status)) {
            // Virtual cable presents connected modem-state at MVP.
            *(ULONG*)output = 0x000000B0;
            information = sizeof(ULONG);
        }
        break;
    case IOCTL_SERIAL_SET_DTR:
    case IOCTL_SERIAL_CLR_DTR:
    case IOCTL_SERIAL_SET_RTS:
    case IOCTL_SERIAL_CLR_RTS:
        ExAcquireFastMutex(&g_mutex);
        if (code == IOCTL_SERIAL_SET_DTR) port->modemControl |= 0x01;
        if (code == IOCTL_SERIAL_CLR_DTR) port->modemControl &= ~0x01UL;
        if (code == IOCTL_SERIAL_SET_RTS) port->modemControl |= 0x02;
        if (code == IOCTL_SERIAL_CLR_RTS) port->modemControl &= ~0x02UL;
        ExReleaseFastMutex(&g_mutex);
        status = STATUS_SUCCESS;
        break;
    case IOCTL_SERIAL_GET_DTRRTS:
        status = LabReadIoctlOutput(request, &output, sizeof(ULONG));
        if (NT_SUCCESS(status)) {
            ExAcquireFastMutex(&g_mutex); *(ULONG*)output = port->modemControl; ExReleaseFastMutex(&g_mutex);
            information = sizeof(ULONG);
        }
        break;
    case IOCTL_SERIAL_PURGE:
        status = LabReadIoctlInput(request, &input, sizeof(ULONG));
        if (NT_SUCCESS(status)) {
            ULONG flags = *(ULONG*)input;
            ExAcquireFastMutex(&g_mutex);
            if (flags & SERIAL_PURGE_RXCLEAR) {
                port->head = 0; port->used = 0;
            }
            ExReleaseFastMutex(&g_mutex);
        }
        break;
    // Deliberately not pretending to support flow control or WaitCommEvent yet.
    default: break;
    }
    WdfRequestCompleteWithInformation(request, status, information);
}

VOID LabEvtCleanup(WDFOBJECT object) {
    WDFDEVICE device = (WDFDEVICE)object;
    LAB_DEVICE_CONTEXT* ctx = LabGetContext(device);
    ExAcquireFastMutex(&g_mutex);
    g_port[ctx->side].active = FALSE;
    g_port[ctx->side].device = NULL;
    g_port[ctx->side].readQueue = NULL;
    g_port[ctx->side].used = 0;
    g_port[ctx->side].head = 0;
    ExReleaseFastMutex(&g_mutex);
    {
        WDFKEY key = NULL;
        NTSTATUS mapStatus;
        DECLARE_CONST_UNICODE_STRING(mapName, L"SERIALCOMM");
        DECLARE_CONST_UNICODE_STRING(mapA, L"\\Device\\LabSerialA");
        DECLARE_CONST_UNICODE_STRING(mapB, L"\\Device\\LabSerialB");
        mapStatus = WdfDeviceOpenDevicemapKey(device, &mapName, KEY_SET_VALUE,
                        WDF_NO_OBJECT_ATTRIBUTES, &key);
        if (NT_SUCCESS(mapStatus)) {
            (VOID)WdfRegistryRemoveValue(key, ctx->side == 0 ? &mapA : &mapB);
            WdfRegistryClose(key);
        }
    }
}

NTSTATUS LabEvtDeviceAdd(WDFDRIVER driver, PWDFDEVICE_INIT init) {
    WCHAR hardwareIds[256] = {0};
    ULONG actualSize = 0;
    ULONG side;
    NTSTATUS status;
    WDFDEVICE device = NULL;
    WDFQUEUE queue = NULL, manual = NULL;
    WDF_OBJECT_ATTRIBUTES attributes;
    WDF_IO_QUEUE_CONFIG config;
    WDFKEY mapKey = NULL;
    DECLARE_CONST_UNICODE_STRING(mapName, L"SERIALCOMM");
    DECLARE_CONST_UNICODE_STRING(mappedA, L"COM210");
    DECLARE_CONST_UNICODE_STRING(mappedB, L"COM211");
    DECLARE_CONST_UNICODE_STRING(nameA, L"\\Device\\LabSerialA");
    DECLARE_CONST_UNICODE_STRING(nameB, L"\\Device\\LabSerialB");
    DECLARE_CONST_UNICODE_STRING(linkA, L"\\DosDevices\\COM210");
    DECLARE_CONST_UNICODE_STRING(linkB, L"\\DosDevices\\COM211");
    UNREFERENCED_PARAMETER(driver);

    status = WdfFdoInitQueryProperty(init, DevicePropertyHardwareID,
        sizeof(hardwareIds), hardwareIds, &actualSize);
    if (!NT_SUCCESS(status)) return status;
    {
        UNICODE_STRING actual, expectedA, expectedB;
        RtlInitUnicodeString(&actual, hardwareIds);
        RtlInitUnicodeString(&expectedA, L"ROOT\\LABSERIAL_VCOM_A");
        RtlInitUnicodeString(&expectedB, L"ROOT\\LABSERIAL_VCOM_B");
        if (RtlEqualUnicodeString(&actual, &expectedA, TRUE)) side = 0;
        else if (RtlEqualUnicodeString(&actual, &expectedB, TRUE)) side = 1;
        else return STATUS_NOT_SUPPORTED;
    }

    WdfDeviceInitSetDeviceType(init, FILE_DEVICE_SERIAL_PORT);
    WdfDeviceInitSetIoType(init, WdfDeviceIoBuffered);
    WdfDeviceInitSetExclusive(init, TRUE);
    status = WdfDeviceInitAssignName(init, side == 0 ? &nameA : &nameB);
    if (!NT_SUCCESS(status)) return status;

    WDF_OBJECT_ATTRIBUTES_INIT_CONTEXT_TYPE(&attributes, LAB_DEVICE_CONTEXT);
    attributes.ExecutionLevel = WdfExecutionLevelPassive;
    attributes.EvtCleanupCallback = LabEvtCleanup;
    status = WdfDeviceCreate(&init, &attributes, &device);
    if (!NT_SUCCESS(status)) return status;
    LabGetContext(device)->side = side;

    status = WdfDeviceCreateSymbolicLink(device, side == 0 ? &linkA : &linkB);
    if (!NT_SUCCESS(status)) return status;
    status = WdfDeviceCreateDeviceInterface(device, &GUID_DEVINTERFACE_COMPORT, NULL);
    if (!NT_SUCCESS(status)) return status;

    WDF_IO_QUEUE_CONFIG_INIT_DEFAULT_QUEUE(&config, WdfIoQueueDispatchParallel);
    config.EvtIoRead = LabEvtRead;
    config.EvtIoWrite = LabEvtWrite;
    config.EvtIoDeviceControl = LabEvtIoctl;
    status = WdfIoQueueCreate(device, &config, WDF_NO_OBJECT_ATTRIBUTES, &queue);
    if (!NT_SUCCESS(status)) return status;
    WDF_IO_QUEUE_CONFIG_INIT(&config, WdfIoQueueDispatchManual);
    status = WdfIoQueueCreate(device, &config, WDF_NO_OBJECT_ATTRIBUTES, &manual);
    if (!NT_SUCCESS(status)) return status;

    ExAcquireFastMutex(&g_mutex);
    if (g_port[side].active) status = STATUS_OBJECT_NAME_COLLISION;
    else {
        g_port[side].active = TRUE;
        g_port[side].device = device;
        g_port[side].readQueue = manual;
        g_port[side].head = 0;
        g_port[side].used = 0;
        g_port[side].baudRate = 9600;
        g_port[side].line.WordLength = 8;
        g_port[side].line.Parity = 0;
        g_port[side].line.StopBits = 0;
        RtlZeroMemory(&g_port[side].timeouts, sizeof(SERIAL_TIMEOUTS));
        g_port[side].waitMask = 0;
        RtlZeroMemory(&g_port[side].handflow, sizeof(SERIAL_HANDFLOW));
        RtlZeroMemory(&g_port[side].chars, sizeof(SERIAL_CHARS));
        g_port[side].chars.XonChar = 0x11;
        g_port[side].chars.XoffChar = 0x13;
        g_port[side].modemControl = 0;
    }
    ExReleaseFastMutex(&g_mutex);
    if (!NT_SUCCESS(status)) return status;

    // Legacy serial enumeration map for tooling that enumerates SERIALCOMM.
    status = WdfDeviceOpenDevicemapKey(device, &mapName, KEY_SET_VALUE,
                                      WDF_NO_OBJECT_ATTRIBUTES, &mapKey);
    if (!NT_SUCCESS(status)) return status;
    status = WdfRegistryAssignUnicodeString(mapKey,
                 side == 0 ? &nameA : &nameB,
                 side == 0 ? &mappedA : &mappedB);
    WdfRegistryClose(mapKey);
    return status;
}

NTSTATUS DriverEntry(PDRIVER_OBJECT driverObject, PUNICODE_STRING registryPath) {
    WDF_DRIVER_CONFIG config;
    ExInitializeFastMutex(&g_mutex);
    RtlZeroMemory(g_port, sizeof(g_port));
    WDF_DRIVER_CONFIG_INIT(&config, LabEvtDeviceAdd);
    return WdfDriverCreate(driverObject, registryPath,
        WDF_NO_OBJECT_ATTRIBUTES, &config, WDF_NO_HANDLE);
}
