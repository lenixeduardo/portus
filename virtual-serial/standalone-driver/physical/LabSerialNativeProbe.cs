// ORIGINAL LabSerial experimental Win32 serial diagnostic (not a kernel driver).
// Native overlapped I/O avoids SerialPort.Open/SetCommState preconditions which
// depend on serial IOCTLs the MVP driver does not yet implement.
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
using System.Text;

public sealed class LabSerialNativeExchange {
    public int Written { get; set; }
    public byte[] Received { get; set; }
    public long DurationMs { get; set; }
}
public static class LabSerialNativeProbe {
    private const uint GENERIC_READ = 0x80000000;
    private const uint GENERIC_WRITE = 0x40000000;
    private const uint OPEN_EXISTING = 3;
    private const uint FILE_FLAG_OVERLAPPED = 0x40000000;
    private const int ERROR_IO_PENDING = 997;
    private const uint WAIT_OBJECT_0 = 0;
    private const uint WAIT_TIMEOUT = 258;

    [StructLayout(LayoutKind.Sequential)]
    private struct OverlappedState {
        public IntPtr Internal;
        public IntPtr InternalHigh;
        public uint Offset;
        public uint OffsetHigh;
        public IntPtr Event;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFile(string name, uint access,
        uint share, IntPtr security, uint creation, uint flags, IntPtr templateFile);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint QueryDosDevice(string name, StringBuilder result, int size);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr CreateEvent(IntPtr attributes, bool manualReset, bool initialState, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseHandle(IntPtr handle);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool WriteFile(SafeFileHandle handle, IntPtr buffer,
        uint length, out uint written, IntPtr overlapped);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ReadFile(SafeFileHandle handle, IntPtr buffer,
        uint length, out uint read, IntPtr overlapped);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetOverlappedResult(SafeFileHandle handle, IntPtr overlapped,
        out uint transferred, bool wait);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CancelIoEx(SafeFileHandle handle, IntPtr overlapped);

    public static string ResolveLink(string port) {
        var s = new StringBuilder(4096);
        if (QueryDosDevice(port, s, s.Capacity) == 0)
            throw new Win32Exception(Marshal.GetLastWin32Error(), "QueryDosDevice(" + port + ")");
        var value = s.ToString();
        int nul = value.IndexOf('\0');
        return nul >= 0 ? value.Substring(0, nul) : value;
    }

    private static SafeFileHandle OpenPort(string port) {
        if (port != "COM210" && port != "COM211")
            throw new ArgumentException("Only COM210/COM211 are permitted in this experimental test.");
        SafeFileHandle h = CreateFile(@"\\.\" + port, GENERIC_READ | GENERIC_WRITE, 0,
            IntPtr.Zero, OPEN_EXISTING, FILE_FLAG_OVERLAPPED, IntPtr.Zero);
        if (h.IsInvalid) {
            int err = Marshal.GetLastWin32Error();
            h.Dispose();
            throw new Win32Exception(err, "CreateFile(" + port + ")");
        }
        return h;
    }

    private static int IO(SafeFileHandle handle, byte[] bytes, int offset, int count,
        int timeoutMs, bool isWrite) {
        if (count <= 0 || count > 4096 || timeoutMs < 1000 || timeoutMs > 30000)
            throw new ArgumentOutOfRangeException("Invalid native I/O length or timeout");
        IntPtr native = Marshal.AllocHGlobal(count);
        IntPtr eventHandle = IntPtr.Zero;
        IntPtr overlapped = IntPtr.Zero;
        bool completed = true;
        try {
            if (isWrite) Marshal.Copy(bytes, offset, native, count);
            eventHandle = CreateEvent(IntPtr.Zero, true, false, null);
            if (eventHandle == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error(), "CreateEvent");
            overlapped = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(OverlappedState)));
            OverlappedState state = new OverlappedState();
            state.Event = eventHandle;
            Marshal.StructureToPtr(state, overlapped, false);
            uint done;
            bool ok;
            if (isWrite) ok = WriteFile(handle, native, (uint)count, out done, overlapped);
            else ok = ReadFile(handle, native, (uint)count, out done, overlapped);
            if (!ok) {
                int err = Marshal.GetLastWin32Error();
                if (err != ERROR_IO_PENDING) throw new Win32Exception(err, isWrite ? "WriteFile" : "ReadFile");
                completed = false;
                uint wait = WaitForSingleObject(eventHandle, (uint)timeoutMs);
                if (wait != WAIT_OBJECT_0) {
                    // Cancels this specific overlapped request, not unrelated I/O.
                    CancelIoEx(handle, overlapped);
                    uint cancelWait = WaitForSingleObject(eventHandle, 1500);
                    completed = cancelWait == WAIT_OBJECT_0;
                    if (wait == WAIT_TIMEOUT) throw new TimeoutException("Serial I/O exceeded " + timeoutMs + " ms; pending request was cancelled.");
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "WaitForSingleObject");
                }
                completed = true;
                if (!GetOverlappedResult(handle, overlapped, out done, false))
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "GetOverlappedResult");
            }
            if (!isWrite && done > 0) Marshal.Copy(native, bytes, offset, (int)done);
            return checked((int)done);
        } finally {
            // If Windows has not completed a pending request, intentionally keep
            // unmanaged resources alive until the outer watchdog ends the process.
            if (completed) {
                if (overlapped != IntPtr.Zero) Marshal.FreeHGlobal(overlapped);
                if (eventHandle != IntPtr.Zero) CloseHandle(eventHandle);
                Marshal.FreeHGlobal(native);
            }
        }
    }

    public static LabSerialNativeExchange Exchange(string sender, string receiver,
        byte[] payload, int timeoutMs) {
        if (payload == null || payload.Length == 0 || payload.Length > 1024)
            throw new ArgumentException("Payload must contain 1 to 1024 bytes.");
        if (!((sender == "COM210" && receiver == "COM211") ||
              (sender == "COM211" && receiver == "COM210")))
            throw new ArgumentException("Only LabSerial A/B in opposite directions are allowed.");
        using (SafeFileHandle tx = OpenPort(sender))
        using (SafeFileHandle rx = OpenPort(receiver)) {
            Stopwatch clock = Stopwatch.StartNew();
            int written = IO(tx, payload, 0, payload.Length, timeoutMs, true);
            if (written != payload.Length)
                throw new InvalidOperationException("Partial write: " + written + "/" + payload.Length);
            byte[] received = new byte[payload.Length];
            int total = 0;
            while (total < received.Length) {
                int read = IO(rx, received, total, received.Length - total, timeoutMs, false);
                if (read <= 0) throw new InvalidOperationException("ReadFile returned zero bytes.");
                total += read;
            }
            clock.Stop();
            return new LabSerialNativeExchange {
                Written = written, Received = received, DurationMs = clock.ElapsedMilliseconds
            };
        }
    }
}
