import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const errors = [];

function requireFile(path) {
  if (!existsSync(join(root, path))) errors.push(`Arquivo obrigatório ausente: ${path}`);
}

for (const path of [
  "build/icon.ico",
  "build/icon.png",
  "assets/branding/portus-icon.ico",
  "assets/branding/portus-icon.png",
  "assets/branding/portus-favicon.png",
  "src/renderer/favicon.png",
  "src/renderer/assets/portus-wordmark.png",
  "build/installer.nsh",
  "database/install-portus-database.bat",
  "database/install-portus-database.ps1",
  "database/verify-portus-database.ps1",
  "database/migrations/001_schema.sql",
  "database/migrations/002_domain_functions.sql",
  "database/migrations/003_security_permissions.sql",
  "database/migrations/004_laboratory_view.sql",
  "database/migrations/005_runtime_function_security.sql"
]) requireFile(path);

const artifactName = packageJson.build?.win?.artifactName;
if (artifactName !== "PORTUS-Setup-${version}-${arch}.${ext}") {
  errors.push("O nome do instalador Windows não segue PORTUS-Setup-${version}-${arch}.${ext}.");
}
if (!packageJson.scripts?.package?.includes("copy-installer-to-root.mjs")) {
  errors.push("O script package não copia o instalador final para a raiz.");
}
if (!packageJson.build?.extraResources?.some((entry) => entry?.to === "portus-icon.png")) {
  errors.push("O ícone oficial não está incluído nos recursos do executável.");
}
if (packageJson.scripts?.start?.includes("ELECTRON_DEV=1")) {
  errors.push("O script start força o modo de desenvolvimento e tenta abrir o servidor Vite.");
}

const mainEntry = readFileSync(join(root, "src/main/index.ts"), "utf8");
if (!/sandbox:\s*false/.test(mainEntry)) {
  errors.push("O preload CommonJS importa módulos locais e requer sandbox: false até ser empacotado em bundle único.");
}

const installer = readFileSync(join(root, "database/install-portus-database.ps1"), "utf8");
if (/\[string\]\$Host\b/.test(installer)) {
  errors.push("O instalador tenta sobrescrever a variável automática $Host do PowerShell.");
}
if (!installer.includes('SetEnvironmentVariable("PORTUS_DATABASE_URL"')) {
  errors.push("O instalador não configura a conexão do aplicativo após criar o banco.");
}

if (errors.length > 0) {
  console.error("Validação de release falhou:\n- " + errors.join("\n- "));
  process.exit(1);
}

console.log("Release pronta para build: assets, migrations, instaladores e nome do artefato validados.");
