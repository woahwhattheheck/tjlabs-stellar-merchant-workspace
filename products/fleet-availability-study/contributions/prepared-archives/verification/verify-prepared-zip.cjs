#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(process.argv[2]||'.'),manifestText=fs.readFileSync(path.join(root,'SOURCE_MANIFEST.json'),'utf8'),manifest=JSON.parse(manifestText),files={};
for(const m of manifest.members){const p=path.resolve(root,m.path);if(!p.startsWith(root+path.sep))throw Error('Unsafe source path');const bytes=fs.readFileSync(p);if(bytes.length!==m.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==m.sha256)throw Error('Source changed: '+m.path);files[m.path]=bytes.toString('utf8');}
files['SOURCE_MANIFEST.json']=manifestText;
const result=require('./complete-prepared-zip-course.cjs')(require('./before-connected_zip.cjs'),require('../src/connected_zip.cjs'),require(path.join(root,'vendor/pako.cjs')),files);
process.stdout.write(JSON.stringify(result,null,2)+'\n');
