using System.Drawing;

namespace LabSerial.Setup;

/// <summary>Shared SerialLab icon for application windows and packaged executables.</summary>
internal static class LabSerialBrand
{
    internal static Icon MakeIcon()
    {
        using var stream = typeof(LabSerialBrand).Assembly.GetManifestResourceStream("SerialLab.ico")
            ?? throw new InvalidOperationException("SerialLab icon resource is missing.");
        using var icon = new Icon(stream);
        return (Icon)icon.Clone();
    }
}
