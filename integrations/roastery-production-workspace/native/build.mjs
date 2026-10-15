import { readFile,mkdir,writeFile } from "node:fs/promises";
import { resolve,join } from "node:path";
import { buildRoasteryHTML } from "../src/build.mjs";
import { createRoasteryCore } from "../src/roastery-core.mjs";
const [target,programmePath]=process.argv.slice(2);if(!target)throw Error("Usage: node native/build.mjs new-output-directory [programme.json]");
const source=async p=>readFile(new URL("../"+p,import.meta.url),"utf8");
const [core,store,operator,css,template,workedText]=await Promise.all(["src/roastery-core.js","src/browser-store.js","src/operator.js","src/style.css","src/template.html","examples/worked-workspace.json"].map(source));
const factory=createRoasteryCore(),blank=factory.empty(),worked=factory.reopen(JSON.parse(workedText));if(programmePath){const programme=JSON.parse(await readFile(resolve(programmePath),"utf8"));if(!Array.isArray(programme.profiles))throw Error("Programme requires profiles");blank.prospectProgramme=programme;worked.prospectProgramme=programme}
const inputs={core,store,operator,css,template},directory=resolve(target);await mkdir(directory);
for(const [name,w]of [["Roastery_Production_Desk",blank],["Roastery_Worked_Example",worked]]){await writeFile(join(directory,name+".html"),buildRoasteryHTML({...inputs,workspace:w}),{flag:"wx"});await writeFile(join(directory,name+".json"),JSON.stringify(w,null,2)+"\n",{flag:"wx"})}
console.log(JSON.stringify({directory,files:4},null,2));
