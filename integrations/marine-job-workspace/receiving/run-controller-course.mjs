import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {runMarineJobControllerCourse} from "./controller-course.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),names=["vendor/archive-codec.js","marine-job-core.js","workbench/marine-workspace.js","workbench/operator.js"];const files=Object.fromEntries(await Promise.all(names.map(async n=>[n,await fs.readFile(path.join(root,n),"utf8")])));const blank=JSON.parse(await fs.readFile(path.join(root,"examples/blank-desk.json"),"utf8")),worked=JSON.parse(await fs.readFile(path.join(root,"examples/worked-desk.json"),"utf8"));const r=await runMarineJobControllerCourse({files,blank,worked});console.log(JSON.stringify({runtime:r.runtime,checks:r.checks},null,2));
