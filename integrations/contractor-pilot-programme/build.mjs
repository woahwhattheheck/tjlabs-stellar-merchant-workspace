#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {buildProgrammeArtifacts} from './src/build.mjs';
const [inputPath,outPath]=process.argv.slice(2);
if(!inputPath||!outPath){throw Error("Usage: node build.mjs complete-programme-or-workspace.json NEW_DIRECTORY");}
const root=path.dirname(fileURLToPath(import.meta.url));
const source=fs.readFileSync(inputPath);const input=JSON.parse(new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(source).replace(/^\uFEFF/,""));
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const outputs=buildProgrammeArtifacts({input,coreSource:read('src/prospect-core.js'),codecSource:read('vendor/archive-codec.js'),operatorSource:read('src/operator.js'),style:read('src/style.css'),shell:read('src/shell.template.html')});
const out=path.resolve(outPath);fs.mkdirSync(out,{mode:0o700});
const members=[];for(const[name,body]of Object.entries(outputs)){const file=path.join(out,name);fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file,body,{encoding:'utf8',flag:'wx',mode:0o600});members.push({path:name,bytes:Buffer.byteLength(body),sha256:createHash('sha256').update(body).digest('hex')});}
fs.writeFileSync(path.join(out,'Original_Input.json'),source,{flag:'wx',mode:0o600});
const result={schema:"tjlabs.programme-build.v1",operation_id:input.operation_id||input.programme.operation_id,original_input:{bytes:source.length,sha256:createHash('sha256').update(source).digest('hex')},files:members};
fs.writeFileSync(path.join(out,'Build_Manifest.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});process.stdout.write(JSON.stringify(result,null,2)+'\n');
