#!/usr/bin/env node
import {readFile,writeFile,mkdir,stat} from "node:fs/promises";
import {resolve,join} from "node:path";
import {createHash} from "node:crypto";
import {createManufacturingStudyCore} from "../src/study-core.mjs";
const sha256=text=>createHash("sha256").update(text,"utf8").digest("hex");
const core=createManufacturingStudyCore(sha256);
const decode=b=>new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(b);
async function readText(path){const meta=await stat(path);if(!meta.isFile()||meta.size>128*1024*1024)throw Error("Select an ordinary UTF-8 input file no larger than 128 MiB");return decode(await readFile(path));}
async function createDirectory(path){await mkdir(path,{recursive:false});}
const [command,inputArg,outputArg]=process.argv.slice(2);
try{
 if(command==="template"&&inputArg&&!outputArg){
  const destination=resolve(inputArg),template=core.template();await createDirectory(destination);
  await writeFile(join(destination,"study.json"),JSON.stringify({schema:template.schema,study_label:template.study_label},null,2)+"\n",{flag:"wx"});
  for(const file of Object.values(template.originals))await writeFile(join(destination,file.filename),file.content,{encoding:"utf8",flag:"wx"});
  console.log(JSON.stringify({created:destination,files:["study.json",...Object.values(template.originals).map(f=>f.filename)]},null,2));
 }else if(command==="run"&&inputArg&&outputArg){
  const directory=resolve(inputArg),destination=resolve(outputArg),configurationText=await readText(join(directory,"study.json")),configuration=JSON.parse(configurationText.replace(/^\uFEFF/,""));
  const configurationOriginal={filename:"study.json",content:configurationText,sha256:sha256(configurationText)};
  const input={schema:configuration.schema,study_label:configuration.study_label,originals:{}};
  for(const kind of Object.keys(core.headers))input.originals[kind]={filename:kind+".csv",content:await readText(join(directory,kind+".csv"))};
  const result=core.compile(input);
  const fields=["cycle_id","clip_id","study_id","product_revision","station","included","exclusion_reason","quality_record","reviewer","start_seconds","end_seconds","elapsed_seconds","manual_span_seconds","machine_span_seconds","wait_span_seconds","manual_machine_overlap_seconds","observed_span_seconds","unlabelled_span_seconds","manual_track_seconds"];
  const outputs={"Complete_Study.json":JSON.stringify({...result,configuration_original:configurationOriginal},null,2)+"\n","Study_Report.html":core.report(result),"Cycle_Results.csv":core.csv(result.cycle_reports,fields),"Effort_Comparisons.json":JSON.stringify(result.effort_comparisons,null,2)+"\n"};
  const manifest=Object.entries(outputs).map(([name,content])=>({name,bytes:Buffer.byteLength(content),sha256:sha256(content)}));
  await createDirectory(destination);await createDirectory(join(destination,"originals"));
  for(const [name,content]of Object.entries(outputs))await writeFile(join(destination,name),content,{encoding:"utf8",flag:"wx"});
  for(const f of [...Object.values(input.originals),configurationOriginal])await writeFile(join(destination,"originals",f.filename),f.content,{encoding:"utf8",flag:"wx"});
  await writeFile(join(destination,"Manifest.json"),JSON.stringify({schema:"tjlabs.manufacturing-study-files.v1",files:manifest,originals:[...Object.entries(result.originals),["configuration",configurationOriginal]].map(([kind,f])=>({kind,name:f.filename,bytes:Buffer.byteLength(f.content),sha256:f.sha256}))},null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({created:destination,cycles:result.cycle_reports.length,comparisons:result.effort_comparisons.length,files:manifest},null,2));
 }else throw Error("Use: node native/study.mjs template NEW_INPUT_DIRECTORY\nor: node native/study.mjs run INPUT_DIRECTORY NEW_OUTPUT_DIRECTORY");
}catch(error){console.error(error.message);process.exitCode=1;}
