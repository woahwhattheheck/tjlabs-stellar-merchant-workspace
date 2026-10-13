#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const engine=await readFile(new URL('./maritime-analysis.mjs',import.meta.url),'utf8');
const target=new URL('./maritime-workbench.html',import.meta.url);
const html=await readFile(target,'utf8');
const boundary=/\/\/ BEGIN MARITIME ENGINE\n[\s\S]*?\n\/\/ END MARITIME ENGINE/;
if(!boundary.test(html))throw new Error('Workbench engine boundaries are missing');
const next=html.replace(boundary,()=>'// BEGIN MARITIME ENGINE\n'+engine.replace(/^export /gm,'')+'\n// END MARITIME ENGINE').replace(/const ENGINE_ID='[a-f0-9]{64}';/,()=>"const ENGINE_ID='"+createHash('sha256').update(engine).digest('hex')+"';");
await writeFile(target,next);
process.stdout.write('Updated the offline workbench from the exact analysis module; open and operate this outgoing version before delivery.\n');
