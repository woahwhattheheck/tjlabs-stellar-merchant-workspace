#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'SOURCE_MANIFEST.json'),'utf8'));
const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}),encoder=new TextEncoder();
const files=manifest.files.map(x=>{const p=path.resolve(root,x.path);if(!p.startsWith(root+path.sep))throw Error('Unsafe source path');const content=decoder.decode(fs.readFileSync(p));if(crypto.createHash('sha256').update(content).digest('hex')!==x.sha256)throw Error('Changed source '+x.path);return{path:x.path,content};});
(async()=>{const result={model:require('./complete-course.cjs')(),browser_handlers:await require('./browser-course.cjs')(files),native_commands:require('./native-course.cjs')(files,s=>encoder.encode(s),b=>decoder.decode(b))};process.stdout.write(JSON.stringify(result,null,2)+'\n');})().catch(e=>{process.stderr.write(e.stack+'\n');process.exitCode=1;});
