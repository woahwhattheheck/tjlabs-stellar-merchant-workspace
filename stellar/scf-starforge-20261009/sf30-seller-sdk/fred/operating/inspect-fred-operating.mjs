// MIT. Fixed installed read-only FRED operating archive inspector.
import { constants } from 'node:fs';
import { lstat, open, realpath, unlink } from 'node:fs/promises';
import { resolve, dirname, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { inspectFredOperatingArchiveReadOnly, FRED_OPERATING_ARCHIVE_NAME } from './archive.mjs';
import { canonicalJSONChunks } from '../canonical-stream.mjs';

export const MAX_FRED_OPERATING_INSPECTION_JSON_BYTES = 32 * 1024 * 1024;
function need(ok,message) { if(!ok) throw Object.assign(new Error(message),{code:'FRED_OPERATING_INSPECTION_ARGUMENT'}); }
function options(argv) {
  const value = {};
  for(let i=0;i<argv.length;i+=2) {
    const name=argv[i]; need(['--archive','--sha256','--out'].includes(name) && typeof argv[i+1]==='string' && !(name in value),
      'Use --archive PATH --sha256 FULL_SHA --out RESULT_JSON exactly once.');
    value[name]=argv[i+1];
  }
  need(Object.keys(value).length===3 && /^[a-f0-9]{64}$/.test(value['--sha256']),
    'Retain the full original archive SHA-256.');
  for(const name of ['--archive','--out']) need(isAbsolute(value[name]) && resolve(value[name])===value[name],
    'Use absolute original input and private output file paths.');
  need(value['--archive']!==value['--out'],'The inspection result must be separate from the original archive.');
  return value;
}
export async function runFredOperatingInspectionCli(argv=process.argv.slice(2)) {
  const value=options(argv), [major,minor]=process.versions.node.split('.').map(Number);
  need(major>22 || (major===22 && minor>=16),'Use the installed original Node22.16 or later.');
  const info=await lstat(value['--archive']);
  need(info.isFile() && !info.isSymbolicLink(),'Select a complete original regular archive.');
  const original=await inspectFredOperatingArchiveReadOnly({archivePath:value['--archive'],
    expectedArchive:{path:FRED_OPERATING_ARCHIVE_NAME,bytes:info.size,sha256:value['--sha256']}});
  const output=value['--out'];
  need(await realpath(dirname(output))===dirname(output),'Choose an existing ordinary private receiving directory.');
  const file=await open(output,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
  const digest=createHash('sha256'); let bytes=0,complete=false,created=null;
  try {
    created=await file.stat();
    async function append(piece) {
      const body=Buffer.from(piece); bytes+=body.length;
      need(bytes<=MAX_FRED_OPERATING_INSPECTION_JSON_BYTES,'The complete inspected source exceeds the LDA32MiB source limit.');
      digest.update(body); let offset=0;
      while(offset<body.length) { const wrote=await file.write(body,offset,body.length-offset); need(wrote.bytesWritten>0,'The complete inspection output could not be written.'); offset+=wrote.bytesWritten; }
    }
    for(const piece of canonicalJSONChunks(original)) await append(piece);
    await append('\n'); await file.sync(); complete=true;
  } finally {
    await file.close();
    if(!complete) {
      const named=await lstat(output).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
      if(named?.isFile() && !named.isSymbolicLink() && created && named.dev===created.dev && named.ino===created.ino) await unlink(output);
    }
  }
  return {schema:'stellar-forge.fred-operating-inspection-receipt.v1',archive:original.archive,
    result:{bytes,sha256:digest.digest('hex')}};
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  try {
    const value=await runFredOperatingInspectionCli();
    await new Promise((ok,reject)=>process.stdout.write(JSON.stringify(value)+'\n',error=>error?reject(error):ok()));
  } catch(error) {
    process.stderr.write((error?.stack||String(error))+'\n'); process.exitCode=1;
  }
}
