#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve,relative,sep} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createStreamedArchiveSource}=require('./streamed-archive-source.cjs');
const {readCompleteExportRanges}=require('./ordinary-zip-range.cjs');
const [manifestPath,resultPath,...extra]=process.argv.slice(2);
if(!manifestPath||extra.length)throw new Error('Usage: node read-streamed-archive.mjs ARCHIVE_MANIFEST.json [RESULT.json]');
const manifest=JSON.parse(await readFile(manifestPath,'utf8')),root=resolve(dirname(manifestPath));
const source=createStreamedArchiveSource(manifest,async part=>{
 const path=resolve(root,part.path),within=relative(root,path);
 if(within==='..'||within.startsWith('..'+sep))throw new Error('Archive part escaped its directory');
 return readFile(path,'utf8');
});
const receipt=await readCompleteExportRanges(source,{
 maxBytes:0xffffffff,maxEntries:65535,maxUncompressedBytes:0x7fffffff,
 maxCapturedEntryBytes:32*1024*1024,expectedSha256:manifest.sha256
});
const output={...receipt,sourceStats:source.stats()};
if(resultPath)await writeFile(resultPath,JSON.stringify(output,null,2)+'\n',{flag:'wx'});
process.stdout.write(JSON.stringify({schema:output.schema,bytes:output.bytes,sha256:output.sha256,
 members:output.members.length,uncompressedBytes:output.uncompressedBytes,
 exportManifest:output.exportManifest,sourceStats:output.sourceStats,resultPath:resultPath??null},null,2)+'\n');
