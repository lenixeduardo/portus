import { cpSync, copyFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
const version = packageJson.version;
const arch = "x64";

if (!version) {
  throw new Error("Não foi possível identificar a versão do PORTUS pelo npm.");
}

const installerName = `PORTUS-Setup-${version}-${arch}.exe`;
const source = join(projectRoot, "release", installerName);
const destination = join(projectRoot, installerName);

if (!existsSync(source)) {
  throw new Error(`Instalador não encontrado em ${source}. Verifique a saída do electron-builder.`);
}

copyFileSync(source, destination);
// Distribui a pasta database completa ao lado do instalador em release.
const databaseSource = join(projectRoot, "database");
const databaseDestination = join(projectRoot, "release", "database");
if (!existsSync(databaseSource)) {
  throw new Error("Pasta database não encontrada; pacote incompleto.");
}
for (const required of [
  "install-portus-database.bat",
  "install-portus-database.ps1",
  "migrations",
  "portus-db-utility.bat",
  "migration-runtime"
]) {
  if (!existsSync(join(databaseSource, required))) {
    throw new Error(`Recurso obrigatório ausente: ${required}`);
  }
}
rmSync(databaseDestination, { recursive: true, force: true });
cpSync(databaseSource, databaseDestination, { recursive: true });
console.log(`Pasta database distribuída em: ${databaseDestination}`);
console.log(`Instalador final disponível na raiz: ${basename(destination)}`);
