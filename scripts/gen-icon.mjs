/** Sincroniza o ícone e o favicon oficiais do PORTUS. */
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "../..");
mkdirSync(join(root, "build"), { recursive: true });
copyFileSync(join(root, "assets", "branding", "portus-icon.png"), join(root, "build", "icon.png"));
copyFileSync(join(root, "assets", "branding", "portus-favicon.png"), join(root, "src", "renderer", "favicon.png"));
console.log("✓ ícone e favicon oficiais sincronizados");
