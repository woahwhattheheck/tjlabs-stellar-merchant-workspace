// MIT. File-only receiving for the original acquired event export.
import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {inspectEventExport,projectEventExport,compareEventExports} from './analysis-source.mjs';
async function original(path,max) {
  const file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try{const before=await file.stat();if(!before.isFile()||before.size>max)throw new Error('Select a complete regular source file within its allowance.');const raw=await file.readFile();const after=await file.stat();if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs)throw new Error('The original file changed during receiving.');return new TextDecoder('utf-8',{fatal:true}).decode(raw);}finally{await file.close();}
}
export async function main(argv=process.argv.slice(2)) {
  const options={};for(let i=0;i<argv.length;i+=2){if(!/^--[a-z-]+$/.test(argv[i])||argv[i+1]===undefined||options[argv[i]]!==undefined)throw new Error('Use named complete source paths.');options[argv[i]]=argv[i+1];}
  const allowed=new Set(['--ndjson','--manifest','--mapping','--previous-ndjson','--previous-manifest']);
  if(Object.keys(options).some(k=>!allowed.has(k))||!options['--ndjson']||!options['--manifest'])throw new Error('Select --ndjson and --manifest.');
  const source=inspectEventExport(await original(options['--ndjson'],32*1024*1024),await original(options['--manifest'],4*1024*1024));
  const mapping=options['--mapping']?JSON.parse(await original(options['--mapping'],1024*1024)):{};
  const projected=projectEventExport(source,mapping);
  const hasPrevious=options['--previous-ndjson']||options['--previous-manifest'];
  if(hasPrevious&&!(options['--previous-ndjson']&&options['--previous-manifest']))throw new Error('Select both original previous files.');
  const comparison=hasPrevious?compareEventExports(inspectEventExport(await original(options['--previous-ndjson'],32*1024*1024),await original(options['--previous-manifest'],4*1024*1024)),source):null;
  return{...source,events:undefined,...projected,rows:undefined,comparison};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().then(value=>process.stdout.write(JSON.stringify(value)+'\n')).catch(error=>{process.stderr.write(JSON.stringify({error:error.message})+'\n');process.exitCode=1;});
