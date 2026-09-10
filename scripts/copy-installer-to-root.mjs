import { copyFileSync, existsSync, readFileSync } from "node:fs";
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
console.log(`Instalador final disponível na raiz: ${basename(destination)}`);
