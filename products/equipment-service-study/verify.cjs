#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
async function main(){
 const root=__dirname,manifestText=fs.readFileSync(path.join(root,'SOURCE_MANIFEST.json'),'utf8'),manifest=JSON.parse(manifestText),files=manifest.files.map(x=>{const content=fs.readFileSync(path.join(root,x.path),'utf8');if(crypto.createHash('sha256').update(content).digest('hex')!==x.sha256)throw Error('Source mismatch '+x.path);return{path:x.path,content};}).concat([{path:'SOURCE_MANIFEST.json',content:manifestText}]);
 const financial=require('./verification/financial-report-peer.cjs').run(),model=require('./examples/build-course.cjs').run(),commerce=require('./commerce-course.cjs').course(),browser=await require('./operator/browser-course.cjs')(files),native=require('./operator/native-course.cjs')(files,s=>new TextEncoder().encode(s),b=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(b));
 process.stdout.write(JSON.stringify({execution:'Actual maintained domain and generated handlers. Browser and native-command courses use explicitly injected services; see RECEIVING.md for real browser/OS receiving.',model:model.checks,financial:financial.checks,commerce:commerce.checks,browser,native},null,2)+'\n');
}main().catch(e=>{process.stderr.write(e.stack+'\n');process.exitCode=1;});
