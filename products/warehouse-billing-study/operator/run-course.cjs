#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
const read=p=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(fs.readFileSync(p));
async function main(){const manifest=JSON.parse(read(path.join(root,'SOURCE_MANIFEST.json'))),files=manifest.files.map(x=>({path:x.path,content:read(path.join(root,x.path))}));const model=require('../examples/build-course.cjs').run(read(path.join(root,'examples/public-activity.csv'))),browser=await require('./browser-course.cjs')(files),native=require('./native-course.cjs')(files,s=>new TextEncoder().encode(s),b=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(b));process.stdout.write(JSON.stringify({model:model.checks,browser,native},null,2)+'\n');}
main().catch(e=>{process.stderr.write(e.stack+'\n');process.exitCode=1;});
