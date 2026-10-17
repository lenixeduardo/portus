using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;

namespace LabSerial.Setup;

/// <summary>Original LabSerial triangular red "A" mark, drawn locally without external assets.</summary>
internal static class LabSerialBrand
{
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DestroyIcon(IntPtr handle);

    internal static Icon MakeIcon()
    {
        using var image = new Bitmap(64, 64);
        using (var g = Graphics.FromImage(image))
        using (var red = new SolidBrush(Color.FromArgb(207, 53, 65)))
        using (var white = new SolidBrush(Color.Transparent))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Color.Transparent);
            g.FillPolygon(red, new[] {
                new Point(32, 4), new Point(62, 56), new Point(45, 56),
                new Point(39, 44), new Point(25, 44), new Point(19, 56),
                new Point(2, 56)
            });
            g.CompositingMode = CompositingMode.SourceCopy;
            g.FillPolygon(white, new[] {
                new Point(32, 20), new Point(39, 36), new Point(25, 36)
            });
        }
        var handle = image.GetHicon();
        try
        {
            using var icon = Icon.FromHandle(handle);
            return (Icon)icon.Clone();
        }
        finally
        {
            DestroyIcon(handle);
        }
    }
}
