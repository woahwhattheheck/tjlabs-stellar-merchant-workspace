import {readFile,mkdir,writeFile} from "node:fs/promises";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),".."),target=process.argv[2];if(!target)throw Error("Usage: node native/build.mjs NEW_OUTPUT_DIRECTORY");
const read=p=>readFile(join(root,p),"utf8");
const [coreSource,controllerSource,storeSource,operatorSource,style,template,builderSource]=await Promise.all(["src/brewery-core.js","operator/controller.js","operator/browser-store.js","operator/operator.js","operator/style.css","operator/template.html","operator/build.js"].map(read));
const build=Function(builderSource+"\nreturn buildBreweryDesk;")(),options={coreSource,controllerSource,storeSource,operatorSource,style,template};
await mkdir(target,{recursive:false});
for(const [mode,name] of [["blank","Brewery_Onboarding_Desk.html"],["worked","Brewery_Worked_Example.html"]]){const workspace=JSON.parse(await read("operator/"+mode+"-workspace.json"));await writeFile(join(target,name),build({...options,workspace}),{encoding:"utf8",flag:"wx"})}
