#!/usr/bin/env node
/** MIT. Build a complete, dependency-free customer installation from maintained source. */
import {mkdtemp, mkdir, cp, readFile, writeFile, rm, stat} from 'node:fs/promises';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const here=dirname(fileURLToPath(import.meta.url));
const destination=resolve(process.argv[2]||process.cwd());
const staging=await mkdtemp(join(tmpdir(),'preparation-pipelines-package-'));
try {
  await mkdir(destination,{recursive:true});
  await mkdir(join(staging,'pipelines'));
  // These are the original engine and its complete native transfer dependencies.
  // No vendor SDK, live service, user workspace, credentials or cache is packaged.
  for(const filename of ['preparation.py','transfer.py'])
    await cp(join(here,'..',filename),join(staging,filename));
  for(const filename of ['engine.py','delivery.py','reuse.py','interop.py','pipeline.py','pipeline_transfer.py','receiving.py','server.py','cli.py','cli.mjs',
    'client.mjs','client.d.mts','index.html','app.js','style.css','README.md','LICENSE'])
    await cp(join(here,filename),join(staging,'pipelines',filename));
  await cp(join(here,'README.md'),join(staging,'README.md'));
  await cp(join(here,'LICENSE'),join(staging,'LICENSE'));
  const metadata={
    name:'@tokenjunkielabs/data-preparation-pipelines',version:'0.1.0',type:'module',
    description:'Saved multistage dataset preparation, complete native recovery and editable customer handover.',
    license:'MIT',engines:{node:'>=22'},
    bin:{'starforge-data-pipelines':'pipelines/cli.mjs'},
    main:'./pipelines/client.mjs',types:'./pipelines/client.d.mts',
    exports:{'.':{types:'./pipelines/client.d.mts',import:'./pipelines/client.mjs'},
      './package.json':'./package.json'},
    files:['pipelines','preparation.py','transfer.py','README.md','LICENSE']
  };
  await writeFile(join(staging,'package.json'),JSON.stringify(metadata,null,2)+'\n');
  const result=spawnSync('npm',['pack','--offline','--ignore-scripts','--json','--pack-destination',destination],
    {cwd:staging,encoding:'utf8',env:{...process.env,npm_config_audit:'false',npm_config_fund:'false'}});
  if(result.error)throw result.error;
  if(result.status!==0)throw Error(result.stderr||'npm pack failed');
  const records=JSON.parse(result.stdout);if(records.length!==1)throw Error('Expected exactly one package');
  const path=join(destination,records[0].filename);const bytes=await readFile(path);
  console.log(JSON.stringify({path,bytes:(await stat(path)).size,
    sha256:createHash('sha256').update(bytes).digest('hex'),files:records[0].files.map(v=>v.path)},null,2));
} finally { await rm(staging,{recursive:true,force:true}); }
