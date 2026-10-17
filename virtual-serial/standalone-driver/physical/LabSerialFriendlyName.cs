// LabSerial: SetupAPI friendly-name update for root-enumerated PnP devices.
// Does NOT change HardwareIds, PortName, kernel COM symbolic links, or drivers.
// Called only after PowerShell has validated the exact LabSerial hardware IDs.
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

public static class LabSerialFriendlyName
{
    private const int DIGCF_ALLCLASSES = 0x4;
    private const uint SPDRP_FRIENDLYNAME = 0x0000000C;
    [StructLayout(LayoutKind.Sequential)]
    private struct SP_DEVINFO_DATA {
        public uint cbSize;
        public Guid ClassGuid;
        public uint DevInst;
        public IntPtr Reserved;
    }

    [DllImport("setupapi.dll", EntryPoint="SetupDiGetClassDevsW",
        CharSet=CharSet.Unicode, SetLastError=true)]
    private static extern IntPtr SetupDiGetClassDevs(
        IntPtr classGuid, string enumerator, IntPtr hwndParent, uint flags);

    [DllImport("setupapi.dll", EntryPoint="SetupDiOpenDeviceInfoW",
        CharSet=CharSet.Unicode, SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetupDiOpenDeviceInfo(
        IntPtr deviceInfoSet, string instanceId, IntPtr hwndParent,
        uint openFlags, ref SP_DEVINFO_DATA deviceInfoData);

    [DllImport("setupapi.dll", EntryPoint="SetupDiSetDeviceRegistryPropertyW",
        SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetupDiSetDeviceRegistryProperty(
        IntPtr deviceInfoSet, ref SP_DEVINFO_DATA deviceInfoData,
        uint property, byte[] propertyBuffer, uint propertyBufferSize);

    [DllImport("setupapi.dll", SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetupDiDestroyDeviceInfoList(IntPtr deviceInfoSet);

    public static void SetName(string instanceId, string newName) {
        if (String.IsNullOrWhiteSpace(instanceId) ||
            !instanceId.StartsWith(@"ROOT\DEVGEN\", StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Only LabSerial-verified ROOT DEVGEN instance IDs are permitted.");
        if (String.IsNullOrWhiteSpace(newName) || newName.Length > 180 ||
            !newName.StartsWith("LabSerial Virtual Serial Port ", StringComparison.Ordinal))
            throw new ArgumentException("New friendly name must identify LabSerial.");
        IntPtr infoSet = SetupDiGetClassDevs(IntPtr.Zero, null, IntPtr.Zero, DIGCF_ALLCLASSES);
        if (infoSet == new IntPtr(-1))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "SetupDiGetClassDevs");
        try {
            SP_DEVINFO_DATA deviceInfo = new SP_DEVINFO_DATA();
            deviceInfo.cbSize = (uint)Marshal.SizeOf(typeof(SP_DEVINFO_DATA));
            if (!SetupDiOpenDeviceInfo(infoSet, instanceId, IntPtr.Zero, 0, ref deviceInfo))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "SetupDiOpenDeviceInfo");
            byte[] bytes = Encoding.Unicode.GetBytes(newName + "\0");
            if (!SetupDiSetDeviceRegistryProperty(infoSet, ref deviceInfo,
                SPDRP_FRIENDLYNAME, bytes, (uint)bytes.Length))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "SetupDiSetDeviceRegistryProperty(FriendlyName)");
        } finally {
            SetupDiDestroyDeviceInfoList(infoSet);
        }
    }
}
