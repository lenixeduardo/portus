using System;
using System.IO;
using System.Linq;
using System.Windows.Forms;

namespace LabSerial.Setup;

internal static class Program
{
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
