using System;
using System.IO;
using System.Drawing;
using System.Drawing.Imaging;
using System.Linq;
using System.Windows.Forms;

namespace LabSerial.Setup;

internal static class Program
{
    private static System.Collections.Generic.IEnumerable<Control> Descendants(Control parent)
    {
        foreach (Control child in parent.Controls)
        {
            yield return child;
            foreach (Control inner in Descendants(child)) yield return inner;
        }
    }

    private static void Capture(Form form, string filename)
    {
        Control[] descendants = Descendants(form).ToArray();
        var settings = descendants.OfType<GroupBox>().FirstOrDefault(g => g.Text == "Configurações do Par")
            ?? throw new InvalidOperationException("Settings group missing from classic layout");
        var bottomLimit = settings.RectangleToScreen(settings.ClientRectangle).Bottom;
        foreach (var checkbox in Descendants(settings).OfType<CheckBox>())
        {
            if (checkbox.RectangleToScreen(checkbox.ClientRectangle).Bottom > bottomLimit - 1)
                throw new InvalidOperationException(
                    "Settings checkbox clipped by viewport: " + checkbox.Text + " at " + form.Size);
        }
        var footer = descendants.OfType<StatusStrip>().FirstOrDefault()
            ?? throw new InvalidOperationException("Classic footer status bar missing");
        if (footer.RectangleToScreen(footer.ClientRectangle).Bottom >
            form.RectangleToScreen(form.ClientRectangle).Bottom)
            throw new InvalidOperationException("Footer extends beyond form client bounds");
        var toolbar = descendants.OfType<ToolStrip>().FirstOrDefault(t =>
            t.Items.Cast<ToolStripItem>().Any(x => x.Text == "Console"))
            ?? throw new InvalidOperationException("Classic toolbar not found");
        var console = toolbar.Items.Cast<ToolStripItem>().First(x => x.Text == "Console");
        if (console.Placement != ToolStripItemPlacement.Main)
            throw new InvalidOperationException("Console toolbar button overflowed at " + form.Size);
        using var image = new Bitmap(form.Width, form.Height);
        form.DrawToBitmap(image, new Rectangle(Point.Empty, form.Size));
        image.Save(Path.Combine(Path.GetTempPath(), filename), ImageFormat.Png);
    }

    [STAThread]
    private static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        // Safe CI smoke: instantiate and lay out WinForms controls, then run
        // inventory only. Never open COM ports, spawn serial probes, or mutate PnP.
        if (args.Any(a => string.Equals(a, "--selftest", StringComparison.OrdinalIgnoreCase)))
        {
            var report = Path.Combine(Path.GetTempPath(), "LabSerial-Setup-selftest.txt");
            try
            {
                using var form = new MainForm();
                form.CreateControl();
                form.PerformLayout();
                if (form.Controls.Count == 0)
                    throw new InvalidOperationException("Main form controls are missing");
                if (args.Any(a => string.Equals(a, "--capture", StringComparison.OrdinalIgnoreCase)))
                {
                    // Render without kernel driver or COM I/O on the isolated Windows runner.
                    form.Show();
                    Application.DoEvents();
                    System.Threading.Thread.Sleep(250);
                    Application.DoEvents();
                    Capture(form, "LabSerial-Setup-selftest.png");
                    // Additional constrained notebook layout under 1024px wide.
                    form.Size = new Size(940, 650);
                    Application.DoEvents();
                    form.PerformLayout();
                    Application.DoEvents();
                    Capture(form, "LabSerial-Setup-selftest-compact.png");
                    form.Hide();
                }
                var current = LabSerialInventory.Read();
                File.WriteAllText(report, "PASS: WinForms controls constructed and inventory completed.\r\n" +
                    "Driver identity verified: " + current.Ready + "\r\n" +
                    "No COM port was opened. No kernel configuration was changed.\r\n");
                Environment.ExitCode = 0;
            }
            catch (Exception e)
            {
                File.WriteAllText(report, "FAIL: " + e.ToString());
                Environment.ExitCode = 2;
            }
            return;
        }

        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) =>
            MessageBox.Show(e.Exception.Message, "LabSerial Setup — erro",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        Application.Run(new MainForm());
    }
}
