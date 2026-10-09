import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const errors = [];
const packageLock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const versionParts = packageJson.version.match(/^(\d+)\.(\d+)\.(\d+)$/)?.slice(1).map(Number);
if (!versionParts || versionParts.some(part => !Number.isSafeInteger(part))) {
  errors.push("Versão do aplicativo deve seguir SemVer numérico MAJOR.MINOR.PATCH.");
} else if (versionParts[0] === 0 && versionParts[1] === 1 && versionParts[2] < 26) {
  errors.push("Versão do PORTUS regrediu: a sequência 0.1.x deve continuar a partir de 0.1.26.");
}
if (packageLock.version !== packageJson.version || packageLock.packages?.[""]?.version !== packageJson.version) {
  errors.push("package-lock.json e package.json possuem versões divergentes.");
}


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
  "database/migrations/005_runtime_function_security.sql",
  "database/migrations/006_product_catalog_sync.sql",
  "database/migrations/007_admin_force_close.sql",
  "database/migrations/008_master_reopen_batch.sql",
  "database/migrations/009_default_equipment_catalog.sql",
  "database/migrations/010_admin_reopen_batch.sql",
  "database/migrations/011_operational_closure_rules.sql",
  "database/migrations/012_unified_batch_traceability.sql",
  "database/migrations/013_central_catalog_user_metadata.sql",
  "database/migrations/014_station_profiles_audit_ledger.sql",
  "scripts/import-legacy-to-postgres.mjs"
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

const viteConfig = readFileSync(join(root, "vite.config.ts"), "utf8");
const releaseNotes = readFileSync(join(root, "src/renderer/releaseNotes.ts"), "utf8");
const loginScreen = readFileSync(join(root, "src/renderer/screens/Login.tsx"), "utf8");
if (!viteConfig.includes('JSON.stringify(pkg.version)') ||
    !releaseNotes.includes('import.meta.env.VITE_APP_VERSION') ||
    !loginScreen.includes('v{APP_VERSION}')) {
  errors.push("A versão exibida no login não está vinculada à versão oficial do package.json.");
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
if (!installer.includes('database-config.json')) {
  errors.push("O instalador não cria o arquivo persistente de conexão do aplicativo.");
}
if (/Set-Content[^\n]*-Encoding\s+utf8NoBOM/i.test(installer)) {
  errors.push("O instalador usa utf8NoBOM, que não existe no Windows PowerShell 5.1.");
}
if (!installer.includes("New-Object System.Text.UTF8Encoding($false)")) {
  errors.push("O instalador não possui gravação UTF-8 sem BOM compatível com PowerShell 5.1.");
}

const verifier = readFileSync(join(root, "database/verify-portus-database.ps1"), "utf8");
if (!verifier.includes('database-config.json')) {
  errors.push("O verificador não permite reparar a configuração de conexão do aplicativo.");
}

if (errors.length > 0) {
  console.error("Validação de release falhou:\n- " + errors.join("\n- "));
  process.exit(1);
}

console.log("Release pronta para build: assets, migrations, instaladores e nome do artefato validados.");
