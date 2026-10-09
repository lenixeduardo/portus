// Builds an offline migration runtime for the Windows PORTUS utility.
// The legacy importer needs Node.js, pg and sql.js; installers must not
// depend on npm or network access on the user's machine.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const destination=join(root,"database","migration-runtime");
const source=join(root,"scripts","import-legacy-to-postgres.mjs");
const dependencies=JSON.parse(readFileSync(join(root,"package.json"),"utf8"));
mkdirSync(destination,{recursive:true});
copyFileSync(source,join(destination,"import-legacy-to-postgres.mjs"));
writeFileSync(join(destination,"package.json"),JSON.stringify({
  name:"portus-migration-runtime",private:true,type:"module",
  dependencies:{"pg":dependencies.dependencies.pg,"sql.js":dependencies.devDependencies["sql.js"]}
},null,2)+"\n","utf8");

if (process.platform==="win32") {
  copyFileSync(process.execPath,join(destination,"node.exe"));
}
if (!existsSync(join(destination,"node_modules","pg","package.json")) ||
    !existsSync(join(destination,"node_modules","sql.js","package.json"))) {
  execFileSync(process.platform==="win32"?"npm.cmd":"npm",[
    "install","--prefix",destination,"--omit=dev","--ignore-scripts","--no-audit","--no-fund"
  ], {stdio:"inherit",timeout:180000});
}
console.log("PORTUS migration runtime ready:",destination);
