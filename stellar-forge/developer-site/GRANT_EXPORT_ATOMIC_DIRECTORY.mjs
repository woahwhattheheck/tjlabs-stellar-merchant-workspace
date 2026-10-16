import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {publishNewExportDirectory} from './grant-export-directory.mjs';

const root=await mkdtemp(join(tmpdir(),'scf-grant-export-atomic-'));
try{
  const complete=join(root,'complete');
  await publishNewExportDirectory(complete,new Map([
    ['draft.json','{\"complete\":true}\n'],
    ['fields/01-summary.txt','Complete answer\n'],
  ]),{schema:'probe.v1',files:2});
  assert.deepEqual((await readdir(complete)).sort(),['draft.json','fields','manifest.json']);
  assert.equal(await readFile(join(complete,'fields/01-summary.txt'),'utf8'),'Complete answer\n');
  assert.equal(JSON.parse(await readFile(join(complete,'manifest.json'),'utf8')).files,2);

  const interrupted=join(root,'interrupted');
  await assert.rejects(()=>publishNewExportDirectory(interrupted,new Map([
    ['draft.json','first complete file\n'],
    ['prepared.txt',{unsupported:true}],
  ]),{schema:'probe.v1'}),TypeError);
  assert.equal((await readdir(root)).some(name=>name==='interrupted'||name.startsWith('.interrupted.staging-')),false);

  const existing=join(root,'existing');
  await writeFile(existing,'original destination');
  await assert.rejects(()=>publishNewExportDirectory(existing,new Map([['draft.json','replacement']]),{}),/already exists/);
  assert.equal(await readFile(existing,'utf8'),'original destination');

  process.stdout.write(JSON.stringify({completePublished:true,interruptedClean:true,existingPreserved:true})+'\n');
}finally{
  await rm(root,{recursive:true,force:true});
}
