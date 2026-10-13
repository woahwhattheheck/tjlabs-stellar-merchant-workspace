// SPDX-License-Identifier: MIT
// Complete original preparation receiving; no native command, provider call or second journal.
import {resolve,join,dirname,basename,relative,sep,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {readdir,lstat} from 'node:fs/promises';
import {inspectCommissioningInstallation} from './installation.mjs';
import {prepareCommissioningInstallation,INSTALLATION_SCHEMA} from './installation-core.mjs';
import {readWorkflowSeriesPrivateFile,workflowSeriesPrivateDirectory} from '../../stellar-forge/mcp-merchant-operator/workflow-series-connection.mjs';
import {writeConsoleWorkflowFile} from '../../stellar-forge/mcp-merchant-operator/console/client-files.mjs';

const MAX_FILE=64*1024*1024;
const CONTINUATION='Open installation-input.json through the original Installation preview/save. Preserve the original native save UUID and every funded/Workshare check.';
const folders=['blobs','commands','results','reviews','runs','buyers'];
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const parse=raw=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
const need=(ok,message)=>{if(!ok)throw Object.assign(new Error(message),{code:'INSTALLATION_SOURCE_RECEIVING'});};
const identity=raw=>({bytes:raw.length,sha256:hash(raw)});
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const ordered=value=>Array.isArray(value)?value.map(ordered):record(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
function pathName(name){
  need(typeof name==='string'&&name.length<=1000&&!name.includes('\\')&&!name.startsWith('/')&&
    name.split('/').every(part=>part&&part!=='.'&&part!=='..'&&!/[:\x00-\x1f\x7f]/.test(part)),
    'Keep each original ordinary relative preparation path.');
  return name;
}
function descriptor(row){
  need(record(row)&&Number.isSafeInteger(row.bytes)&&row.bytes>=0&&row.bytes<=MAX_FILE&&sha(row.sha256),
    'Keep the complete original preparation file identity.');
  pathName(row.path);return {path:row.path,bytes:row.bytes,sha256:row.sha256};
}
function parentsOf(names){
  const allowed=new Set(['inputs','commissioning-source',...folders.map(name=>'commissioning-source/'+name)]);
  for(const name of names){let parts=name.split('/');parts.pop();while(parts.length){allowed.add(parts.join('/'));parts.pop();}}
  return allowed;
}
async function privateParents(root,name,create=false){
  let directory=root;
  for(const part of name.split('/').slice(0,-1)){
    directory=join(directory,part);await workflowSeriesPrivateDirectory(directory,create);
  }
}
async function pinned(root,row){
  await privateParents(root,row.path);
  const raw=await readWorkflowSeriesPrivateFile(join(root,row.path),MAX_FILE);
  need(raw.length===row.bytes&&hash(raw)===row.sha256,'A complete original preparation member differs: '+row.path+'.');
  return {...row,raw};
}
/** Check the whole directory without deleting unlisted files or publication evidence. */
async function inventory(root,rows,{partial=false}={}){
  const expected=new Map(rows.map(row=>[row.path,row])),directories=parentsOf([...expected.keys()]),found=new Set();
  async function visit(base){
    const directory=base?join(root,base):root;await workflowSeriesPrivateDirectory(directory);
    for(const name of (await readdir(directory)).sort()){
      const rel=base?base+'/'+name:name,path=join(root,rel),stat=await lstat(path);
      need(!stat.isSymbolicLink(),'An original preparation path became a symbolic link: '+rel+'.');
      if(stat.isDirectory()){
        need(directories.has(rel),'An unlisted directory is present in the complete preparation: '+rel+'.');
        await visit(rel);continue;
      }
      need(stat.isFile(),'Use only complete ordinary original preparation files: '+rel+'.');
      if(expected.has(rel)){found.add(rel);continue;}
      // The unchanged exclusive publisher may leave its complete temporary hard link
      // after a crash. It is an alias, not another source member; retain it in place.
      const match=/^\.(.+)\.pending-([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/.exec(name);
      const finalName=match&&(base?base+'/':'')+match[1],row=finalName&&expected.get(finalName);
      need(row,'An unlisted file is present in the complete preparation: '+rel+'.');
      const final=await lstat(join(root,finalName));
      need(final.isFile()&&!final.isSymbolicLink()&&stat.dev===final.dev&&stat.ino===final.ino&&
        stat.nlink===2&&final.nlink===2,'An unlisted publication file is not the original completed alias: '+rel+'.');
      const raw=await readWorkflowSeriesPrivateFile(path,MAX_FILE);
      need(raw.length===row.bytes&&hash(raw)===row.sha256,'The complete original publication alias differs: '+rel+'.');
    }
  }
  await visit('');
  if(!partial)need(found.size===expected.size&&[...expected.keys()].every(name=>found.has(name)),
    'The complete original preparation inventory is missing a declared member.');
  return found;
}
function exact(raw,expected,label){
  const bytes=Buffer.isBuffer(expected)?expected:encode(expected);
  need(raw.equals(bytes),'The complete prepared '+label+' differs from its original inputs and maintained compiler.');
}

/**
 * Read only a completed, externally pinned original preparation.
 * files contains every full byte buffer, including INSTALLATION_PREPARATION.json last.
 * Outputs are recomputed by the existing compiler before any native use.
 */
export async function readPreparedInstallation(directory,expectedSha256){
  need(sha(expectedSha256),'Bind the exact original INSTALLATION_PREPARATION.json SHA256.');
  const root=await workflowSeriesPrivateDirectory(resolve(directory));
  const manifestRaw=await readWorkflowSeriesPrivateFile(join(root,'INSTALLATION_PREPARATION.json'),MAX_FILE);
  const manifestIdentity=identity(manifestRaw);
  need(manifestIdentity.sha256===expectedSha256,'The selected complete preparation receipt differs.');
  const original=parse(manifestRaw);
  need(record(original)&&original.schema===INSTALLATION_SCHEMA&&original.mode==='prepare'&&Array.isArray(original.files),
    'Use a complete original mode=prepare result; inputs and templates are not native Installation input.');
  const rows=original.files.map(descriptor),names=new Set();
  for(const row of rows){need(row.path!=='INSTALLATION_PREPARATION.json'&&!names.has(row.path),
    'The original preparation repeats or self-lists a member.');names.add(row.path);}
  const receiptRow={path:'INSTALLATION_PREPARATION.json',...manifestIdentity},allRows=[...rows,receiptRow];
  await inventory(root,allRows);
  const inspected=await inspectCommissioningInstallation(root);
  need(inspected.receipt.bytes===manifestIdentity.bytes&&inspected.receipt.sha256===manifestIdentity.sha256,
    'The original preparation changed during its maintained inspection.');
  const files=[];for(const row of rows)files.push(await pinned(root,row));
  const byName=new Map(files.map(file=>[file.path,file]));
  function raw(name){const file=byName.get(name);need(file,'The full original preparation is missing '+name+'.');return file.raw;}
  const seed=parse(raw('inputs/original-seed.json')),caseSnapshot=parse(raw('inputs/original-case.json')),
    profile=parse(raw('inputs/profile.json')),bindings=parse(raw('inputs/original-bindings.json')),
    job=parse(raw('commissioning-source/job.json')),selection=parse(raw('commissioning-source/selection.json')),
    transfer=parse(raw('commissioning-source/TRANSFER.json')),transferIdentity=identity(raw('commissioning-source/TRANSFER.json'));
  need(hash(Buffer.from(JSON.stringify(ordered(selection))))===job.selectionSha256,
    'The complete original selection no longer matches its original commissioning job.');
  const result=prepareCommissioningInstallation({seed,caseSnapshot,profile,bindings,job,transfer,transferIdentity});
  const {workorder,prepared,...binding}=result,{document,preview,...preparation}=prepared;
  need(encode(document).length<=128*1024,'The full Installation exceeds its original 128 KiB native limit.');
  const intent={schema:INSTALLATION_SCHEMA,mode:'prepare',jobId:job.id,selectionSha256:job.selectionSha256,
    transfer:transferIdentity,profile:{id:profile.id,...identity(raw('inputs/profile.json'))},
    seed:identity(raw('inputs/original-seed.json')),caseSnapshot:identity(raw('inputs/original-case.json')),
    bindings:identity(raw('inputs/original-bindings.json'))};
  exact(raw('PREPARATION_INTENT.json'),intent,'intent');
  const sourceFiles=[{path:'TRANSFER.json',...transferIdentity},...transfer.files]
    .map(file=>({...file,preparedPath:'commissioning-source/'+file.path}));
  exact(raw('source-files.json'),{schema:'stellar-forge.facilitator-installation-sources.v1',
    jobId:job.id,selectionSha256:job.selectionSha256,files:sourceFiles},'source file inventory');
  for(const [name,value]of [['bindings.json',result.bindings],['installation-input.json',document],
    ['installation-preview-input.json',preview],['WORKORDER.md',Buffer.from(workorder)],
    ['installation-source-binding.json',binding],['preparation.json',preparation]])exact(raw(name),value,name);
  const expectedOrder=['PREPARATION_INTENT.json',...transfer.files.map(file=>'commissioning-source/'+file.path),
    'commissioning-source/TRANSFER.json','inputs/profile.json','inputs/original-seed.json','inputs/original-case.json',
    'inputs/original-bindings.json','source-files.json','bindings.json','installation-input.json',
    'installation-preview-input.json','WORKORDER.md','installation-source-binding.json','preparation.json'];
  need(expectedOrder.length===files.length&&new Set(expectedOrder).size===files.length,
    'The complete original preparation member roster differs.');
  const expectedFiles=expectedOrder.map(path=>({path,...identity(raw(path))}));
  exact(manifestRaw,{...intent,files:expectedFiles,basis:result.basis,selections:prepared.selections??[],
    missingSources:result.missingSources??[],continuation:CONTINUATION},'completion receipt');
  // Full returned Buffers are the individually hash-verified original snapshot.
  // Recheck its selected receipt and roster before returning; a later copy rereads
  // every source through this same authority rather than trusting mutable results.
  exact(await readWorkflowSeriesPrivateFile(join(root,receiptRow.path),MAX_FILE),manifestRaw,'receipt bytes');
  await inventory(root,allRows);
  files.push({...receiptRow,raw:manifestRaw});
  return {directory:root,identity:manifestIdentity,receipt:inspected,files,seed,caseSnapshot,profile,bindings,
    job,transfer,document:parse(raw('installation-input.json')),previewInput:parse(raw('installation-preview-input.json')),
    binding:parse(raw('installation-source-binding.json')),preparation:parse(raw('preparation.json'))};
}
function contains(a,b){const rel=relative(a,b);return rel===''||rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel);}
/** Copy every original member create-only, then cold-read the copy through the same authority. */
export async function copyPreparedInstallation(input,destination){
  need(record(input)&&typeof input.directory==='string'&&record(input.identity)&&sha(input.identity.sha256),
    'Select the complete original readPreparedInstallation result.');
  // Reread the pinned source: caller-owned returned Buffers or parsed objects are
  // never trusted as replacement originals during publication.
  const selected=await readPreparedInstallation(input.directory,input.identity.sha256);
  need(selected.identity.bytes===input.identity.bytes,'The selected original receipt length differs.');
  const out=resolve(destination),parent=await workflowSeriesPrivateDirectory(dirname(out));
  need(join(parent,basename(out))===out&&!contains(selected.directory,out)&&!contains(out,selected.directory),
    'Choose a separate private receiving directory outside the original source and its ancestors.');
  await workflowSeriesPrivateDirectory(out,true);
  const rows=selected.files.map(({path,bytes,sha256})=>({path,bytes,sha256}));
  const found=await inventory(out,rows,{partial:true});
  // Reject every conflicting surviving member before writing any source file.
  for(const row of rows)if(found.has(row.path))await pinned(out,row);
  const directories=[...parentsOf(rows.map(row=>row.path))].sort((a,b)=>a.split('/').length-b.split('/').length||a.localeCompare(b));
  for(const name of directories)await privateParents(out,name+'/member',true);
  for(const file of selected.files){
    await privateParents(out,file.path,true);
    await writeConsoleWorkflowFile(join(out,file.path),file.raw);
  }
  return readPreparedInstallation(out,selected.identity.sha256);
}
