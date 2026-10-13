// SPDX-License-Identifier: MIT
// Receive the complete original operator package without invoking any provider.
import {constants} from 'node:fs';
import {open,mkdir,lstat,realpath,readdir,rename,unlink,link} from 'node:fs/promises';
import {resolve,join,dirname,basename,posix} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {inspectCommissioningTransfer} from './commissioning.mjs';
import {lockPrivateDirectory} from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/private-directory-lock.mjs';
const HASH=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const MAX_FILE=64*1024*1024,MAX_ARCHIVE=8*1024*1024*1024,MAX_MEMBERS=100000;
const fail=(message,code='OPERATOR_TRANSFER_INVALID')=>Object.assign(new Error(message),{code});
const need=(v,m,c)=>{if(!v)throw fail(m,c);};
const digest=b=>createHash('sha256').update(b).digest('hex');
const encode=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
async function privateDir(path,create=false){if(create)await mkdir(path,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});const s=await lstat(path);need(s.isDirectory()&&!s.isSymbolicLink()&&await realpath(path)===path&&(process.platform==='win32'||s.uid===process.getuid()&&(s.mode&0o077)===0),'Use a private ordinary directory owned by the receiving operator.');}
async function ordinary(path,maximum=MAX_FILE){const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const s=await h.stat();need(s.isFile()&&s.size<=maximum,'A source member is not an ordinary bounded file.');const b=await h.readFile();need(b.length===s.size,'A source member changed during reading.');return b;}finally{await h.close();}}
async function json(path,optional=false){try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await ordinary(path)));}catch(e){if(optional&&e.code==='ENOENT')return null;throw e;}}
async function identity(path,maximum=MAX_FILE){const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const s=await h.stat();need(s.isFile()&&s.size<=maximum,'An original member exceeds its ordinary file limit.');const hash=createHash('sha256');let read=0;for await(const b of h.createReadStream({autoClose:false})){read+=b.length;need(read<=maximum&&read<=s.size,'An original member grew beyond its retained limit.');hash.update(b);}need(read===s.size,'The complete original member was not read.');const a=await h.stat();need(a.size===s.size&&a.mtimeMs===s.mtimeMs&&a.ctimeMs===s.ctimeMs,'An original file changed during receiving.');return{bytes:s.size,sha256:hash.digest('hex')};}finally{await h.close();}}
async function sync(path){const h=await open(path,'r');try{await h.sync();}finally{await h.close();}}
async function publish(path,bytes){try{need((await ordinary(path)).equals(bytes),'The original receiving file has different bytes.','OPERATOR_RECEIVE_CONFLICT');return;}catch(e){if(e.code!=='ENOENT')throw e;}const tmp=join(dirname(path),'.receive-'+randomUUID());const h=await open(tmp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{try{await h.writeFile(bytes);await h.sync();}finally{await h.close();}try{await link(tmp,path);}catch(e){if(e.code!=='EEXIST')throw e;need((await ordinary(path)).equals(bytes),'The original receiving file differs.');}await sync(dirname(path));}finally{await unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e;});}}
function pathName(name){name=name.replace(/^\.\//,'').replace(/\/$/,'');need(name&&name!=='.'&&!name.includes('\\')&&!name.startsWith('/')&&!/[\x00-\x1f\x7f]/.test(name)&&name===posix.normalize(name)&&!name.split('/').some(p=>p==='..'||p==='.'||!p),'The TAR member path is not an ordinary relative source path.');return name;}
function octal(b,label){const s=b.toString('ascii').replace(/\0.*$/s,'').trim();need(/^[0-7]*$/.test(s),'The TAR '+label+' is not a supported ordinary octal field.');const n=s?parseInt(s,8):0;need(Number.isSafeInteger(n)&&n>=0,'The TAR '+label+' exceeds its limit.');return n;}
function field(b){const zero=b.indexOf(0),raw=zero<0?b:b.subarray(0,zero);return new TextDecoder('utf-8',{fatal:true}).decode(raw);}
async function extract(archive,target,expected){
  const handle=await open(archive,constants.O_RDONLY|constants.O_NOFOLLOW),seen=new Set(),files=new Map();let offset=0,members=0,zeros=0;
  const read=async(n,position)=>{const b=Buffer.alloc(n);let got=0;while(got<n){const r=await handle.read(b,got,n-got,position+got);need(r.bytesRead>0,'The complete original TAR is truncated.');got+=r.bytesRead;}return b;};
  try{
    const stat=await handle.stat();need(stat.isFile()&&stat.size===expected.bytes&&stat.size<=MAX_ARCHIVE,'Receive one complete ordinary TAR up to 8 GiB.');
    while(offset<stat.size){
      const header=await read(512,offset);offset+=512;
      if(header.every(v=>v===0)){zeros++;if(zeros>=2){while(offset<stat.size){const b=await read(Math.min(65536,stat.size-offset),offset);need(b.every(v=>v===0),'Unexpected bytes follow the completed TAR.');offset+=b.length;}break;}continue;}
      need(zeros===0,'The TAR has a nonterminal zero header.');
      const checksum=octal(header.subarray(148,156),'checksum');let total=0;for(let i=0;i<512;i++)total+=i>=148&&i<156?32:header[i];need(total===checksum,'The TAR header checksum differs.');
      need(field(header.subarray(257,263))==='ustar','Use the complete uncompressed POSIX ustar package.');
      const size=octal(header.subarray(124,136),'size'),kind=String.fromCharCode(header[156]||48),prefix=field(header.subarray(345,500)),name0=(prefix?prefix+'/':'')+field(header.subarray(0,100));
      need(['0','5'].includes(kind),'Links, special files and extended TAR headers are not accepted.');
      if(name0==='.'||name0==='./'){need(kind==='5'&&size===0,'Invalid root directory entry.');continue;}
      const name=pathName(name0);need(!seen.has(name),'A TAR member occurs more than once.');seen.add(name);need(++members<=MAX_MEMBERS,'The complete package has too many members.');
      const path=join(target,name);let parent=target;
      for(const part of name.split('/').slice(0,-1)){parent=join(parent,part);await privateDir(parent,true);}
      if(kind==='5'){need(size===0,'A directory carries unexpected body data.');await privateDir(path,true);continue;}
      need(size<=MAX_FILE&&offset+size<=stat.size,'A complete member exceeds 64 MiB or the retained archive.');
      const temp=join(dirname(path),'.receive-'+randomUUID()),out=await open(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600),hash=createHash('sha256');
      try{
        try{let copied=0;while(copied<size){const b=await read(Math.min(65536,size-copied),offset+copied);hash.update(b);await out.writeFile(b);copied+=b.length;}await out.sync();}finally{await out.close();}
        const row={path:name,bytes:size,sha256:hash.digest('hex')};
        try{await link(temp,path);}catch(e){if(e.code!=='EEXIST')throw e;const old=await identity(path);need(old.bytes===row.bytes&&old.sha256===row.sha256,'Retained staging differs from the original archive.');}
        files.set(name,row);
      }finally{await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
      offset+=Math.ceil(size/512)*512;
    }
    need(zeros>=2,'The complete TAR lacks its terminal blocks.');
    const after=await handle.stat();need(after.size===stat.size&&after.mtimeMs===stat.mtimeMs&&after.ctimeMs===stat.ctimeMs,'The source archive changed during extraction.');
    return files;
  }finally{await handle.close();}
}
const nativePath=/^(?:blobs\/[a-f0-9]{64}|(?:commands|results)\/[a-f0-9-]{36}\.json|reviews\/[a-f0-9-]{36}(?:\.buyer)?\.json|runs\/[a-f0-9-]{36}(?:\.(?:selection|started|stopped|failed))?\.json|buyers\/[a-f0-9-]{36}-[a-z0-9_-]{1,64}\.(?:json|body)|job\.json|selection\.json)$/;
const operatorPath=/^(?:instance\.json|inputs\/[a-f0-9]{64}|uploads\/[a-f0-9-]{36}(?:\.complete)?\.json|(?:requests|results|native-requests)\/[a-f0-9-]{36}\.json)$/;
async function inspectExtracted(root,files){
  const raw=await ordinary(join(root,'OPERATOR_TRANSFER.json')),m=JSON.parse(raw.toString('utf8'));
  need(m.schema==='stellar-forge.facilitator-operator-transfer.v1'&&UUID.test(m.id)&&HASH.test(m.selectionSha256)&&HASH.test(m.originalManifestSha256)&&Array.isArray(m.files),'Select a complete original operator transfer.');
  const selected=new Set(),mapped=[];
  for(const row of m.files){
    need(row&&typeof row.path==='string'&&((row.path.startsWith('job/')&&(nativePath.test(row.path.slice(4))||row.path==='job/TRANSFER.json'))||(row.path.startsWith('operator/')&&operatorPath.test(row.path.slice(9))))&&!selected.has(row.path)&&HASH.test(row.sha256)&&Number.isSafeInteger(row.bytes)&&row.bytes>=0,'The complete source inventory contains an invalid or duplicate path.');
    selected.add(row.path);const actual=files.get(row.path);need(actual&&actual.bytes===row.bytes&&actual.sha256===row.sha256,'An original manifest member is missing or different: '+row.path);
    mapped.push({...row,target:row.path.startsWith('job/')?row.path.slice(4):'.operator/'+row.path.slice(9)});
  }
  need(selected.has('job/TRANSFER.json')&&selected.has('job/job.json')&&selected.has('job/selection.json')&&selected.has('operator/instance.json'),'Receive the native job, source selection and operator identity.');
  const native=await ordinary(join(root,'job','TRANSFER.json'));need(digest(native)===m.originalManifestSha256,'The original native manifest differs.');
  const n=JSON.parse(native.toString('utf8'));need(n.jobId===m.jobId&&n.selectionSha256===m.selectionSha256,'The original job and operator identities differ.');
  const expectedNative=new Set(n.files.map(f=>'job/'+f.path));expectedNative.add('job/TRANSFER.json');
  for(const p of selected)if(p.startsWith('job/'))need(expectedNative.has(p),'The operator lists a different native source cut.');
  for(const p of expectedNative)need(selected.has(p),'The native source cut is incomplete.');
  for(const p of files.keys())if(!selected.has(p)){
    need(['OPERATOR_TRANSFER.json','OPERATOR_EXPORT_RECEIPT.json','.operator-export-intent.json','job/.export-intent.json'].includes(p),'An unlisted regular member is present.');
    if(p==='.operator-export-intent.json')need((await ordinary(join(root,p))).equals(raw),'The complete export intent differs.');
    if(p==='job/.export-intent.json')need((await ordinary(join(root,p))).equals(native),'The native export intent differs.');
  }
  for(const dir of ['blobs','commands','results','reviews','runs','buyers'])await privateDir(join(root,'job',dir),true);
  await inspectCommissioningTransfer(join(root,'job'));
  const instance=await json(join(root,'operator','instance.json'));need(instance.schema==='stellar-forge.facilitator-commissioning-operator.v1'&&UUID.test(instance.id),'The original operator instance is invalid.');
  const exportReceiptBytes=await ordinary(join(root,'OPERATOR_EXPORT_RECEIPT.json')),exportReceipt=JSON.parse(exportReceiptBytes.toString('utf8'));
  need(exportReceipt.schema==='stellar-forge.facilitator-commissioning-operator.v1'&&exportReceipt.operationId===m.id&&exportReceipt.action==='export'&&JSON.stringify(exportReceipt.result)===JSON.stringify(m),'The original completed export receipt differs from this full source cut.');
  const exportRequest=await json(join(root,'operator','requests',m.id+'.json'));
  need(exportRequest.operationId===m.id&&exportRequest.action==='export'&&exportRequest.payload&&Object.keys(exportRequest.payload).length===0,'The original export request differs.');
  return{manifest:m,mapped,manifestBytes:raw,nativeBytes:native,exportReceiptBytes};
}
async function verifyReceived(directory,receipt){
  need(receipt.schema==='stellar-forge.facilitator-operator-receive.v1'&&Array.isArray(receipt.files),'The original receiving receipt is invalid.');
  for(const f of receipt.files){need(typeof f.target==='string'&&(nativePath.test(f.target)||f.target==='TRANSFER.json'||f.target.startsWith('.operator/')&&operatorPath.test(f.target.slice(10))),'The retained receiving path is invalid.');const actual=await identity(join(directory,f.target));need(actual.bytes===f.bytes&&actual.sha256===f.sha256,'An originally received member has changed: '+f.target);}
  need(Array.isArray(receipt.metadata)&&receipt.metadata.length===4,'Retain the complete receiving metadata inventory.');
  const expectedMetadata=new Set(['.operator/received-transfer/OPERATOR_TRANSFER.json','.operator/received-transfer/TRANSFER.json','.operator/received-transfer/OPERATOR_EXPORT_RECEIPT.json','.operator/results/'+receipt.transferId+'.json']);
  for(const f of receipt.metadata){need(expectedMetadata.delete(f.path)&&HASH.test(f.sha256)&&Number.isSafeInteger(f.bytes),'The receiving metadata inventory differs.');const actual=await identity(join(directory,f.path));need(actual.bytes===f.bytes&&actual.sha256===f.sha256,'Original receiving metadata is missing or changed: '+f.path);}
  need(expectedMetadata.size===0,'The receiving metadata is incomplete.');
  const m=await json(join(directory,'.operator','received-transfer','OPERATOR_TRANSFER.json'));
  need(m.id===receipt.transferId&&m.jobId===receipt.jobId&&m.selectionSha256===receipt.selectionSha256&&m.originalManifestSha256===receipt.originalManifestSha256,'The received manifest identity differs.');
  need(JSON.stringify(m.files)===JSON.stringify(receipt.files.map(({target,...row})=>row)),'The received manifest and exact original inventory differ.');
  need(digest(await ordinary(join(directory,'.operator','received-transfer','OPERATOR_TRANSFER.json')))===receipt.operatorManifestSha256&&digest(await ordinary(join(directory,'.operator','received-transfer','TRANSFER.json')))===receipt.originalManifestSha256,'The retained manifest bytes differ.');
  const exportReceipt=await json(join(directory,'.operator','received-transfer','OPERATOR_EXPORT_RECEIPT.json'));
  need(exportReceipt.operationId===m.id&&exportReceipt.action==='export'&&JSON.stringify(exportReceipt.result)===JSON.stringify(m),'The completed original export receipt differs.');
  need((await ordinary(join(directory,'.operator','results',receipt.transferId+'.json'))).equals(await ordinary(join(directory,'.operator','received-transfer','OPERATOR_EXPORT_RECEIPT.json'))),'The installed original export receipt differs.');
  return receipt;
}
/** Source-only receiving. Original providers, listeners, buyers and signers stay untouched. */
export async function receiveOperatorTransfer({archive,directory,expected}={}){
  if(expected!==undefined)need(expected&&typeof expected==='object'&&!Array.isArray(expected)&&
    Object.keys(expected).sort().join(',')==='jobId,operatorManifestSha256,selectionSha256,transferId'&&
    /^[a-z0-9][a-z0-9_-]{0,63}$/.test(expected.jobId??'')&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(expected.transferId??'')&&
    /^[a-f0-9]{64}$/.test(expected.selectionSha256??'')&&/^[a-f0-9]{64}$/.test(expected.operatorManifestSha256??''),
    'Retain the complete original selected export identity.','OPERATOR_RECEIVE_SELECTION');
  const matchExpected=value=>{if(expected)need(['jobId','transferId','selectionSha256','operatorManifestSha256'].every(key=>value[key]===expected[key]),
    'The complete archive belongs to a different selected export.','OPERATOR_RECEIVE_SELECTION');};
  const source=resolve(archive),target=resolve(directory),parent=dirname(target);await privateDir(parent);
  const sourceId=await identity(source,MAX_ARCHIVE);need(sourceId.bytes<=MAX_ARCHIVE,'The complete archive exceeds 8 GiB.');
  const release=await lockPrivateDirectory({directory:parent,filename:'.commissioning-receive-'+digest(target).slice(0,24)+'.lock',namespace:'facilitator-operator-receive',busyCode:'RECEIVE_ALREADY_OWNED',unavailableCode:'RECEIVE_LOCK_UNAVAILABLE'});
  try{
    let exists=false;try{await lstat(target);exists=true;}catch(e){if(e.code!=='ENOENT')throw e;}
    if(exists){
      await privateDir(target);const receipt=await json(join(target,'.operator','received-transfer','receipt.json'));
      need(receipt.archive.sha256===sourceId.sha256&&receipt.archive.bytes===sourceId.bytes,'This destination received a different complete archive.','OPERATOR_RECEIVE_CONFLICT');
      matchExpected(receipt);await verifyReceived(target,receipt);return{...receipt,directory:target,replayed:true};
    }
    const stage=join(parent,'.'+basename(target)+'-receive-'+sourceId.sha256.slice(0,20));await privateDir(stage,true);
    await publish(join(stage,'intent.json'),encode({schema:'stellar-forge.facilitator-operator-receive-intent.v1',target,archive:sourceId}));
    const raw=join(stage,'archive');await privateDir(raw,true);const extracted=await extract(source,raw,sourceId),verified=await inspectExtracted(raw,extracted);
    matchExpected({jobId:verified.manifest.jobId,transferId:verified.manifest.id,selectionSha256:verified.manifest.selectionSha256,operatorManifestSha256:digest(verified.manifestBytes)});
    const assembled=join(stage,'job');await privateDir(assembled,true);
    for(const dir of ['blobs','commands','results','reviews','runs','buyers','.operator'])await privateDir(join(assembled,dir),true);
    for(const dir of ['uploads','inputs','requests','results','native-requests','plans','received-transfer'])await privateDir(join(assembled,'.operator',dir),true);
    for(const f of verified.mapped)await publish(join(assembled,f.target),await ordinary(join(raw,f.path)));
    const receipt={schema:'stellar-forge.facilitator-operator-receive.v1',archive:sourceId,transferId:verified.manifest.id,jobId:verified.manifest.jobId,selectionSha256:verified.manifest.selectionSha256,operatorManifestSha256:digest(verified.manifestBytes),originalManifestSha256:verified.manifest.originalManifestSha256,files:verified.mapped,metadata:[{path:'.operator/received-transfer/OPERATOR_TRANSFER.json',bytes:verified.manifestBytes.length,sha256:digest(verified.manifestBytes)},{path:'.operator/received-transfer/TRANSFER.json',bytes:verified.nativeBytes.length,sha256:digest(verified.nativeBytes)},{path:'.operator/received-transfer/OPERATOR_EXPORT_RECEIPT.json',bytes:verified.exportReceiptBytes.length,sha256:digest(verified.exportReceiptBytes)},{path:'.operator/results/'+verified.manifest.id+'.json',bytes:verified.exportReceiptBytes.length,sha256:digest(verified.exportReceiptBytes)}]};
    const retained=join(assembled,'.operator','received-transfer');
    await publish(join(assembled,'.operator','results',verified.manifest.id+'.json'),verified.exportReceiptBytes);
    await publish(join(retained,'OPERATOR_EXPORT_RECEIPT.json'),verified.exportReceiptBytes);
    await publish(join(retained,'OPERATOR_TRANSFER.json'),verified.manifestBytes);await publish(join(retained,'TRANSFER.json'),verified.nativeBytes);await publish(join(retained,'receipt.json'),encode(receipt));
    await verifyReceived(assembled,receipt);const sourceAfter=await identity(source,MAX_ARCHIVE);need(sourceAfter.bytes===sourceId.bytes&&sourceAfter.sha256===sourceId.sha256,'The archive changed before receiving completed.');
    await sync(assembled);await rename(assembled,target);await sync(parent);
    return{...receipt,directory:target,replayed:false};
  }finally{await release();}
}
