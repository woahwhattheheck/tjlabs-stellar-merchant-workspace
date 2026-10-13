// MIT. Read complete selected evidence through the original SF74 source-package receiver.
import {constants} from 'node:fs';
import {open,realpath} from 'node:fs/promises';
import {resolve,relative,basename,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {createOperatingFile,OPERATING_FILE_MAX_BYTES} from './operating-plan.mjs';
import {recordSupportOperatingWork} from './support-operating-return.mjs';

const fail=(code,message)=>{throw Object.assign(new TypeError(message),{code});};
function required(value,label) {
  if(typeof value!=='string'||!value||value.includes('\0'))fail('SUPPORT_RETURN_INPUT',label+' is required.');
}
async function artifactBytes(root,artifact,signal) {
  signal?.throwIfAborted();
  const target=resolve(root,artifact.path),local=relative(root,target);
  if(!local||local.startsWith('..')||isAbsolute(local)||await realpath(target)!==target)
    fail('SUPPORT_RETURN_PATH','Choose the original regular artifact inside the verified source directory.');
  if(artifact.bytes>OPERATING_FILE_MAX_BYTES)
    fail('SUPPORT_RETURN_FILE_SIZE','This artifact exceeds the original 24 MiB carried-file limit; retain the complete native companion separately.');
  const file=await open(target,constants.O_RDONLY|constants.O_NOFOLLOW);
  try {
    const before=await file.stat({bigint:true});
    if(!before.isFile()||before.size!==BigInt(artifact.bytes))fail('SUPPORT_RETURN_FILE_SIZE','The selected original artifact size changed.');
    const bytes=Buffer.alloc(artifact.bytes);
    let offset=0;
    while(offset<bytes.length) {
      signal?.throwIfAborted();
      const read=await file.read(bytes,offset,Math.min(65536,bytes.length-offset),offset);
      if(!read.bytesRead)fail('SUPPORT_RETURN_FILE_SIZE','The selected artifact ended before its complete byte count.');
      offset+=read.bytesRead;
    }
    const after=await file.stat({bigint:true});
    if(after.dev!==before.dev||after.ino!==before.ino||after.size!==before.size||after.mtimeNs!==before.mtimeNs||
      after.ctimeNs!==before.ctimeNs||createHash('sha256').update(bytes).digest('hex')!==artifact.sha256)
      fail('SUPPORT_RETURN_FILE_HASH','The selected artifact changed while its complete bytes were received.');
    signal?.throwIfAborted();return bytes;
  } finally {await file.close();}
}
/** Read-only native intake; it neither receives a new case nor changes the retained source package. */
export async function recordSupportOperatingWorkFromSource(plan,{directory,expectedSource,stepId,status,result,owner,savedAt,signal}={}) {
  required(directory,'Original source directory');required(savedAt,'Original result savedAt');
  if(!isAbsolute(directory)||resolve(directory)!==directory)fail('SUPPORT_RETURN_PATH','Use the exact normalized absolute source directory.');
  signal?.throwIfAborted();
  const native=await import('../../sf74-merchant-support-console/oauth-operating-source.mjs');
  signal?.throwIfAborted();
  const selected=await native.inspectOAuthOperatingSourcePackage({directory,expectedSource,signal});
  const root=await realpath(directory);
  if(root!==directory)fail('SUPPORT_RETURN_PATH','The selected original source directory must not resolve through another path.');
  if(!Array.isArray(result?.evidenceIds)||new Set(result.evidenceIds).size!==result.evidenceIds.length)
    fail('SUPPORT_RETURN_EVIDENCE','Retain distinct selected evidence IDs.');
  const files=[];
  for(const id of result.evidenceIds) {
    const evidence=selected.source.evidence.find(row=>row.id===id);
    if(!evidence)fail('SUPPORT_RETURN_EVIDENCE','The selected original source has no evidence ID '+id+'.');
    const bytes=await artifactBytes(root,evidence.artifact,signal);
    const identity=createHash('sha256').update(JSON.stringify([id,evidence.artifact])).digest('hex');
    files.push({evidenceId:id,file:createOperatingFile({id:'support-'+identity,name:basename(evidence.artifact.path),
      mediaType:'application/octet-stream',bytes,note:'Original '+evidence.role+' · '+evidence.artifact.path})});
  }
  signal?.throwIfAborted();
  const updated=await recordSupportOperatingWork(plan,{source:selected.source,stepId,status,result,owner,savedAt,files});
  signal?.throwIfAborted();
  return {schema:'stellar-forge.oauth-support-operating-work-source.v1',source:selected.source,
    sourceFile:selected.sourceFile,manifestFile:selected.manifestFile,plan:updated};
}
