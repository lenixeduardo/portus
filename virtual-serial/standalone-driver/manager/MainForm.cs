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
    private static readonly Color Surface = Color.FromArgb(240, 240, 240);
    private static readonly Color AccentBlue = Color.FromArgb(0, 120, 215);

    private readonly ListView _pairs = new();
    private readonly TextBox _properties = new();
    private readonly RichTextBox _events = new();
    private readonly TextBox[] _ports = { new(), new() };
    private readonly TextBox[] _names = { new(), new() };
    private readonly TextBox[] _hardwareIds = { new(), new() };
    private readonly TextBox[] _descriptions = { new(), new() };
    private readonly ToolStripStatusLabel _deviceManager = new();
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
        Text = "LabSerial Setup";
        Icon = LabSerialBrand.MakeIcon();
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(1030, 810);
        MinimumSize = new Size(940, 690);
        Font = new Font("Segoe UI", 9.2f);
        BackColor = Surface;
        ForeColor = Ink;
        AutoScaleMode = AutoScaleMode.Dpi;

        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 4, Margin = Padding.Empty, Padding = Padding.Empty };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 30));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 52));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 26));

        var menu = BuildMenu();
        MainMenuStrip = menu;
        layout.Controls.Add(menu, 0, 0);
        layout.Controls.Add(BuildToolbar(), 0, 1);
        layout.Controls.Add(BuildWorkspace(), 0, 2);
        layout.Controls.Add(BuildStatus(), 0, 3);

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
            Dock = DockStyle.Fill, BackColor = Surface, ForeColor = Ink,
            GripStyle = ToolStripGripStyle.Hidden, RenderMode = ToolStripRenderMode.System,
            Padding = new Padding(14, 6, 10, 6),
            ImageScalingSize = new Size(21, 21)
        };

        _btnAdd = ToolButton("Adicionar Par", "✚", Color.ForestGreen, (_, _) => AddPair());
        _btnRemove = ToolButton("Remover Par", "✖", Color.Firebrick, (_, _) => RemovePair());
        _btnProperties = ToolButton("Propriedades", "⚙", Ink, (_, _) => OpenProperties());
        var refresh = ToolButton("Atualizar", "⟳", AccentBlue, async (_, _) => await RefreshInventoryAsync());
        _btnApply = ToolButton("Aplicar", "✓", Color.FromArgb(74, 117, 65), (_, _) => OpenProperties());
        _btnProfile = ToolButton("Testar Perfil", "▶", AccentBlue, async (_, _) =>
            await RunTestAsync("Perfil selecionado", "Run-LabSerialProfileProbe.ps1", 45, _selectedBaudRate));
        _btnWin32 = ToolButton("Testar Win32", "⇄", AccentBlue, async (_, _) =>
            await RunTestAsync("Win32 — 6 quadros", "Run-LabSerialEvidenceBounded.ps1", 95));
        _btnNet = ToolButton("Testar .NET", "●", AccentBlue, async (_, _) =>
            await RunTestAsync(".NET — 4 quadros", "Run-LabSerialCompatibilityBounded.ps1", 65));

        _btnAdd.ToolTipText = "Exibir o único par LabSerial existente; não cria dispositivos.";
        _btnRemove.ToolTipText = "Remover da lista visual, sem excluir portas ou drivers.";
        _btnApply.ToolTipText = "Aplicar somente o perfil local de testes.";

        toolbar.Items.AddRange(new ToolStripItem[] {
            _btnAdd, new ToolStripSeparator(), _btnRemove, new ToolStripSeparator(),
            _btnProperties, new ToolStripSeparator(), refresh, new ToolStripSeparator(),
            _btnApply, new ToolStripSeparator(), _btnProfile, _btnWin32, _btnNet,
            new ToolStripSeparator(), ToolButton("Console", "▣", Ink, (_, _) => ShowConsole())
        });
        return toolbar;
    }

    private static ToolStripButton ToolButton(string caption, string glyph, Color glyphColor, EventHandler onClick)
    {
        var bitmap = new Bitmap(22, 22);
        using (var g = Graphics.FromImage(bitmap))
        using (var brush = new SolidBrush(glyphColor))
        using (var font = new Font("Segoe UI Symbol", 15f, FontStyle.Bold, GraphicsUnit.Pixel))
        {
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
            g.Clear(Color.Transparent);
            g.DrawString(glyph, font, brush, -1, -2);
        }
        var button = new ToolStripButton(caption)
        {
            Image = bitmap, DisplayStyle = ToolStripItemDisplayStyle.ImageAndText,
            ImageScaling = ToolStripItemImageScaling.None,
            TextImageRelation = TextImageRelation.ImageBeforeText,
            AutoSize = true, Margin = new Padding(3, 0, 3, 0),
            Padding = new Padding(3, 3, 3, 3)
        };
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
        var content = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, BackColor = Surface, ColumnCount = 1, RowCount = 3,
            Padding = new Padding(10, 8, 10, 7), Margin = Padding.Empty
        };
        content.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        content.RowStyles.Add(new RowStyle(SizeType.Percent, 30));
        content.RowStyles.Add(new RowStyle(SizeType.Percent, 45));
        content.RowStyles.Add(new RowStyle(SizeType.Percent, 25));

        var pairGroup = new GroupBox
        {
            Text = "Pares de Portas Virtuais", Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 9.2f, FontStyle.Bold),
            Padding = new Padding(9, 9, 9, 6)
        };
        var pairPanel = new Panel { Dock = DockStyle.Fill };
        _pairs.Dock = DockStyle.Fill;
        _pairs.Font = new Font("Segoe UI", 9.4f);
        _pairs.View = View.Details;
        _pairs.FullRowSelect = true;
        _pairs.GridLines = true;
        _pairs.MultiSelect = false;
        _pairs.HideSelection = false;
        _pairs.BackColor = Color.White;
        _pairs.ForeColor = Ink;
        _pairs.HeaderStyle = ColumnHeaderStyle.Nonclickable;
        _pairs.Columns.Add("#", 50);
        _pairs.Columns.Add("Porta A", 135);
        _pairs.Columns.Add("Porta B", 135);
        _pairs.Columns.Add("Status", 145);
        _pairs.Columns.Add("Driver", 245);
        _pairs.Columns.Add("Criado em", 190);
        _pairs.Resize += (_, _) =>
        {
            if (_pairs.Columns.Count != 6) return;
            int width = Math.Max(620, _pairs.ClientSize.Width - SystemInformation.VerticalScrollBarWidth - 2);
            int[] weights = { 7, 14, 14, 16, 26, 23 };
            for (int i = 0; i < weights.Length; i++) _pairs.Columns[i].Width = width * weights[i] / 100;
        };
        _pairs.SelectedIndexChanged += (_, _) => UpdateButtons();
        _pairs.DoubleClick += (_, _) => OpenProperties();

        _summary.Dock = DockStyle.Bottom;
        _summary.Height = 25;
        _summary.Font = new Font("Segoe UI", 8.3f);
        _summary.ForeColor = Muted;
        _summary.Text = "Aguardando leitura do driver LabSerial...";
        pairPanel.Controls.Add(_pairs);
        pairPanel.Controls.Add(_summary);
        pairGroup.Controls.Add(pairPanel);
        content.Controls.Add(pairGroup, 0, 0);

        var details = new GroupBox
        {
            Text = "Propriedades do Par Selecionado", Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 9.2f, FontStyle.Bold),
            Padding = new Padding(9, 10, 9, 7)
        };
        var detailLayout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2,
            Padding = Padding.Empty, Margin = Padding.Empty
        };
        detailLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        detailLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 62));
        detailLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 38));
        var endpoints = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1 };
        endpoints.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        endpoints.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        endpoints.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        endpoints.Controls.Add(BuildEndpointGroup(0, "Porta A (Lado A)"), 0, 0);
        endpoints.Controls.Add(BuildEndpointGroup(1, "Porta B (Lado B)"), 1, 0);
        detailLayout.Controls.Add(endpoints, 0, 0);
        detailLayout.Controls.Add(BuildConfigurationGroup(), 0, 1);
        details.Controls.Add(detailLayout);
        content.Controls.Add(details, 0, 1);

        var logGroup = new GroupBox
        {
            Text = "Log de Eventos", Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 9.2f, FontStyle.Bold),
            Padding = new Padding(9, 9, 9, 7)
        };
        var logPane = new Panel { Dock = DockStyle.Fill };
        var clear = new Button
        {
            Text = "Limpar Log", Dock = DockStyle.Right, Width = 105,
            FlatStyle = FlatStyle.System, Font = new Font("Segoe UI", 8.3f)
        };
        clear.Click += (_, _) => _events.Clear();
        var logActions = new Panel { Dock = DockStyle.Top, Height = 29 };
        logActions.Controls.Add(clear);
        _events.Dock = DockStyle.Fill;
        _events.ReadOnly = true;
        _events.WordWrap = false;
        _events.ScrollBars = RichTextBoxScrollBars.Both;
        _events.BorderStyle = BorderStyle.FixedSingle;
        _events.Font = new Font("Consolas", 9.1f);
        _events.BackColor = Color.White;
        _events.ForeColor = Ink;
        logPane.Controls.Add(_events);
        logPane.Controls.Add(logActions);
        logGroup.Controls.Add(logPane);
        content.Controls.Add(logGroup, 0, 2);
        return content;
    }

    private Control BuildEndpointGroup(int index, string title)
    {
        var group = new GroupBox
        {
            Text = title, Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 9.0f, FontStyle.Bold),
            ForeColor = Color.FromArgb(25, 77, 140), Margin = new Padding(3, 2, 7, 2),
            Padding = new Padding(8, 7, 8, 6)
        };
        var grid = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 4 };
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 120));
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        for (int n = 0; n < 4; n++) grid.RowStyles.Add(new RowStyle(SizeType.Percent, 25));
        var fields = new[] { _ports[index], _names[index], _hardwareIds[index], _descriptions[index] };
        var labels = new[] { "Número da Porta:", "Nome Amigável:", "Hardware ID:", "Descrição:" };
        for (int row = 0; row < 4; row++)
        {
            var label = new Label
            {
                Text = labels[row], Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft,
                Font = new Font("Segoe UI", 9.1f), ForeColor = Ink, AutoEllipsis = true
            };
            var field = fields[row];
            field.Dock = DockStyle.Fill;
            field.BorderStyle = BorderStyle.FixedSingle;
            field.ReadOnly = true;
            field.BackColor = Color.White;
            field.ForeColor = Ink;
            field.Font = new Font("Segoe UI", 9.0f);
            field.Margin = new Padding(1, 2, 5, 2);
            grid.Controls.Add(label, 0, row);
            grid.Controls.Add(field, 1, row);
        }
        group.Controls.Add(grid);
        return group;
    }

    private Control BuildConfigurationGroup()
    {
        var group = new GroupBox
        {
            Text = "Configurações do Par", Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 9.1f, FontStyle.Bold),
            Padding = new Padding(10, 8, 10, 7),
            Margin = new Padding(3, 4, 7, 2)
        };
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2 };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 53));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 47));
        var top = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoScroll = false, WrapContents = false };
        var emulationLabel = new Label
        {
            Text = "Modo de Emulação:", AutoSize = true, Padding = new Padding(0, 6, 6, 0),
            Font = new Font("Segoe UI", 9.0f)
        };
        var mode = new ComboBox
        {
            DropDownStyle = ComboBoxStyle.DropDownList, Width = 290, Enabled = false,
            Font = new Font("Segoe UI", 9f)
        };
        mode.Items.Add("Null-modem pair (conexão cruzada)");
        mode.SelectedIndex = 0;
        var advanced = new Button
        {
            Text = "Configurações Avançadas...", Width = 185, Height = 27,
            Margin = new Padding(14, 0, 0, 0), Font = new Font("Segoe UI", 8.6f)
        };
        advanced.Click += (_, _) => MessageBox.Show(this,
            "O driver LabSerial atual oferece apenas o par COM210 ↔ COM211 e transmissão serial básica.\r\n\r\n" +
            "Configurações avançadas de handshake, mapeamento dinâmico e sinais ainda não estão disponíveis.",
            "Configurações do driver (somente leitura)", MessageBoxButtons.OK, MessageBoxIcon.Information);
        top.Controls.Add(emulationLabel);
        top.Controls.Add(mode);
        top.Controls.Add(advanced);

        var bottom = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false, AutoScroll = false, Padding = new Padding(0, 0, 0, 0)
        };
        var startup = new CheckBox { Text = "Iniciar com o Windows", Enabled = false, AutoSize = true, Margin = new Padding(3, 3, 17, 0) };
        var logging = new CheckBox
        {
            Text = "Log de testes (local)", Checked = true, Enabled = false, AutoSize = true,
            Margin = new Padding(3, 3, 17, 0)
        };
        var auto = new CheckBox
        {
            Text = "Criar portas automaticamente", Enabled = false, AutoSize = true,
            Margin = new Padding(3, 3, 17, 0)
        };
        bottom.Controls.Add(startup);
        bottom.Controls.Add(logging);
        bottom.Controls.Add(auto);
        layout.Controls.Add(top, 0, 0);
        layout.Controls.Add(bottom, 0, 1);
        group.Controls.Add(layout);
        return group;
    }

    private Control BuildStatus()
    {
        var strip = new StatusStrip { Dock = DockStyle.Fill, SizingGrip = false, BackColor = Surface };
        var count = new ToolStripStatusLabel("1 par configurado") { BorderSides = ToolStripStatusLabelBorderSides.Right };
        _state.Spring = true;
        _state.TextAlign = ContentAlignment.MiddleLeft;
        _state.Text = "LabSerial Virtual Serial Port Driver (Experimental)";
        _deviceManager.Text = "Abrir Gerenciador de Dispositivos...";
        _deviceManager.IsLink = true;
        _deviceManager.LinkColor = AccentBlue;
        _deviceManager.Click += (_, _) =>
            Process.Start(new ProcessStartInfo("devmgmt.msc") { UseShellExecute = true });
        _connection.Text = "COM210 ↔ COM211 | não verificado";
        strip.Items.Add(count);
        strip.Items.Add(_state);
        strip.Items.Add(_connection);
        strip.Items.Add(_deviceManager);
        return strip;
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
                        "0", "COM210", "COM211",
                        s.Ready ? "● Ativo" : "Verificação pendente",
                        "LabSerial (Experimental)", "Não disponível"
                    }) { Tag = s, ForeColor = s.Ready ? Ink : Accent };
                    _pairs.Items.Add(item);
                    item.Selected = true;
                    _pairs.Focus();
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
            // Fail closed: a stale successful inventory must never enable any COM I/O.
            _snapshot = null;
            _pairs.Items.Clear();
            UpdateProperties();
            _summary.Text = "Falha de inventário: testes bloqueados até nova verificação.";
            _state.Text = "Falha no inventário";
            _connection.Text = "Não verificado";
            WriteLog("ERRO AO INVENTARIAR: " + e.Message);
        }
        UpdateButtons();
    }

    private void UpdateProperties()
    {
        var s = _snapshot;
        if (s == null)
        {
            foreach (var field in _ports.Concat(_names).Concat(_hardwareIds).Concat(_descriptions))
                field.Text = "";
            return;
        }
        var endpoints = new[] { s.A, s.B };
        for (int n = 0; n < 2; n++)
        {
            var ep = endpoints[n];
            _ports[n].Text = ep.Port;
            _names[n].Text = "LabSerial " + ep.Label;
            _hardwareIds[n].Text = ep.HardwareId;
            _descriptions[n].Text = ep.FriendlyName;
            var tooltip = new ToolTip();
            tooltip.SetToolTip(_descriptions[n], ep.FriendlyName);
            tooltip.SetToolTip(_hardwareIds[n], ep.HardwareId);
        }
        _profile.Text = $"Perfil de teste: {_selectedBaudRate} baud, 8N1, Handshake.None.";
    }

    private void UpdateButtons()
    {
        bool visible = _showPair && _pairs.Items.Count > 0;
        bool ready = visible && _snapshot?.Ready == true;
        _btnAdd.Enabled = !_busy && _snapshot?.Ready == true;
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
        foreach (var segment in line.Replace("\r\n", "\n").Split('\n'))
        {
            _events.SelectionStart = _events.TextLength;
            _events.SelectionLength = 0;
            _events.SelectionColor = segment.Contains("FAIL", StringComparison.OrdinalIgnoreCase) ||
                segment.Contains("ERRO", StringComparison.OrdinalIgnoreCase) ? Color.Firebrick :
                segment.Contains("PASS", StringComparison.OrdinalIgnoreCase) ? Color.ForestGreen :
                segment.Contains("INICIANDO", StringComparison.OrdinalIgnoreCase) ? AccentBlue : Ink;
            _events.AppendText(segment + Environment.NewLine);
        }
        _events.SelectionColor = Ink;
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
            "LabSerial Setup v0.1.1\r\nWindows Forms / .NET 8 — Windows x64\r\n\r\n" +
            "Interface de gerenciamento e diagnóstico do par fixo COM210 ↔ COM211.\r\n" +
            "Faz verificação rigorosa dos dispositivos LabSerial antes de permitir testes.\r\n" +
            "Não instala drivers, não cria pares PnP e não altera configurações globais.\r\n" +
            "Distribuição experimental para computadores de laboratório.",
            "Sobre o LabSerial Setup", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }
}
