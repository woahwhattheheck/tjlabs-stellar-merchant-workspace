import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {runFieldFilingControllerCourse} from "./controller-course.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),out=process.argv[2];
if(!out)throw Error("Usage: node receiving/run-controller-course.mjs NEW_DIRECTORY");
const names=["vendor/archive-codec.js","field-filing-core.js","workbench/field-workspace.js","workbench/operator.js"];
const files=Object.fromEntries(await Promise.all(names.map(async p=>[p,await fs.readFile(path.join(root,p),"utf8")]))),blank=JSON.parse(await fs.readFile(path.join(root,"examples/blank-desk.json"),"utf8")),worked=JSON.parse(await fs.readFile(path.join(root,"examples/worked-desk.json"),"utf8"));
const result=await runFieldFilingControllerCourse({files,blank,worked});await fs.mkdir(out);await fs.writeFile(path.join(out,"controller-result.json"),JSON.stringify(result,null,2)+"\n",{flag:"wx"});console.log(JSON.stringify({checks:result.checks.length,out}));
