// Focused offline contract for all-or-clean Directory receiver outputs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDirectoryGrantReceiving } from './grant-directory.mjs';

const parent='## Referral implementation: source changes, returned outcomes and complete receiving';
const heading='### Service-directory commissioning and referral destinations';
const chapter=heading+'\n\nCurrent Directory product evidence.\n';
const current=chapter+'\n';
const manuscript='# Grant application\n\n'+parent+'\n\n'+current+'## Next chapter\n';
const expected=createHash('sha256').update(current).digest('hex');
const root=await mkdtemp(join(tmpdir(),'grant-directory-output-'));
const manuscriptPath=join(root,'application.md'),chapterPath=join(root,'directory.md');
await writeFile(manuscriptPath,manuscript);
await writeFile(chapterPath,chapter);
const args=(out,receipt)=>['--manuscript',manuscriptPath,'--chapter',chapterPath,'--expected-directory-sha256',expected,'--out',out,'--receipt',receipt];
const missing=async path=>assert.rejects(access(path));

try{
  const blockedOut=join(root,'blocked-application.md'),existingReceipt=join(root,'existing-receipt.json');
  await writeFile(existingReceipt,'existing receipt\n');
  await assert.rejects(runDirectoryGrantReceiving(args(blockedOut,existingReceipt)),error=>error?.code==='EEXIST');
  await missing(blockedOut);
  assert.equal(await readFile(existingReceipt,'utf8'),'existing receipt\n');

  const existingOut=join(root,'existing-application.md'),blockedReceipt=join(root,'blocked-receipt.json');
  await writeFile(existingOut,'existing manuscript\n');
  await assert.rejects(runDirectoryGrantReceiving(args(existingOut,blockedReceipt)),error=>error?.code==='EEXIST');
  assert.equal(await readFile(existingOut,'utf8'),'existing manuscript\n');
  await missing(blockedReceipt);

  const out=join(root,'received-application.md'),receipt=join(root,'receipt.json');
  const result=await runDirectoryGrantReceiving(args(out,receipt));
  assert.equal(await readFile(out,'utf8'),manuscript);
  assert.deepEqual(JSON.parse(await readFile(receipt,'utf8')),result);
  process.stdout.write(JSON.stringify({preexistingReceiptLeavesNoOutput:true,preexistingOutputLeavesNoReceipt:true,distinctOutputs:true})+'\n');
}finally{
  await rm(root,{recursive:true,force:true});
}
