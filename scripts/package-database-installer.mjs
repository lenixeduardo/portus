import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const release = join(root, "release");
const stagingRoot = join(release, "portus-database-installer");
const packageRoot = join(stagingRoot, "database");
const archive = join(release, "portus-database-installer.zip");

rmSync(stagingRoot, { recursive: true, force: true });
mkdirSync(packageRoot, { recursive: true });
for (const file of ["install-portus-database.ps1", "install-portus-database.bat", "migrate-portus-database.bat", "verify-portus-database.ps1", "check-portus-database.bat"]) {
  cpSync(join(root, "database", file), join(packageRoot, file));
}
cpSync(join(root, "database", "migrations"), join(packageRoot, "migrations"), { recursive: true });
cpSync(join(root, "database", "seed"), join(packageRoot, "seed"), { recursive: true });
cpSync(join(root, "database", "tests"), join(packageRoot, "tests"), { recursive: true });

writeFileSync(join(stagingRoot, "README.md"), `# PORTUS — instalador do banco central

## Uso inicial

1. Instale PostgreSQL 18 e mantenha o serviço iniciado.
2. Execute \`database\\install-portus-database.bat\`.
3. Informe a senha de \`postgres\` e defina uma senha forte para \`portus_admin\`.

O instalador cria o banco \`portus\`, executa as migrations reais, aplica o seed,
concede os privilégios operacionais necessários e roda os testes SQL. Ele pode
ser executado novamente sem reaplicar migrations já registradas.

## Diagnóstico e atualização

- \`database\\check-portus-database.bat\`: testa a conexão como \`portus_admin\`.
- \`database\\migrate-portus-database.bat\`: aplica migrations ainda pendentes.

O pacote não salva senha em arquivos. Para iniciar o PORTUS, no mesmo PowerShell:

\`\`\`powershell
$env:PORTUS_DATABASE_URL="postgresql://portus_admin:SUA_SENHA@127.0.0.1:5432/portus"
npm run dev
\`\`\`

Se a senha tiver caracteres reservados de URL, faça URL encoding antes de montar a variável.
`, "utf8");

rmSync(archive, { force: true });
execFileSync("zip", ["-qr", archive, "portus-database-installer"], { cwd: release, stdio: "inherit" });
console.log(`Pacote gerado: ${archive}`);
