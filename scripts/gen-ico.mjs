/** Sincroniza o ícone multirresolução oficial usado pelo instalador Windows. */
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "../..");
mkdirSync(join(root, "build"), { recursive: true });
copyFileSync(join(root, "assets", "branding", "portus-icon.ico"), join(root, "build", "icon.ico"));
console.log("✓ icon.ico oficial sincronizado");
