// Falha o build se o Electron ainda depender de SQLite em sua árvore runtime.
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, resolve, relative } from "node:path";

const root=process.cwd();
const entry=resolve(root,"src/main/index.ts");
const blocked=[
 /[/\\]db[/\\]query\.ts$/,
 /[/\\]db[/\\]connection\.ts$/,
 /[/\\]db[/\\]migrate\.ts$/,
 /[/\\]db[/\\]migrations\.ts$/,
 /[/\\]db[/\\]seed\.ts$/,
 /[/\\]db[/\\]import-legacy-catalog\.ts$/,
 /[/\\]db[/\\](?:users|products|equipments|settings|batches|capture|history)-repo\.ts$/
];
const inspected=new Set();
const pending=[[entry,[]]];
const violations=[];
const pkg=JSON.parse(readFileSync("package.json","utf8"));
if(pkg.dependencies?.["sql.js"])violations.push("sql.js permanece em dependencies de runtime");

while(pending.length){
 const [file,parents]=pending.pop();
 if(inspected.has(file))continue;
 inspected.add(file);
 const contents=readFileSync(file,"utf8");
 const source=contents.replace(/^\s*import\s+type\b[^;]*;?/gm,"");
 const refs=[...source.matchAll(/\bfrom\s+["']([^"']+)["']/g),
             ...source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
             ...source.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g)];
 for(const match of refs){
  const spec=match[1];
  if(spec==="sql.js") {
   violations.push([...parents,relative(root,file),spec].join(" -> "));
   continue;
  }
  if(!spec.startsWith("."))continue;
  const base=resolve(dirname(file),spec);
  const paths=[base,base+".ts",base+".tsx",base+".js",resolve(base,"index.ts")];
  const target=paths.find(p=>existsSync(p)&&(/\.(?:ts|tsx|js)$/.test(p)));
  if(!target)continue;
  if(blocked.some(pattern=>pattern.test(target))){
   violations.push([...parents,relative(root,file),relative(root,target)].join(" -> "));
  } else {
   pending.push([target,[...parents,relative(root,file)]]);
  }
 }
}
if(violations.length){
 console.error("FAIL: runtime ainda depende de SQLite:\n"+violations.join("\n"));
 process.exit(1);
}
console.log("PASS: Electron PostgreSQL-only; "+inspected.size+" módulos runtime inspecionados.");
