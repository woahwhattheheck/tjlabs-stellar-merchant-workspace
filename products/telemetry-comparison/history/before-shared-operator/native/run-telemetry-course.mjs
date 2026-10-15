#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {runtime} from "./runtime.mjs";
import {ownedDirectory,writeMember} from "./io.mjs";
import {createTelemetryAPI} from "../telemetry/core.mjs";
import {receivingCourse} from "../telemetry/course.mjs";
import {throughputCourse} from "../telemetry/throughput.mjs";
const args=process.argv.slice(2),destination=args[0],capacity=args[1]==="--capacity";
if(!destination||args.length>2||(args[1]&&!capacity))throw Error("Usage: node native/run-telemetry-course.mjs NEW_DIRECTORY [--capacity]");
const core=fs.readFileSync(new URL("../telemetry/core.mjs",import.meta.url)),course=fs.readFileSync(new URL("../telemetry/course.mjs",import.meta.url)),load=fs.readFileSync(new URL("../telemetry/throughput.mjs",import.meta.url)),identity=runtime.sha256(Buffer.concat([core,course,load,Buffer.from(capacity?"capacity":"standard")]));
const root=ownedDirectory(destination,identity),checkpoint=path.join(root,"COURSE.json"),api=createTelemetryAPI(runtime);let result;
if(fs.existsSync(checkpoint)){result=api.parseJSON(fs.readFileSync(checkpoint,"utf8"));if(result.sourceIdentity!==identity)throw Error("Course source changed");api.importWorkspace(JSON.stringify(result.workspace));}
else{result=receivingCourse(runtime);result.sourceIdentity=identity;if(capacity)result.capacity=throughputCourse(api,runtime,1000,12);writeMember(root,"COURSE.json",JSON.stringify(result)+"\n");}
if(!result.cases.every(x=>x.passed))throw Error("Incomplete course checkpoint");
const working=api.exportWorkspace(result.workspace),files=[];
files.push(writeMember(root,"Telemetry_Workspace.json",working.content));
files.push(writeMember(root,"Comparison.json",JSON.stringify(result.comparison,null,2)+"\n"));
files.push(writeMember(root,"COURSE.json",JSON.stringify(result)+"\n"));
writeMember(root,"COMPLETE.json",JSON.stringify({schema:"tjlabs.telemetry-course-complete.v1",sourceIdentity:identity,files,capacity},null,2)+"\n");
process.stdout.write(JSON.stringify({directory:root,cases:result.cases.length,elapsedMs:result.elapsedMs,capacity:result.capacity||null})+"\n");
