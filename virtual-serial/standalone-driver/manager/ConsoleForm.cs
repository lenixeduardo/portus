using System.Drawing;
using System.Windows.Forms;

namespace LabSerial.Setup;

/// <summary>Independent console window, with no direct kernel I/O.</summary>
internal sealed class ConsoleForm : Form
{
    private readonly TextBox _output = new()
    {
        Multiline = true, ReadOnly = true, Dock = DockStyle.Fill,
        ScrollBars = ScrollBars.Both, WordWrap = false, BackColor = Color.FromArgb(18, 24, 31),
        ForeColor = Color.FromArgb(228, 237, 240), Font = new Font("Consolas", 9.5f)
    };

    internal ConsoleForm(string initial)
    {
        Text = "LabSerial Setup — Console de diagnóstico";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(840, 540);
        MinimumSize = new Size(600, 360);
        var bar = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom, Height = 44, FlowDirection = FlowDirection.RightToLeft,
            Padding = new Padding(9, 6, 9, 6)
        };
        var copy = new Button { Text = "Copiar", Width = 100 };
        copy.Click += (_, _) =>
        {
            if (_output.Text.Length > 0) Clipboard.SetText(_output.Text);
        };
        var save = new Button { Text = "Exportar TXT", Width = 120 };
        save.Click += (_, _) =>
        {
            using var dialog = new SaveFileDialog { Filter = "Texto (*.txt)|*.txt", FileName = "LabSerial-Console.txt" };
            if (dialog.ShowDialog(this) == DialogResult.OK) File.WriteAllText(dialog.FileName, _output.Text);
        };
        bar.Controls.Add(copy);
        bar.Controls.Add(save);
        Controls.Add(_output);
        Controls.Add(bar);
        _output.Text = initial;
    }

    internal void Append(string line)
    {
        if (IsDisposed) return;
        _output.AppendText(line + Environment.NewLine);
    }
}
