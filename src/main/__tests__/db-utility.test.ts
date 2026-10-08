import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const db = join(process.cwd(), "database");
const read = (name: string) => readFileSync(join(db, name), "utf8");

describe("utilitario de banco PORTUS", () => {
  it("expoe migrations, validacao do banco e verificacao do IP do servidor", () => {
    const gui = read("portus-db-utility.ps1");
    expect(gui).toContain('Validar banco de dados');
    expect(gui).toContain('Aplicar migrations');
    expect(gui).toContain('Verificar IP / rede');
    expect(gui).toContain('Registrar IP inicial');
    expect(gui).toContain('Start-Action "network"');
    expect(gui).toContain('Start-Action "register"');
    expect(gui).toContain('Start-Action "validate"');
    expect(gui).toContain('Start-Action "migrate"');
    expect(gui).toContain('Confirmar alteracoes no schema');
    expect(gui).toContain('"-MigrationsOnly","-SkipAppConfiguration"');
  });

  it("implementa o mockup premium com a identidade visual original do PORTUS", () => {
    const ui = read("portus-db-utility.ps1");
    const packager = readFileSync(join(process.cwd(), "scripts/package-database-installer.mjs"), "utf8");
    expect(ui).toContain('$form.Text = "PORTUS Database Utility"');
    expect(ui).toContain('"DATABASE UTILITY"');
    expect(ui).toContain('"CONFIGURACOES DE CONEXAO"');
    expect(ui).toContain('"ACOES"');
    expect(ui).toContain('"STATUS"');
    expect(ui).toContain('"LOG DA OPERACAO"');
    expect(ui).toContain('Join-Path $PSScriptRoot "portus-logo.png"');
    expect(ui).toContain('"build\\icon.png"');
    expect(ui).toContain('PictureBoxSizeMode]::Zoom');
    expect(ui).toContain('$page.AutoScroll = $true');
    expect(ui).toContain('New-Object System.Windows.Forms.RichTextBox');
    expect(ui).toContain('Limpar log');
    expect(ui).toContain('$showPasswordButton.Add_Click');
    expect(ui).toContain('$browseButton.Add_Click');
    expect(ui).toContain('UiColor "primary"');
    expect(ui).toContain('. (Join-Path $PSScriptRoot "portus-ui-design-tokens.ps1")');
    expect(ui).toContain('$logoPicture.Image');
    expect(ui).toContain('logotipo PORTUS nao carregaram');
    expect(ui).toContain('-not $canvas.Visible');

    expect(ui).toContain("Refresh-Reference");
    expect(packager).toContain('join(root, "build", "icon.png")');
    expect(packager).toContain('join(packageRoot, "portus-logo.png")');
    expect(ui).toContain('assets\\portus-blue-logo.png');
    expect(ui).toContain('PortusNativeIcon');
    const logo = readFileSync(join(db, "assets", "portus-blue-logo.png"));
    expect(logo.subarray(0,8).equals(Buffer.from("89504e470d0a1a0a","hex"))).toBe(true);

  });

  it("centraliza os tokens de cor e a tipografia obrigatoria Sora / Inter", () => {
    const tokens = read("portus-ui-design-tokens.ps1");
    const gui = read("portus-db-utility.ps1");
    expect(tokens).toContain('primary="#1479E5"');
    expect(tokens).toContain('navy="#081D3F"');
    expect(tokens).toContain('background="#F3F6FA"');
    expect(tokens).toContain('Sora');
    expect(tokens).toContain('Inter');
    expect(tokens).toContain('GraphicsUnit]::Pixel');
    expect(tokens).toContain('UiMissingFonts');
    expect(gui).toContain('UiFont "Sora" 36 "700"');
    expect(gui).toContain('UiFont "Sora" 18 "600"');
    expect(gui).toContain('UiFont "Inter" 14');
    expect(gui).toContain('UiFont "Inter" 12');
    expect(gui).toContain('[switch]$StrictFonts');
    expect(gui).toContain("Tipografia incompleta");
    const installer = read("install-portus-ui-fonts.ps1");
    expect(installer).toContain("raw.githubusercontent.com/google/fonts");
  });

  it("inclui somente quatro icones avulsos PNG 24px e SVG", () => {
    const gui = read("portus-db-utility.ps1");
    const packageScript = readFileSync(join(process.cwd(), "scripts/package-database-installer.mjs"), "utf8");
    const actions = [
      ["validar-banco","checkButton"],
      ["aplicar-migrations","migrateButton"],
      ["verificar-rede","networkButton"],
      ["registrar-ip","registerButton"]
    ];
    for (const [name,button] of actions) {
      const png = readFileSync(join(db, "assets", "actions", name + ".png"));
      const svg = readFileSync(join(db, "assets", "actions", name + ".svg"), "utf8");
      expect(png.subarray(0,8).equals(Buffer.from("89504e470d0a1a0a","hex"))).toBe(true);
      expect(png.readUInt32BE(16)).toBe(24);
      expect(png.readUInt32BE(20)).toBe(24);
      expect(svg).toContain("viewBox=");
      expect(gui).toContain("Set-ActionIcon $" + button + " \"" + name + "\"");
    }
    expect(packageScript).toContain('"assets"');
    expect(packageScript).toContain("install-portus-ui-fonts.ps1");
    expect(packageScript).toContain("portus-ui-design-tokens.ps1");
  });

  it("mostra status/erros e impede operacoes simultaneas", () => {
    const gui = read("portus-db-utility.ps1");
    expect(gui).toContain('$timer.Add_Tick({');
    expect(gui).toContain("Poll-Log");
    expect(gui).toContain("if ($script:child) { return }");
    expect(gui).toContain('Set-Busy $true');
    expect(gui).toContain('Set-Busy $false');
    expect(gui).toContain('$networkButton.Enabled = -not $busy');
    expect(gui).toContain("$script:child.ExitCode");
  });

  it("repassa a senha sem parametros CLI ou persistencia em disco", () => {
    const gui = read("portus-db-utility.ps1");
    expect(gui).toContain('UseSystemPasswordChar = $secret');
    expect(gui).toContain('SetEnvironmentVariable("PORTUS_SETUP_ADMIN_PASSWORD",$passField.Text,"Process")');
    expect(gui).toContain('SetEnvironmentVariable("PORTUS_SETUP_ADMIN_PASSWORD",$previous,"Process")');
    expect(gui).toContain("$passField.Clear()");
    expect(gui).not.toContain("ResetDevAdminPassword");
    expect(gui).not.toContain("SeedDevAdmin");
  });

  it("valida esquema e historico exclusivamente em modo leitura", () => {
    const validator = read("validate-portus-schema.ps1");
    expect(validator).toContain("BEGIN TRANSACTION READ ONLY;");
    expect(validator).toContain("SELECT name FROM public.portus_schema_migrations");
    expect(validator).toContain("column_name = 'sector_code'");
    expect(validator).toContain("column_name = 'barcode_value'");
    expect(validator).toContain("ROLLBACK;");
    expect(validator).not.toMatch(/\b(INSERT INTO|ALTER TABLE|DROP TABLE|DELETE FROM|UPDATE public\.)\b/i);
  });

  it("inclui launcher e dependencias no pacote de banco", () => {
    const launcher = read("portus-db-utility.bat");
    const packager = readFileSync(join(process.cwd(), "scripts/package-database-installer.mjs"), "utf8");
    expect(launcher).toContain("-STA");
    expect(launcher).toContain('portus-db-utility.ps1');
    for (const asset of ["portus-db-utility.bat", "portus-db-utility.ps1", "validate-portus-schema.ps1", "check-portus-server-network.ps1"]) {
      expect(packager).toContain(asset);
    }
  });

  it("nao sobrescreve o IP inicial e compara rede, URL e porta PostgreSQL", () => {
    const check = read("check-portus-server-network.ps1");
    const connection = readFileSync(join(process.cwd(), "src/main/db/central-connection.ts"), "utf8");
    const installer = read("install-portus-database.ps1");
    expect(check).toContain("server-endpoint.json");
    expect(check).toContain("database-config.json");
    expect(check).toContain("PORTUS_DATABASE_URL");
    expect(check).toContain("Read-ConfiguredConnection");
    expect(check).toContain("Get-NetIPConfiguration");
    expect(check).toContain("Test-Tcp");
    expect(check).toContain("RegisterFirstInstallation");
    expect(check).toContain("FileMode]::CreateNew");
    expect(check).toContain("DIFERENTE do cadastrado");
    expect(check).toContain("nenhuma alteracao automatica");
    expect(connection).toContain('flag: "wx"');
    expect(connection).toContain('"server-endpoint.json"');
    expect(installer).toContain("check-portus-server-network.ps1");
  });

  it.skipIf(process.platform !== "win32")("valida em rede real TCP e detecta IP configurado divergente", async () => {
    const temp = mkdtempSync(join(tmpdir(), "portus-network-test-"));
    const server = createServer(socket => socket.end());
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Porta TCP nao encontrada");
    const port = address.port;
    const script = join(db, "check-portus-server-network.ps1");

    const execute = (args: string[], databaseUrl: string) => new Promise<{code:number,output:string}>(resolve => {
      const child = spawn("powershell.exe", [
        "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script,
        "-ServerIp", "127.0.0.1", "-Port", String(port),
        "-DatabaseName", "portus", "-ConfigurationRoot", temp,
        ...args
      ], {
        env: {...process.env, PORTUS_DATABASE_URL: databaseUrl},
        windowsHide: true
      });
      let output = "";
      child.stdout.on("data", chunk => {output += chunk.toString();});
      child.stderr.on("data", chunk => {output += chunk.toString();});
      child.on("error", error => resolve({code:-1,output:String(error)}));
      child.on("close", code => resolve({code:code ?? -1,output}));
    });
    const goodUrl = "postgresql://portus_admin:secret@127.0.0.1:" + port + "/portus";
    try {
      const initial = await execute(["-RegisterFirstInstallation"], goodUrl);
      expect(initial.code, initial.output).toBe(0);
      expect(initial.output).toContain("VALIDACAO DE IP E REDE: OK");
      expect(existsSync(join(temp, "server-endpoint.json"))).toBe(true);

      const checked = await execute([], goodUrl);
      expect(checked.code, checked.output).toBe(0);
      expect(checked.output).toContain("IP cadastrado na primeira instalacao");

      const duplicate = await execute(["-RegisterFirstInstallation"], goodUrl);
      expect(duplicate.code).not.toBe(0);
      expect(duplicate.output).toContain("nao pode sobrescrever");

      const changed = await execute([], "postgresql://portus_admin:secret@127.0.0.2:" + port + "/portus");
      expect(changed.code).not.toBe(0);
      expect(changed.output).toMatch(/divergente/i);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      rmSync(temp, {recursive:true,force:true});
    }
  }, 60_000);

  it.skipIf(process.platform !== "win32")("abre e fecha a interface WinForms real sem acesso ao banco", () => {
    const ps = join(db, "portus-db-utility.ps1");
    const result = execFileSync("powershell.exe", [
      "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", ps, "-SmokeTest"
    ], {
      encoding: "utf8",
      timeout: 25_000,
      windowsHide: true
    });
    expect(result).toContain("PORTUS_DB_UTILITY_SMOKE_OK");
  }, 35_000);

  it("prioriza janela visivel e imprime erros de inicializacao no terminal", () => {
    const gui = read("portus-db-utility.ps1");
    const launcher = read("portus-db-utility.bat");
    expect(gui).toContain("$form.ShowInTaskbar = $true");
    expect(gui).toContain("$form.Add_Shown({");
    expect(gui).toContain("$form.TopMost = $true");
    expect(gui).toContain("$form.BringToFront()");
    expect(gui).toContain("$form.Activate()");
    expect(gui).toContain("$form.TopMost = $false");
    expect(gui).toContain("PORTUS_DB_UTILITY_SMOKE_OK");
    expect(gui).toContain("[Console]::Error.WriteLine($message)");
    expect(launcher).toContain("Se a janela nao aparecer, tente Alt+Tab");
  });

  it.skipIf(process.platform !== "win32")("analisa a sintaxe dos scripts no Windows PowerShell", () => {
    for (const path of ["portus-db-utility.ps1", "validate-portus-schema.ps1", "check-portus-server-network.ps1"]) {
      const full = join(db, path);
      const escaped = full.replace(/'/g, "''");
      const command = [
        "$tokens=$null;",
        "$errors=$null;",
        "[void][System.Management.Automation.Language.Parser]::ParseFile('" + escaped + "',[ref]$tokens,[ref]$errors);",
        'if ($errors.Count -gt 0) { $errors | ForEach-Object { Write-Error $_.Message }; exit 1 }'
      ].join(" ");
      expect(() => execFileSync("powershell.exe", ["-NoProfile", "-Command", command], { encoding: "utf8" }))
        .not.toThrow();
    }
  });
});
