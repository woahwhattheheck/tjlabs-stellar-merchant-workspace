#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createCostingAPI} from "../costing/core.mjs";
import {runCostingCourse} from "../costing/course.mjs";
import {reportMarkdown,reportHTML,reportCSV} from "../costing/report.mjs";
import {runtime} from "./runtime.mjs";
import {ownedDirectory,writeMember} from "./io.mjs";
const out=process.argv[2];if(!out)throw Error("Usage: node native/run-costing-course.mjs NEW_OUTPUT_DIRECTORY");
const inputPath=fileURLToPath(new URL("../examples/authored-input.json",import.meta.url)),input=JSON.parse(fs.readFileSync(inputPath,"utf8")),api=createCostingAPI(runtime);
const result=runCostingCourse(api,runtime,input);result.execution="Actual Node "+process.version+" production modules";
const root=ownedDirectory(out,{engine:api.engine,authoredInputSha256:runtime.sha256(fs.readFileSync(inputPath))}),members=[];
for(const [name,body]of[["course-result.json",JSON.stringify(result,null,2)+"\n"],["Authored_Workspace.json",api.exportWorkspace(result.exampleWorkspace).content],["Blank_Workspace.json",api.exportWorkspace(result.blankWorkspace).content],["Authored_Comparison.json",JSON.stringify(result.comparison,null,2)+"\n"]])members.push(writeMember(root,name,body));
for(let i=0;i<result.exampleWorkspace.editions.length;i++){const e=result.exampleWorkspace.editions[i],prefix="edition-"+(i+1);for(const [ext,body]of[["json",JSON.stringify(e.report,null,2)+"\n"],["md",reportMarkdown(e.report)],["html",reportHTML(e.report)],["csv",reportCSV(e.report)]])members.push(writeMember(root,prefix+"."+ext,body));}
for(const s of result.exampleWorkspace.sources)members.push(writeMember(root,"originals/"+s.name,runtime.fromBase64(s.content_base64)));
writeMember(root,"COMPLETE.json",JSON.stringify({schema:"tjlabs.cpg-native-course-result.v1",engine:api.engine,checks:result.checks.length,status:result.status,members},null,2)+"\n");
process.stdout.write(JSON.stringify({status:result.status,checks:result.checks.length,destination:path.resolve(root)})+"\n");
