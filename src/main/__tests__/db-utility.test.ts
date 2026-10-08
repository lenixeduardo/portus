import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const db = join(process.cwd(), "database");
const read = (name: string) => readFileSync(join(db, name), "utf8");

describe("utilitario de banco PORTUS", () => {
  it("expoe exatamente as duas operacoes principais solicitadas", () => {
    const gui = read("portus-db-utility.ps1");
    expect(gui).toContain('Validar banco de dados');
    expect(gui).toContain('Aplicar migrations');
    expect(gui).toContain('Start-Action "validate"');
    expect(gui).toContain('Start-Action "migrate"');
    expect(gui).toContain('Confirmar alteracoes no schema');
    expect(gui).toContain('"-MigrationsOnly","-SkipAppConfiguration"');
  });

  it("mostra status/erros e nao executa duas operacoes simultaneas", () => {
    const gui = read("portus-db-utility.ps1");
    expect(gui).toContain('$timer.Add_Tick({');
    expect(gui).toContain("Poll-Log");
    expect(gui).toContain("if ($script:child) { return }");
    expect(gui).toContain('Set-Busy $true');
    expect(gui).toContain('Set-Busy $false');
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
    for (const asset of ["portus-db-utility.bat", "portus-db-utility.ps1", "validate-portus-schema.ps1"]) {
      expect(packager).toContain(asset);
    }
  });

  it.skipIf(process.platform !== "win32")("analisa a sintaxe dos scripts no Windows PowerShell", () => {
    for (const path of ["portus-db-utility.ps1", "validate-portus-schema.ps1"]) {
      const full = join(db, path);
      const command = [
        "$tokens=$null;",
        "$errors=$null;",
        '[void][System.Management.Automation.Language.Parser]::ParseFile($args[0],[ref]$tokens,[ref]$errors);',
        'if ($errors.Count -gt 0) { $errors | ForEach-Object { Write-Error $_.Message }; exit 1 }'
      ].join(" ");
      expect(() => execFileSync("powershell.exe", ["-NoProfile", "-Command", command, full], { encoding: "utf8" }))
        .not.toThrow();
    }
  });
});
