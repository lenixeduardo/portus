// PORTUS Virtual Serial - Phase 1 WDF/UMDF 2 adapter scaffold.
// Original implementation. NOT a functional COM driver yet.
// Deliberately fails I/O instead of pretending that bytes were transmitted.
// Requires Windows SDK/WDK; not compiled in this Linux environment.
#include <windows.h>
#include <wdf.h>

static const GUID GUID_DEVINTERFACE_PORTUS_VSERIAL =
{ 0x190ab763, 0x8324, 0x4d87, { 0x9f, 0xd2, 0x68, 0xba, 0x19, 0x94, 0xb5, 0x71 } };

EVT_WDF_DRIVER_DEVICE_ADD PortusEvtDeviceAdd;
EVT_WDF_IO_QUEUE_IO_READ PortusEvtIoRead;
EVT_WDF_IO_QUEUE_IO_WRITE PortusEvtIoWrite;
EVT_WDF_IO_QUEUE_IO_DEVICE_CONTROL PortusEvtIoControl;

extern "C" NTSTATUS DriverEntry(
    _In_ PDRIVER_OBJECT driver_object, _In_ PUNICODE_STRING registry_path) {
    WDF_DRIVER_CONFIG config;
    WDF_DRIVER_CONFIG_INIT(&config, PortusEvtDeviceAdd);
    return WdfDriverCreate(driver_object, registry_path,
                           WDF_NO_OBJECT_ATTRIBUTES, &config, WDF_NO_HANDLE);
}

NTSTATUS PortusEvtDeviceAdd(
    _In_ WDFDRIVER driver, _Inout_ PWDFDEVICE_INIT device_init) {
    UNREFERENCED_PARAMETER(driver);
    WDFDEVICE device = nullptr;
    NTSTATUS status = WdfDeviceCreate(&device_init, WDF_NO_OBJECT_ATTRIBUTES, &device);
    if (!NT_SUCCESS(status)) return status;

    status = WdfDeviceCreateDeviceInterface(device, &GUID_DEVINTERFACE_PORTUS_VSERIAL, nullptr);
    if (!NT_SUCCESS(status)) return status;

    WDF_IO_QUEUE_CONFIG config;
    WDF_IO_QUEUE_CONFIG_INIT_DEFAULT_QUEUE(&config, WdfIoQueueDispatchParallel);
    config.EvtIoRead = PortusEvtIoRead;
    config.EvtIoWrite = PortusEvtIoWrite;
    config.EvtIoDeviceControl = PortusEvtIoControl;
    return WdfIoQueueCreate(device, &config, WDF_NO_OBJECT_ATTRIBUTES, WDF_NO_HANDLE);
}

void PortusEvtIoRead(_In_ WDFQUEUE queue, _In_ WDFREQUEST request, _In_ size_t length) {
    UNREFERENCED_PARAMETER(queue);
    UNREFERENCED_PARAMETER(length);
    WdfRequestComplete(request, STATUS_NOT_IMPLEMENTED);
}

void PortusEvtIoWrite(_In_ WDFQUEUE queue, _In_ WDFREQUEST request, _In_ size_t length) {
    UNREFERENCED_PARAMETER(queue);
    UNREFERENCED_PARAMETER(length);
    WdfRequestComplete(request, STATUS_NOT_IMPLEMENTED);
}

void PortusEvtIoControl(
    _In_ WDFQUEUE queue, _In_ WDFREQUEST request,
    _In_ size_t output_length, _In_ size_t input_length, _In_ ULONG control_code) {
    UNREFERENCED_PARAMETER(queue);
    UNREFERENCED_PARAMETER(output_length);
    UNREFERENCED_PARAMETER(input_length);
    UNREFERENCED_PARAMETER(control_code);
    WdfRequestComplete(request, STATUS_NOT_SUPPORTED);
}
