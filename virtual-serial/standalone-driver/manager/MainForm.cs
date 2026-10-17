using System.Diagnostics;
using System.Drawing;
using System.Text;
using System.Windows.Forms;

namespace LabSerial.Setup;

/// <summary>
/// com0com-style experience for the EXISTING LabSerial fixed pair.
/// Adding/removing pairs in this interface only changes workspace visibility.
/// It never creates/removes PnP nodes, edits driver registry settings or alters BCD.
/// </summary>
internal sealed class MainForm : Form
{
    private static readonly Color Accent = Color.FromArgb(155, 38, 48);
    private static readonly Color Ink = Color.FromArgb(38, 46, 56);
    private static readonly Color Muted = Color.FromArgb(99, 108, 119);
    private static readonly Color Surface = Color.FromArgb(249, 250, 252);

    private readonly ListView _pairs = new();
    private readonly TextBox _properties = new();
    private readonly TextBox _events = new();
    private readonly ToolStripStatusLabel _state = new();
    private readonly ToolStripStatusLabel _connection = new();
    private readonly Label _summary = new();
    private readonly Label _profile = new();

    private ToolStripButton _btnAdd = null!;
    private ToolStripButton _btnRemove = null!;
    private ToolStripButton _btnProperties = null!;
    private ToolStripButton _btnApply = null!;
    private ToolStripButton _btnProfile = null!;
    private ToolStripButton _btnWin32 = null!;
    private ToolStripButton _btnNet = null!;

    private LabSerialInventory.Snapshot? _snapshot;
    private ConsoleForm? _console;
    private CancellationTokenSource? _activeTest;
    private bool _showPair = true;
    private bool _busy;
    private int _selectedBaudRate = 9600;

    internal MainForm()
    {
        Text = "LabSerial Setup — Gerenciador de Portas Virtuais";
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(960, 780);
        MinimumSize = new Size(780, 620);
        Font = new Font("Segoe UI", 9.2f);
        BackColor = Surface;
        ForeColor = Ink;
        AutoScaleMode = AutoScaleMode.Dpi;

        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 5, Margin = Padding.Empty };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 47));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 88));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 26));

        var menu = BuildMenu();
        MainMenuStrip = menu;
        layout.Controls.Add(menu, 0, 0);
        layout.Controls.Add(BuildToolbar(), 0, 1);
        layout.Controls.Add(BuildHeader(), 0, 2);
        layout.Controls.Add(BuildWorkspace(), 0, 3);
        layout.Controls.Add(BuildStatus(), 0, 4);

        Controls.Add(layout);
        Shown += async (_, _) => await RefreshInventoryAsync();
        FormClosing += (_, _) => _activeTest?.Cancel();
    }

    private MenuStrip BuildMenu()
    {
        var menu = new MenuStrip
        {
            Dock = DockStyle.Fill, BackColor = Color.White, ForeColor = Ink,
            Padding = new Padding(9, 2, 9, 2)
        };

        var arquivo = new ToolStripMenuItem("Arquivo");
        arquivo.DropDownItems.Add("Exportar log...", null, (_, _) => ExportLog());
        arquivo.DropDownItems.Add(new ToolStripSeparator());
        arquivo.DropDownItems.Add("Sair", null, (_, _) => Close());

        var acao = new ToolStripMenuItem("Ação");
        acao.DropDownItems.Add("Adicionar par existente à lista", null, (_, _) => AddPair());
        acao.DropDownItems.Add("Remover par da lista", null, (_, _) => RemovePair());
        acao.DropDownItems.Add("Propriedades / Configurar teste...", null, (_, _) => OpenProperties());
        acao.DropDownItems.Add("Atualizar inventário", null, async (_, _) => await RefreshInventoryAsync());
        acao.DropDownItems.Add(new ToolStripSeparator());
        acao.DropDownItems.Add("Testar perfil selecionado", null, async (_, _) =>
            await RunTestAsync("Perfil selecionado", "Run-LabSerialProfileProbe.ps1", 45, _selectedBaudRate));
        acao.DropDownItems.Add("Teste Win32 — 6 quadros", null, async (_, _) =>
            await RunTestAsync("Win32 — 6 quadros", "Run-LabSerialEvidenceBounded.ps1", 95));
        acao.DropDownItems.Add("Teste .NET — 4 quadros", null, async (_, _) =>
            await RunTestAsync(".NET — 4 quadros", "Run-LabSerialCompatibilityBounded.ps1", 65));

        var exibir = new ToolStripMenuItem("Exibir");
        exibir.DropDownItems.Add("Console independente", null, (_, _) => ShowConsole());

        var tools = new ToolStripMenuItem("Ferramentas");
        tools.DropDownItems.Add("Abrir evidências", null, (_, _) => OpenEvidenceFolder());
        tools.DropDownItems.Add("Cancelar teste ativo", null, (_, _) => _activeTest?.Cancel());

        var help = new ToolStripMenuItem("Ajuda");
        help.DropDownItems.Add("Sobre o LabSerial Setup", null, (_, _) => ShowAbout());

        menu.Items.AddRange(new ToolStripItem[] { arquivo, acao, exibir, tools, help });
        return menu;
    }

    private ToolStrip BuildToolbar()
    {
        var toolbar = new ToolStrip
        {
            Dock = DockStyle.Fill, BackColor = Color.White, GripStyle = ToolStripGripStyle.Hidden,
            Padding = new Padding(11, 5, 11, 5), ImageScalingSize = new Size(22, 22),
            RenderMode = ToolStripRenderMode.System
        };

        _btnAdd = ToolButton("Adicionar Par", (_, _) => AddPair());
        _btnRemove = ToolButton("Remover Par", (_, _) => RemovePair());
        _btnProperties = ToolButton("Propriedades", (_, _) => OpenProperties());
        var refresh = ToolButton("Atualizar", async (_, _) => await RefreshInventoryAsync());
        _btnApply = ToolButton("Aplicar", (_, _) => OpenProperties());
        _btnProfile = ToolButton("Testar Perfil", async (_, _) =>
            await RunTestAsync("Perfil selecionado", "Run-LabSerialProfileProbe.ps1", 45, _selectedBaudRate));
        _btnWin32 = ToolButton("Testar Win32", async (_, _) =>
            await RunTestAsync("Win32 — 6 quadros", "Run-LabSerialEvidenceBounded.ps1", 95));
        _btnNet = ToolButton("Testar .NET", async (_, _) =>
            await RunTestAsync(".NET — 4 quadros", "Run-LabSerialCompatibilityBounded.ps1", 65));

        toolbar.Items.AddRange(new ToolStripItem[] {
            _btnAdd, _btnRemove, _btnProperties, refresh, _btnApply,
            new ToolStripSeparator(), _btnProfile, _btnWin32, _btnNet,
            new ToolStripSeparator(), ToolButton("Console", (_, _) => ShowConsole())
        });
        return toolbar;
    }

    private static ToolStripButton ToolButton(string caption, EventHandler onClick)
    {
        var button = new ToolStripButton(caption) { DisplayStyle = ToolStripItemDisplayStyle.Text, AutoSize = true, Margin = new Padding(3, 0, 3, 0) };
        button.Click += onClick;
        return button;
    }

    private Control BuildHeader()
    {
        var header = new Panel { Dock = DockStyle.Fill, BackColor = Color.FromArgb(32, 37, 45) };
        header.Controls.Add(new Panel { Dock = DockStyle.Left, Width = 5, BackColor = Accent });
        var name = new Label
        {
            Text = "LabSerial Setup", Font = new Font("Segoe UI Semibold", 18f, FontStyle.Bold),
            ForeColor = Color.White, AutoSize = true, Location = new Point(24, 13)
        };
        var sub = new Label
        {
            Text = "Gerenciador local do par virtual COM210 ↔ COM211",
            ForeColor = Color.FromArgb(188, 199, 209), AutoSize = true, Location = new Point(25, 54)
        };
        var experimental = new Label
        {
            Text = "EXPERIMENTAL", ForeColor = Color.FromArgb(255, 211, 212),
            BackColor = Accent, Padding = new Padding(10, 6, 10, 6), AutoSize = true, Anchor = AnchorStyles.Top | AnchorStyles.Right
        };
        header.Controls.Add(name);
        header.Controls.Add(sub);
        header.Controls.Add(experimental);
        header.Resize += (_, _) => experimental.Location = new Point(Math.Max(680, header.Width - experimental.Width - 24), 21);
        return header;
    }

    private Control BuildWorkspace()
    {
        var split = new SplitContainer
        {
            Dock = DockStyle.Fill, Orientation = Orientation.Horizontal, BackColor = Surface,
            SplitterWidth = 6, Panel1MinSize = 250, Panel2MinSize = 120
        };
        split.SplitterDistance = 405;

        var upper = new SplitContainer
        {
            Dock = DockStyle.Fill, Orientation = Orientation.Vertical, SplitterWidth = 6,
            Panel1MinSize = 350, Panel2MinSize = 220, BackColor = Surface,
            SplitterDistance = 605
        };

        var left = new Panel { Dock = DockStyle.Fill, Padding = new Padding(16, 17, 7, 12) };
        var leftHead = new Label
        {
            Text = "PARES DE PORTAS", Font = new Font("Segoe UI Semibold", 10f, FontStyle.Bold),
            ForeColor = Ink, Dock = DockStyle.Top, Height = 32
        };
        _pairs.Dock = DockStyle.Fill;
        _pairs.View = View.Details;
        _pairs.FullRowSelect = true;
        _pairs.GridLines = true;
        _pairs.MultiSelect = false;
        _pairs.HideSelection = false;
        _pairs.BackColor = Color.White;
        _pairs.Columns.Add("Par", 86);
        _pairs.Columns.Add("Porta A", 98);
        _pairs.Columns.Add("Porta B", 98);
        _pairs.Columns.Add("Estado", 136);
        _pairs.Columns.Add("Driver", 118);
        _pairs.SelectedIndexChanged += (_, _) => UpdateButtons();
        _pairs.DoubleClick += (_, _) => OpenProperties();
        _summary.Dock = DockStyle.Bottom;
        _summary.Height = 52;
        _summary.ForeColor = Muted;
        _summary.Text = "Aguardando inventário do Windows...";
        left.Controls.Add(_pairs);
        left.Controls.Add(_summary);
        left.Controls.Add(leftHead);
        upper.Panel1.Controls.Add(left);

        var right = new Panel { Dock = DockStyle.Fill, Padding = new Padding(7, 17, 16, 12) };
        var rightHead = new Label
        {
            Text = "PROPRIEDADES E IDENTIDADE", Font = new Font("Segoe UI Semibold", 10f, FontStyle.Bold),
            ForeColor = Ink, Dock = DockStyle.Top, Height = 32
        };
        _properties.Dock = DockStyle.Fill;
        _properties.Multiline = true;
        _properties.ReadOnly = true;
        _properties.ScrollBars = ScrollBars.Vertical;
        _properties.BorderStyle = BorderStyle.FixedSingle;
        _properties.Font = new Font("Consolas", 9f);
        _properties.BackColor = Color.White;
        _properties.ForeColor = Ink;

        _profile.Dock = DockStyle.Bottom;
        _profile.Height = 56;
        _profile.ForeColor = Muted;
        _profile.Text = "Perfil de teste: 9600 baud, 8N1, sem handshake.";
        right.Controls.Add(_properties);
        right.Controls.Add(_profile);
        right.Controls.Add(rightHead);
        upper.Panel2.Controls.Add(right);

        var bottom = new TabControl { Dock = DockStyle.Fill, Padding = new Point(15, 5) };
        var eventTab = new TabPage("Eventos e testes") { BackColor = Color.White };
        _events.Multiline = true;
        _events.ReadOnly = true;
        _events.WordWrap = false;
        _events.ScrollBars = ScrollBars.Both;
        _events.Dock = DockStyle.Fill;
        _events.Font = new Font("Consolas", 9f);
        _events.BackColor = Color.FromArgb(24, 30, 37);
        _events.ForeColor = Color.FromArgb(229, 237, 241);
        eventTab.Controls.Add(_events);
        var helpTab = new TabPage("Limites do driver") { BackColor = Color.White };
        helpTab.Controls.Add(new Label
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(17),
            Font = new Font("Segoe UI", 10),
            ForeColor = Ink,
            Text = "LabSerial KMDF experimental: um único par fixo (COM210 ↔ COM211).\r\n\r\n" +
                   "Adicionar/Remover Par modifica apenas a lista desta interface; nunca instala nem remove dispositivos Windows.\r\n\r\n" +
                   "Aplicar modifica somente o perfil de teste nesta sessão; a velocidade é definida quando o aplicativo abre a porta.\r\n\r\n" +
                   "Os testes usam exclusivamente dispositivos LabSerial verificados, executam em processos separados e salvam evidências em Documentos\\LabSerial-Evidencias.\r\n\r\n" +
                   "O watchdog não impede travamentos do kernel ou BSOD. Utilize somente no computador sobressalente com recuperação física.\r\n\r\n" +
                   "Não oferece criação de novos pares, gerenciamento de driver/assinatura ou homologação de produção."
        });
        bottom.TabPages.Add(eventTab);
        bottom.TabPages.Add(helpTab);
        split.Panel1.Controls.Add(upper);
        split.Panel2.Controls.Add(bottom);
        return split;
    }

    private Control BuildStatus()
    {
        var status = new StatusStrip { Dock = DockStyle.Fill, SizingGrip = false, BackColor = Color.White };
        _state.Spring = true;
        _state.TextAlign = ContentAlignment.MiddleLeft;
        _state.Text = "Aguardando Windows";
        _connection.Text = "COM210 ↔ COM211 | não verificado";
        status.Items.Add(_state);
        status.Items.Add(_connection);
        return status;
    }

    private async Task RefreshInventoryAsync()
    {
        if (_busy) return;
        _state.Text = "Consultando Windows...";
        try
        {
            _snapshot = await Task.Run(LabSerialInventory.Read);
            _pairs.BeginUpdate();
            try
            {
                _pairs.Items.Clear();
                if (_showPair)
                {
                    var s = _snapshot;
                    var item = new ListViewItem(new[] {
                        "LabSerial 0", "COM210", "COM211",
                        s.Ready ? "OK" : "Verificação pendente",
                        "LabSerial"
                    }) { Tag = s, ForeColor = s.Ready ? Ink : Accent };
                    _pairs.Items.Add(item);
                    item.Selected = true;
                }
            }
            finally { _pairs.EndUpdate(); }
            _summary.Text = _snapshot.Ready
                ? "Par COM210 ↔ COM211 reconhecido. Nenhum outro dispositivo será aberto."
                : "Identidade ou estado não confirmado. Testes bloqueados.";
            _connection.Text = _snapshot.Ready ? "COM210 ↔ COM211 | OK" : "COM210 ↔ COM211 | indisponível";
            _state.Text = _snapshot.Status;
            UpdateProperties();
            WriteLog("Inventário: " + _snapshot.Status);
        }
        catch (Exception e)
        {
            _state.Text = "Falha no inventário";
            _connection.Text = "Não verificado";
            WriteLog("ERRO AO INVENTARIAR: " + e.Message);
        }
        UpdateButtons();
    }

    private void UpdateProperties()
    {
        var s = _snapshot;
        if (s == null) { _properties.Text = "Inventário não realizado."; return; }
        var text = new StringBuilder();
        foreach (var e in new[] { s.A, s.B })
        {
            text.AppendLine($"LABSERIAL {e.Label} — {e.Port}");
            text.AppendLine(new string('─', 34));
            text.AppendLine($"PnP: {e.PnpStatus}");
            text.AppendLine($"Serviço: LabSerial");
            text.AppendLine($"Dispositivo: {e.KernelPath}");
            text.AppendLine($"HardwareId: {e.HardwareId}");
            text.AppendLine($"InstanceId: {e.InstanceId}");
            text.AppendLine($"Validação: {(e.Verified ? "OK" : e.Reason)}");
            text.AppendLine();
        }
        _properties.Text = text.ToString();
        _profile.Text = $"Perfil selecionado: {_selectedBaudRate} baud, 8N1, Handshake.None.\r\nAplicar altera apenas o teste, não o driver.";
    }

    private void UpdateButtons()
    {
        bool visible = _showPair && _pairs.Items.Count > 0;
        bool ready = visible && _snapshot?.Ready == true;
        _btnAdd.Enabled = !_busy && !_showPair && _snapshot?.Ready == true;
        _btnRemove.Enabled = !_busy && visible;
        _btnProperties.Enabled = !_busy && visible;
        _btnApply.Enabled = !_busy && visible;
        _btnProfile.Enabled = !_busy && ready;
        _btnWin32.Enabled = !_busy && ready;
        _btnNet.Enabled = !_busy && ready;
    }

    private void AddPair()
    {
        if (_busy) return;
        if (_snapshot?.Ready != true)
        {
            MessageBox.Show(this, "Não há um par LabSerial verificado. Atualize o inventário. O aplicativo não cria dispositivos PnP.",
                "Adicionar par existente", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        if (_showPair)
        {
            MessageBox.Show(this, "O único par suportado (COM210 ↔ COM211) já está na lista. A criação dinâmica de novos pares não é suportada pelo driver.",
                "LabSerial", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        _showPair = true;
        WriteLog("Par existente restaurado à lista de gerenciamento; PnP não alterado.");
        _ = RefreshInventoryAsync();
    }

    private void RemovePair()
    {
        if (_busy || !_showPair) return;
        if (MessageBox.Show(this,
            "Remover COM210 ↔ COM211 apenas da lista desta interface?\r\n\r\n" +
            "O driver, as portas e as instâncias Windows permanecerão instalados e funcionando.",
            "Remover da lista (não desinstala)", MessageBoxButtons.YesNo, MessageBoxIcon.Question)
            != DialogResult.Yes) return;
        _showPair = false;
        _pairs.Items.Clear();
        _summary.Text = "Par oculto apenas nesta sessão. Clique Adicionar Par para restaurar.";
        _properties.Text = "Nenhum par na lista.";
        WriteLog("Par removido da lista visual. Nenhuma alteração no Windows.");
        UpdateButtons();
    }

    private void OpenProperties()
    {
        if (_busy || !_showPair || _snapshot is null) return;
        using var form = new Form
        {
            Text = "LabSerial — Propriedades do par", StartPosition = FormStartPosition.CenterParent,
            ClientSize = new Size(480, 286), MinimumSize = new Size(480, 286),
            FormBorderStyle = FormBorderStyle.FixedDialog, MaximizeBox = false, MinimizeBox = false,
            Font = new Font("Segoe UI", 9.5f)
        };
        var label = new Label
        {
            Text = "Par existente: COM210 ↔ COM211\r\nServiço: LabSerial | Hardware: ROOT\\LABSERIAL_VCOM_A/B\r\n\r\n" +
                   "Velocidade para o teste de perfil (8N1 / Handshake.None):",
            Location = new Point(22, 20), Size = new Size(435, 97)
        };
        var baud = new ComboBox
        {
            DropDownStyle = ComboBoxStyle.DropDownList, Location = new Point(22, 116), Width = 195
        };
        baud.Items.AddRange(new object[] { "9600", "115200" });
        baud.SelectedItem = _selectedBaudRate.ToString();
        var note = new Label
        {
            Text = "A configuração aplica-se ao próximo teste de comunicação.\r\nNão altera registro, driver ou portas de outros programas.",
            Location = new Point(22, 161), Size = new Size(440, 46), ForeColor = Muted
        };
        var save = new Button { Text = "Aplicar", Location = new Point(244, 230), Size = new Size(100, 31), DialogResult = DialogResult.OK };
        var cancel = new Button { Text = "Cancelar", Location = new Point(353, 230), Size = new Size(100, 31), DialogResult = DialogResult.Cancel };
        form.Controls.AddRange(new Control[] { label, baud, note, save, cancel });
        form.AcceptButton = save;
        form.CancelButton = cancel;
        if (form.ShowDialog(this) != DialogResult.OK) return;
        _selectedBaudRate = int.Parse((string)baud.SelectedItem!);
        WriteLog($"Perfil de teste aplicado: {_selectedBaudRate} baud / 8N1 / Handshake.None. Driver não modificado.");
        UpdateProperties();
    }

    private async Task RunTestAsync(string test, string script, int timeoutSeconds, int? baud = null)
    {
        if (_busy) return;
        await RefreshInventoryAsync(); // Fresh identity check before any COM open.
        if (_snapshot?.Ready != true || !_showPair)
        {
            MessageBox.Show(this, "COM210 e COM211 não passaram na verificação de identidade PnP/SERIALCOMM/QueryDosDevice.",
                "Teste bloqueado", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        if (!ProbeRunner.IsElevated())
        {
            MessageBox.Show(this, "Para executar os testes validados, inicie o LabSerial Setup como administrador no PC de laboratório.",
                "Permissão necessária", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        if (MessageBox.Show(this,
            "CONFIRMAÇÃO — TESTE REAL DE DRIVER DE KERNEL\r\n\r\n" +
            $"Operação: {test}\r\nPortas: COM210 ↔ COM211\r\n" +
            "Este computador é dedicado a testes, possui backup recuperável e acesso físico ao console?\r\n\r\n" +
            "O watchdog encerra o processo do teste, mas NÃO evita BSOD ou falhas do kernel.",
            "Autorizar comunicação real", MessageBoxButtons.YesNo, MessageBoxIcon.Warning,
            MessageBoxDefaultButton.Button2) != DialogResult.Yes) return;

        _busy = true;
        _activeTest = new CancellationTokenSource();
        UpdateButtons();
        _state.Text = "Executando " + test;
        WriteLog($"INICIANDO: {test} (máximo {timeoutSeconds}s).");
        try
        {
            ProbeResult result = await ProbeRunner.ExecuteAsync(script, timeoutSeconds, baud, _activeTest.Token);
            if (!string.IsNullOrWhiteSpace(result.Output)) WriteLog(result.Output.TrimEnd());
            if (!string.IsNullOrWhiteSpace(result.Error)) WriteLog("ERRO: " + result.Error.TrimEnd());
            _state.Text = result.Passed ? "PASS — " + test : "FAIL — " + test;
            WriteLog($"RESULTADO {test}: {(result.Passed ? "PASS" : "FAIL")} (exit {result.ExitCode}).");
            if (!result.Passed)
            {
                MessageBox.Show(this, "O teste não foi aprovado. Consulte o Console e as evidências. Não repita sem analisar a falha.",
                    "LabSerial — teste FAIL", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
        finally
        {
            _activeTest.Dispose();
            _activeTest = null;
            _busy = false;
            UpdateButtons();
        }
    }

    private void WriteLog(string value)
    {
        string line = "[" + DateTime.Now.ToString("HH:mm:ss") + "] " + value;
        _events.AppendText(line + Environment.NewLine);
        if (_events.TextLength > 400000)
            _events.Text = _events.Text[^250000..];
        if (_console is { IsDisposed: false }) _console.Append(line);
    }

    private void ShowConsole()
    {
        if (_console is { IsDisposed: false })
        {
            _console.BringToFront();
            return;
        }
        _console = new ConsoleForm(_events.Text);
        _console.Show(this);
    }

    private void ExportLog()
    {
        using var dialog = new SaveFileDialog { Filter = "Texto (*.txt)|*.txt", FileName = "LabSerial-Eventos.txt" };
        if (dialog.ShowDialog(this) == DialogResult.OK)
            File.WriteAllText(dialog.FileName, _events.Text);
    }

    private void OpenEvidenceFolder()
    {
        string folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "LabSerial-Evidencias");
        Directory.CreateDirectory(folder);
        Process.Start(new ProcessStartInfo("explorer.exe") { ArgumentList = { folder }, UseShellExecute = true });
    }

    private void ShowAbout()
    {
        MessageBox.Show(this,
            "LabSerial Setup v0.1.0\r\nWindows Forms / .NET 8 — Windows x64\r\n\r\n" +
            "Interface de gerenciamento e diagnóstico do par fixo COM210 ↔ COM211.\r\n" +
            "Faz verificação rigorosa dos dispositivos LabSerial antes de permitir testes.\r\n" +
            "Não instala drivers, não cria pares PnP e não altera configurações globais.\r\n" +
            "Distribuição experimental para computadores de laboratório.",
            "Sobre o LabSerial Setup", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }
}
