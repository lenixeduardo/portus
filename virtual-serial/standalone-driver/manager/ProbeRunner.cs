using System.Diagnostics;
using System.Security.Principal;
using System.Text;

namespace LabSerial.Setup;

internal sealed record ProbeResult(bool Passed, int ExitCode, string Output, string Error);

internal static class ProbeRunner
{
    internal static bool IsElevated()
    {
        using var identity = WindowsIdentity.GetCurrent();
        return new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
    }

    internal static async Task<ProbeResult> ExecuteAsync(string script, int timeoutSeconds,
        int? baudRate, CancellationToken cancellationToken)
    {
        string path = Path.Combine(AppContext.BaseDirectory, "Scripts", script);
        if (!File.Exists(path))
            return new ProbeResult(false, -1, "", "Script do pacote ausente: " + path);

        string shell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),
            "WindowsPowerShell", "v1.0", "powershell.exe");
        var psi = new ProcessStartInfo(shell)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
            WorkingDirectory = Path.GetDirectoryName(path)!
        };
        psi.ArgumentList.Add("-NoLogo");
        psi.ArgumentList.Add("-NoProfile");
        psi.ArgumentList.Add("-NonInteractive");
        psi.ArgumentList.Add("-File");
        psi.ArgumentList.Add(path);
        if (baudRate.HasValue)
        {
            psi.ArgumentList.Add("-BaudRate");
            psi.ArgumentList.Add(baudRate.Value.ToString(System.Globalization.CultureInfo.InvariantCulture));
        }
        psi.ArgumentList.Add("-ConfirmDedicatedNonProductionPC");
        psi.ArgumentList.Add("-ConfirmPortsAreLabSerial");

        using var proc = new Process { StartInfo = psi };
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(timeoutSeconds));
        try
        {
            if (!proc.Start())
                return new ProbeResult(false, -1, "", "Não foi possível iniciar o processo de testes.");
            Task<string> stdout = proc.StandardOutput.ReadToEndAsync();
            Task<string> stderr = proc.StandardError.ReadToEndAsync();
            try
            {
                await proc.WaitForExitAsync(timeout.Token);
            }
            catch (OperationCanceledException)
            {
                try { if (!proc.HasExited) proc.Kill(entireProcessTree: true); } catch { }
                await Task.WhenAll(stdout, stderr).WaitAsync(TimeSpan.FromSeconds(3));
                return new ProbeResult(false, -2, stdout.Result,
                    cancellationToken.IsCancellationRequested ? "Teste cancelado." :
                        $"TIMEOUT após {timeoutSeconds}s. O watchdog não protege contra BSOD.");
            }
            string output = await stdout;
            string errors = await stderr;
            return new ProbeResult(proc.ExitCode == 0 && output.Contains("PASS FINAL:", StringComparison.Ordinal),
                proc.ExitCode, output, errors);
        }
        catch (Exception e)
        {
            return new ProbeResult(false, -3, "", e.Message);
        }
    }
}
