using Microsoft.Win32;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

namespace LabSerial.Setup;

/// <summary>Read-only, fail-closed inventory. No arbitrary COM port may be opened.</summary>
internal static class LabSerialInventory
{
    internal const string InstanceA = @"ROOT\DEVGEN\{92205F30-ECF7-DF4F-BB04-D1B13C89502E}";
    internal const string InstanceB = @"ROOT\DEVGEN\{CAF11815-BCE7-EA4E-90F6-F3C2758EB0F8}";
    private const uint DnStarted = 0x00000008;

    [DllImport("cfgmgr32.dll", CharSet = CharSet.Unicode, EntryPoint = "CM_Locate_DevNodeW")]
    private static extern int LocateDevNode(out uint devInst, string deviceId, uint flags);

    [DllImport("cfgmgr32.dll", EntryPoint = "CM_Get_DevNode_Status")]
    private static extern int GetDevNodeStatus(out uint status, out uint problem, uint devInst, uint flags);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, EntryPoint = "QueryDosDeviceW", SetLastError = true)]
    private static extern uint QueryDosDevice(string name, StringBuilder target, uint maxChars);

    internal sealed record Endpoint(
        string Label, string Port, string InstanceId, string HardwareId, string KernelPath,
        bool Verified, string PnpStatus, string Reason, string FriendlyName);

    internal sealed record Snapshot(Endpoint A, Endpoint B, DateTimeOffset CheckedAt)
    {
        public bool Ready => A.Verified && B.Verified;
        public string Status => Ready ? "Par operacional / identidade confirmada" : "Par indisponível / verificação incompleta";
    }

    internal static Snapshot Read()
    {
        using var root = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64);
        Endpoint a = ReadEndpoint(root, "A", "COM210", InstanceA, @"ROOT\LABSERIAL_VCOM_A", @"\Device\LabSerialA");
        Endpoint b = ReadEndpoint(root, "B", "COM211", InstanceB, @"ROOT\LABSERIAL_VCOM_B", @"\Device\LabSerialB");
        return new Snapshot(a, b, DateTimeOffset.Now);
    }

    private static Endpoint ReadEndpoint(RegistryKey root, string label, string port,
        string instanceId, string hardwareId, string devicePath)
    {
        var faults = new List<string>();
        string friendlyName = "Não identificado";
        string pnpState = "Desconhecido";
        try
        {
            using var device = root.OpenSubKey(@"SYSTEM\CurrentControlSet\Enum\" + instanceId);
            if (device is null)
            {
                faults.Add("Dispositivo PnP ausente");
            }
            else
            {
                friendlyName = device.GetValue("FriendlyName") as string ??
                    device.GetValue("DeviceDesc") as string ?? "LabSerial " + label;
                var ids = device.GetValue("HardwareID") as string[] ?? Array.Empty<string>();
                if (!ids.Contains(hardwareId, StringComparer.OrdinalIgnoreCase))
                    faults.Add("HardwareId não corresponde ao LabSerial");
                if (!string.Equals(device.GetValue("Service") as string, "LabSerial", StringComparison.OrdinalIgnoreCase))
                    faults.Add("Serviço não é LabSerial");
                using var parameters = device.OpenSubKey("Device Parameters");
                if (!string.Equals(parameters?.GetValue("PortName") as string, port, StringComparison.OrdinalIgnoreCase))
                    faults.Add("PortName não corresponde a " + port);
            }

            int locateResult = LocateDevNode(out uint devInst, instanceId, 0);
            if (locateResult == 0 && GetDevNodeStatus(out uint flags, out uint problem, devInst, 0) == 0)
            {
                pnpState = (flags & DnStarted) != 0 && problem == 0 ? "OK" : "Não iniciado (problema " + problem + ")";
                if (pnpState != "OK") faults.Add("PnP não iniciado");
            }
            else
            {
                pnpState = "Não encontrado";
                faults.Add("Falha ao consultar estado PnP");
            }

            using var serialMap = root.OpenSubKey(@"HARDWARE\DEVICEMAP\SERIALCOMM");
            if (!string.Equals(serialMap?.GetValue(devicePath) as string, port, StringComparison.OrdinalIgnoreCase))
                faults.Add("SERIALCOMM não corresponde à porta");
            var buffer = new StringBuilder(1024);
            if (QueryDosDevice(port, buffer, (uint)buffer.Capacity) == 0 ||
                !string.Equals(buffer.ToString(), devicePath, StringComparison.OrdinalIgnoreCase))
                faults.Add("QueryDosDevice não corresponde ao endpoint do driver");
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or Win32Exception)
        {
            faults.Add(e.Message);
        }

        return new Endpoint(label, port, instanceId, hardwareId, devicePath,
            faults.Count == 0, pnpState,
            faults.Count == 0 ? "Identidade, mapeamento e estado PnP verificados" : string.Join("; ", faults),
            friendlyName);
    }
}
