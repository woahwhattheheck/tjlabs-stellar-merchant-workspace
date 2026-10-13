#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import {readFileSync,existsSync,lstatSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {createHash} from "node:crypto";
import {atomicJson,canonical,identity} from "../../workbench/vendor/dlt/vendor/sling/core/common.mjs";
import {defaultReview,prepareCatalogue} from "./catalogue.mjs";
import {verifySourceClaims} from "./acceptance.mjs";
import {newProject,validateProject} from "./review-state.mjs";
const check=(ok,message)=>{if(!ok)throw Error(message);};
const read=path=>{check(lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink(),"Use an ordinary complete input file");return JSON.parse(readFileSync(path,"utf8").replace(/^\uFEFF/,""));};
const pin=path=>{const body=readFileSync(path);return {path,bytes:body.length,sha256:createHash("sha256").update(body).digest("hex")};};
export async function prepareInitialProject({capture,claims=null,operation,title="Loaded Bikes catalogue migration",output,at=new Date().toISOString()}){
  check(/^[A-Za-z0-9_-]{1,120}$/.test(operation??""),"Use one stable operation name");
  check(typeof output==="string"&&output.length,"Choose the complete project output file");
  const path=resolve(output),id="loaded_bikes_"+identity({operation,capture,claims}).slice(0,40);
  if(existsSync(path)){
    const existing=validateProject(read(path));
    check(existing.id===id&&canonical(existing.capture)===canonical(capture)&&canonical(existing.claims??null)===canonical(claims),"The output already contains another project or source edition. Select a new output path.");
    await prepareCatalogue({capture:existing.capture,review:existing.review});
    if(existing.claims)verifySourceClaims({catalogue:existing.capture,claims:existing.claims});
    return {schema:"tjlabs.loaded-bikes-project-preparation.v1",projectId:id,operation,created:false,revision:existing.revision,file:pin(path)};
  }
  const review=defaultReview(capture),prepared=await prepareCatalogue({capture,review});
  if(claims)verifySourceClaims({catalogue:capture,claims});
  const project=newProject(capture,review,{id,title,claims,at});
  validateProject(project);atomicJson(path,project,{immutable:true});
  return {schema:"tjlabs.loaded-bikes-project-preparation.v1",projectId:id,operation,created:true,revision:0,file:pin(path),
    tables:prepared.tables.map(t=>({sourceTable:t.sourceTable,tableName:t.tableName,rows:t.rowCount})),
    sourceResponses:capture.responses.length+(claims?.original_response_additions?.length??0)};
}
export async function main(argv=process.argv.slice(2)){
  check(Number(process.versions.node.split(".")[0])>=24,"Use the original Node 24+ workbench runtime");
  const options={};for(let i=0;i<argv.length;i++){const key=argv[i].replace(/^--/,"");check(["capture","claims","operation","output","title"].includes(key)&&argv[i].startsWith("--")&&!Object.hasOwn(options,key),"Use each supported named option once");check(argv[i+1]&&!argv[i+1].startsWith("--"),"Supply a value for --"+key);options[key]=argv[++i];}
  for(const key of ["capture","operation","output"])check(options[key],"Supply --"+key);
  return prepareInitialProject({capture:read(resolve(options.capture)),claims:options.claims?read(resolve(options.claims)):null,operation:options.operation,output:options.output,title:options.title});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().then(result=>process.stdout.write(JSON.stringify(result,null,2)+"\n")).catch(error=>{process.stderr.write(JSON.stringify({error:"LOADED_BIKES_PROJECT_PREPARATION",message:error.message})+"\n");process.exitCode=1;});
