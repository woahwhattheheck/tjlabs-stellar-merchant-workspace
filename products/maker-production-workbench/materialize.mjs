#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const [source,out]=process.argv.slice(2);if(!source||!out)throw new Error('Usage: node materialize.mjs COMPLETE_SOURCE.json NEW_DIRECTORY');
const bank=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await fs.readFile(source)));
if(!bank.files||!Array.isArray(bank.manifest))throw new Error('Complete source bank required');
const names=Object.keys(bank.files),seen=new Set();if(bank.manifest.length!==names.length)throw new Error('Manifest size differs');
for(const m of bank.manifest){if(seen.has(m.path)||!Object.hasOwn(bank.files,m.path))throw new Error('Duplicate or absent member');seen.add(m.path);if(typeof m.path!=='string'||m.path.startsWith('/')||m.path.includes('\\')||m.path.split('/').some(x=>!x||x==='.'||x==='..')||/[:\u0000-\u001f]/.test(m.path))throw new Error('Unsafe member path');if(typeof bank.files[m.path]!=='string')throw new Error('Member is not complete text');const bytes=Buffer.from(bank.files[m.path],'utf8');if(bytes.length!==m.bytes||createHash('sha256').update(bytes).digest('hex')!==m.sha256)throw new Error('Member identity differs: '+m.path);}
const dir=path.resolve(out);await fs.mkdir(dir,{recursive:false});
for(const name of names){const full=path.join(dir,name);await fs.mkdir(path.dirname(full),{recursive:true});await fs.writeFile(full,bank.files[name],{encoding:'utf8',flag:'wx'});}
await fs.writeFile(path.join(dir,'SOURCE_READBACK.json'),JSON.stringify({schema:'maker.production-materialized.v1',members:names.length,manifest:bank.manifest},null,2),{flag:'wx'});
process.stdout.write(JSON.stringify({directory:dir,members:names.length})+'\n');
