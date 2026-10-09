import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "./prepare-portus-migration-runtime.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const release = join(root, "release");
const stagingRoot = join(release, "portus-database-installer");
const packageRoot = join(stagingRoot, "database");
const archive = join(release, "portus-database-installer.zip");

rmSync(stagingRoot, { recursive: true, force: true });
mkdirSync(packageRoot, { recursive: true });
for (const file of ["install-portus-database.ps1", "install-portus-database.bat", "migrate-portus-database.bat", "verify-portus-database.ps1", "check-portus-database.bat", "portus-db-utility.bat", "portus-db-utility.ps1", "portus-db-utility-runner.ps1", "portus-db-utility-glyphs.ps1", "portus-db-utility-process.ps1", "portus-psql-preflight.ps1", "portus-ui-design-tokens.ps1", "install-portus-ui-fonts.ps1", "validate-portus-schema.ps1", "check-portus-server-network.ps1"]) {
  cpSync(join(root, "database", file), join(packageRoot, file));
}
// Use the exact production PORTUS icon in the standalone WinForms utility.
cpSync(join(root, "build", "icon.png"), join(packageRoot, "portus-logo.png"));
cpSync(join(root, "database", "assets"), join(packageRoot, "assets"), { recursive: true });
cpSync(join(root, "database", "migrations"), join(packageRoot, "migrations"), { recursive: true });
cpSync(join(root, "database", "seed"), join(packageRoot, "seed"), { recursive: true });
cpSync(join(root, "database", "tests"), join(packageRoot, "tests"), { recursive: true });
cpSync(join(root, "database", "migration-runtime"), join(packageRoot, "migration-runtime"), { recursive: true });

writeFileSync(join(stagingRoot, "README.md"), `# PORTUS — instalador do banco central

## Uso inicial

1. Instale PostgreSQL 18 e mantenha o serviço iniciado.
2. Execute \`database\\install-portus-database.bat\`.
3. Informe a senha de \`postgres\` e defina uma senha forte para \`portus_admin\`.

O instalador cria o banco \`portus\`, executa as migrations reais, aplica o seed,
concede os privilégios operacionais necessários, roda os testes SQL e configura
a conexão do PORTUS no ambiente do usuário atual do Windows. Ele pode ser
executado novamente sem reaplicar migrations já registradas.

## Diagnóstico e atualização

- \`database\\check-portus-database.bat\`: testa a conexão como \`portus_admin\` e
  repara a configuração em \`%LOCALAPPDATA%\\PORTUS\\database-config.json\`.
- \`database\\migrate-portus-database.bat\`: aplica migrations ainda pendentes.
- \`database\\portus-db-utility.bat\`: abre a interface PORTUS com logo real, configuracao de conexao, validar banco, aplicar migrations e verificar/registrar IP do servidor.

Para configurar manualmente uma sessão de desenvolvimento:

\`\`\`powershell
$env:PORTUS_DATABASE_URL="postgresql://portus_admin:SUA_SENHA@127.0.0.1:5432/portus"
$env:PORTUS_DATABASE_MODE="central"
npm run dev
\`\`\`

Se a senha tiver caracteres reservados de URL, faça URL encoding antes de montar a variável.
`, "utf8");

rmSync(archive, { force: true });
if (process.platform === "win32") {
  execFileSync(
    "powershell.exe",
    ["-NoProfile", "-Command", `Compress-Archive -LiteralPath '${stagingRoot}' -DestinationPath '${archive}' -Force`],
    { stdio: "inherit" }
  );
} else {
  execFileSync("zip", ["-qr", archive, "portus-database-installer"], { cwd: release, stdio: "inherit" });
}
console.log(`Pacote gerado: ${archive}`);
