using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace LabSerial.Setup;

/// <summary>Deterministic DPI-friendly vector toolbar glyphs (no external fonts or downloads).</summary>
internal static class LabSerialUiArt
{
    internal static Bitmap Icon(string symbol, Color foreground)
    {
        var image = new Bitmap(28, 28);
        using var g = Graphics.FromImage(image);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(Color.Transparent);
        using var pen = new Pen(foreground, 2.8f)
        { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round };
        using var fill = new SolidBrush(foreground);
        switch (symbol)
        {
            case "✚":
                using (var tile = new SolidBrush(Color.FromArgb(64, 170, 59)))
                    g.FillRoundedRectangle(tile, new Rectangle(3, 3, 22, 22), 4);
                using (var white = new Pen(Color.White, 3.2f) { StartCap = LineCap.Round, EndCap = LineCap.Round })
                { g.DrawLine(white, 14, 8, 14, 20); g.DrawLine(white, 8, 14, 20, 14); }
                break;
            case "✖":
                g.DrawLine(pen, 7, 7, 21, 21);
                g.DrawLine(pen, 21, 7, 7, 21);
                break;
            case "⚙":
                for (int i = 0; i < 8; i++)
                {
                    double a = i * Math.PI / 4;
                    g.DrawLine(pen, (float)(14 + 8 * Math.Cos(a)), (float)(14 + 8 * Math.Sin(a)),
                        (float)(14 + 11 * Math.Cos(a)), (float)(14 + 11 * Math.Sin(a)));
                }
                g.DrawEllipse(pen, 7, 7, 14, 14);
                g.DrawEllipse(pen, 11, 11, 6, 6);
                break;
            case "⟳":
                g.DrawArc(pen, 5, 5, 17, 17, 36, 280);
                g.DrawLines(pen, new[] { new Point(21, 6), new Point(22, 13), new Point(15, 12) });
                break;
            case "✓":
                g.DrawLines(pen, new[] { new Point(5, 14), new Point(11, 20), new Point(23, 7) });
                break;
            case "▶":
                g.FillPolygon(fill, new[] { new Point(8, 5), new Point(23, 14), new Point(8, 23) });
                break;
            case "⇄":
                g.DrawLine(pen, 4, 10, 23, 10);
                g.DrawLines(pen, new[] { new Point(17, 5), new Point(23, 10), new Point(17, 15) });
                g.DrawLine(pen, 24, 19, 5, 19);
                g.DrawLines(pen, new[] { new Point(11, 14), new Point(5, 19), new Point(11, 24) });
                break;
            case "●":
                g.FillEllipse(fill, 6, 6, 16, 16);
                using (var white = new Pen(Color.White, 1.8f))
                    g.DrawArc(white, 10, 10, 8, 8, 40, 180);
                break;
            default: // console icon
                g.DrawRectangle(pen, 4, 5, 20, 18);
                g.DrawLines(pen, new[] { new Point(8, 11), new Point(12, 14), new Point(8, 17) });
                g.DrawLine(pen, 14, 18, 20, 18);
                break;
        }
        return image;
    }

    internal static void InstallClassicPairRenderer(ListView pairs)
    {
        pairs.OwnerDraw = true;
        pairs.GridLines = false;
        pairs.DrawColumnHeader += (_, e) => e.DrawDefault = true;
        pairs.DrawItem += (_, e) => { /* Details view is drawn per sub-item. */ };
        pairs.DrawSubItem += (_, e) =>
        {
            if (e.Item == null) return;
            var bounds = e.Bounds;
            bool selected = e.Item.Selected;
            var bg = selected ? SystemColors.Highlight : (e.ItemIndex % 2 == 0 ? Color.White : Color.FromArgb(250, 250, 250));
            using (var brush = new SolidBrush(bg))
                e.Graphics.FillRectangle(brush, bounds);
            using (var grid = new Pen(Color.FromArgb(233, 233, 233)))
            {
                e.Graphics.DrawLine(grid, bounds.Right - 1, bounds.Top, bounds.Right - 1, bounds.Bottom);
                e.Graphics.DrawLine(grid, bounds.Left, bounds.Bottom - 1, bounds.Right, bounds.Bottom - 1);
            }
            var color = selected ? Color.White : Color.FromArgb(36, 41, 50);
            var target = new Rectangle(bounds.X + 7, bounds.Y, Math.Max(1, bounds.Width - 10), bounds.Height);
            string text = e.SubItem?.Text ?? "";
            if (e.ColumnIndex == 3 && text.StartsWith("Ativo", StringComparison.Ordinal))
            {
                using var dot = new SolidBrush(Color.FromArgb(38, 183, 72));
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                int diameter = Math.Max(8, Math.Min(11, bounds.Height - 5));
                e.Graphics.FillEllipse(dot, target.Left, bounds.Top + (bounds.Height - diameter) / 2, diameter, diameter);
                target.X += diameter + 6;
                target.Width = Math.Max(1, target.Width - diameter - 6);
            }
            TextRenderer.DrawText(e.Graphics, text, pairs.Font, target, color,
                TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis |
                TextFormatFlags.NoPadding | TextFormatFlags.SingleLine);
        };
    }
}
