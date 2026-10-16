// MIT. Compare every complete archive member against immutable source and retained histories.
import {readFile,writeFile,lstat} from 'node:fs/promises';
import {resolve,dirname,join,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),measure=require('./measure.cjs');
const args={};for(let i=2;i<process.argv.length;i+=2){if(!process.argv[i].startsWith('--')||process.argv[i+1]===undefined)throw Error('Use --name value arguments');args[process.argv[i].slice(2)]=process.argv[i+1];}
for(const k of ['candidate-export','checkpoint','product','out'])if(!args[k])throw Error('Required --'+k);
if(Boolean(args.source)===Boolean(args['source-html']))throw Error('Choose exactly one of --source or --source-html');
if(!['fleet','water','distribution','procurement'].includes(args.product))throw Error('Choose fleet, water, distribution or procurement');
const sha=b=>createHash('sha256').update(b).digest('hex'),same=(bytes,meta,label)=>{if(bytes.length!==meta.bytes||sha(bytes)!==meta.sha256)throw Error(label+' identity differs');};
function safe(root,path){if(typeof path!=='string'||isAbsolute(path)||path.includes('\\')||path.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Unsafe original path');return join(root,path);}
async function bank(root){root=resolve(root);const raw=await readFile(join(root,'source-manifest.json'),'utf8'),m=JSON.parse(raw),out={};for(const e of m.files){let p=root;for(const part of e.path.split('/')){p=safe(p,part);if((await lstat(p)).isSymbolicLink())throw Error('Source link is not an original file');}const b=await readFile(p);same(b,e,e.path);const t=b.toString('utf8');if(!Buffer.from(t).equals(b))throw Error('Source UTF-8 differs');out[e.path]=t;}out['source-manifest.json']=raw;return out;}
async function htmlBank(path,product){const html=await readFile(resolve(path),'utf8'),id={fleet:'fleet-availability',water:'water-operations',distribution:'distribution-lot-order',procurement:'procurement-savings'}[product],open='<script id="'+id+'-source" type="application/json">',at=html.indexOf(open),end=html.indexOf('</script>',at+open.length);if(at<0||end<0)throw Error('Complete source bank is missing from the selected ordinary application');const p=JSON.parse(html.slice(at+open.length,end));if(p.schema!=='tjlabs.'+id+'-source-bank.v1')throw Error('Source bank belongs to another product');const bytes=p.encoding==='gzip+base64'?gunzipSync(Buffer.from(p.content_base64,'base64')):Buffer.from(JSON.stringify(p.files));same(bytes,p,'Embedded complete source');const files=JSON.parse(bytes.toString('utf8'));if(!Buffer.from(JSON.stringify(files)).equals(bytes))throw Error('Complete source bank order or UTF-8 differs');const manifest=JSON.parse(files['source-manifest.json']),names=new Set();for(const e of manifest.files){safe('/source',e.path);if(names.has(e.path)||typeof files[e.path]!=='string')throw Error('Complete source inventory differs');names.add(e.path);same(Buffer.from(files[e.path]),e,e.path);}if(names.has('source-manifest.json')||Object.keys(files).length!==names.size+1||!names.has('SOURCE_MANIFEST.json'))throw Error('Complete source manifest closure differs');return files;}
async function checkpoint(){const path=resolve(args.checkpoint),packet=JSON.parse(await readFile(path,'utf8'));if(packet.schema==='complete-json-checkpoint/v1')return packet;
 if(packet.encoding==='gzip+base64'){const b=gunzipSync(Buffer.from(packet.content_base64,'base64'));same(b,packet.compact,'Compact checkpoint');return JSON.parse(b.toString('utf8'));}
 if(Array.isArray(packet.parts)){const root=resolve(args['checkpoint-root']||dirname(path)),parts=[];for(const p of packet.parts){const b=await readFile(safe(root,p.path));same(b,p,p.path);parts.push(b);}const b=Buffer.concat(parts);same(b,{bytes:packet.compactBytes??packet.bytes,sha256:packet.compactSha256??packet.sha256},'Complete compact checkpoint');return JSON.parse(b.toString('utf8'));}
 throw Error('Choose a retained complete compact checkpoint');}
const files=args['source-html']?await htmlBank(args['source-html'],args.product):await bank(args.source),candidateSource=await readFile(resolve(args['candidate-export']),'utf8'),graph=await checkpoint(),progress=row=>process.stderr.write(JSON.stringify(row)+'\n');
const sourceIdentity={bytes:Buffer.byteLength(JSON.stringify(files)),sha256:sha(JSON.stringify(files))},inputIdentity={bytes:Buffer.byteLength(JSON.stringify(graph)),sha256:sha(JSON.stringify(graph))};
function validateBaseline(baseline,product,sourceIdentity,inputIdentity,executionSource){
 if(baseline.schema!=='commons.complete-export-throughput-measurement.v1'||baseline.product!==product||baseline.sourceIdentity?.sha256!==sourceIdentity.sha256||baseline.sourceIdentity?.bytes!==sourceIdentity.bytes||baseline.inputIdentity?.sha256!==inputIdentity.sha256||baseline.inputIdentity?.bytes!==inputIdentity.bytes||baseline.executionIdentity?.sha256!==sha(executionSource)||baseline.executionIdentity?.bytes!==Buffer.byteLength(executionSource))throw Error('Retained baseline belongs to different source or complete input');
 if(baseline.status?.done!==true||!Array.isArray(baseline.members)||baseline.status.entries!==baseline.members.length||!Number.isFinite(baseline.executionMilliseconds)||baseline.executionMilliseconds<0)throw Error('Retained baseline is not a complete comparison');
 same(Buffer.from(JSON.stringify(baseline.members)),baseline.memberIdentity,'Retained complete member list');
 return baseline;
}
const baselinePath=resolve(args.out)+'.baseline.json';
let baseline;
try{baseline=validateBaseline(JSON.parse(await readFile(baselinePath,'utf8')),args.product,sourceIdentity,inputIdentity,files['host/export-core.mjs']);}
catch(error){if(error.code!=='ENOENT')throw error;baseline=await measure(args.product,files,graph,files['host/export-core.mjs'],progress);await writeFile(baselinePath,JSON.stringify(baseline,null,2)+'\n',{flag:'wx'});}
const candidate=await measure(args.product,files,graph,candidateSource,progress);
if(baseline.memberIdentity.sha256!==candidate.memberIdentity.sha256||baseline.members.length!==candidate.members.length)throw Error('Complete ordered archive metadata or actual compressed bytes differ');
const result={schema:'commons.complete-export-throughput-comparison.v1',product:args.product,equivalent:true,baseline,candidate};
await writeFile(resolve(args.out),JSON.stringify(result,null,2)+'\n',{flag:'wx'});process.stdout.write(args.out+'\n');
