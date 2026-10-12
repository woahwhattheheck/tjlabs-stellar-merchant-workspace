import { tmpdir } from 'node:os';
import { strict as assert } from 'node:assert';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { OperationState, stableToken, atomicJson, readJson } from './operation-state.mjs';

const root = await fs.mkdtemp(join(tmpdir(),'openlineage-recovery-'));
const identity = { operationId: 'actual-file-journal-exercise', source: 'unchanged-original-programme' };
const outcomes = [];
const tokens = await Promise.all(Array.from({ length: 32 }, () => stableToken(join(root, 'token'))));
assert.equal(new Set(tokens).size, 1); assert.equal(tokens[0].length, 64);
assert.equal((await fs.stat(join(root, 'token'))).mode & 0o777, 0o600);
outcomes.push('32 concurrent creators retain one complete private token');

const state = await OperationState.open(join(root, 'journal'), identity);
const selected = await state.value('request', async () => ({ id: 'original-mutation', expectedRevision: 7 }));
await assert.rejects(state.phase('mutation', async () => {
  await atomicJson(join(root, 'ack.json'), { id: selected.id, revision: 8 });
  throw Object.assign(new Error('Lost original response'), { code: 'LOST_RESPONSE' });
}));
const reopened = await OperationState.open(join(root, 'journal'), identity);
assert.deepEqual(await reopened.value('request', async () => { throw new Error('must not reconstruct'); }), selected);
const result = await reopened.phase('mutation', async () => readJson(join(root, 'ack.json')));
assert.deepEqual(result, { id: selected.id, revision: 8 });
await reopened.phase('mutation', () => { throw new Error('completed mutation must not repeat'); });
assert.equal(reopened.state.phases.mutation.attempts.length, 2);
outcomes.push('Lost-response recovery retains original request and reuses its completed result');

await assert.rejects(OperationState.open(join(root, 'journal'), { ...identity, source: 'different-source' }), /different source/);
outcomes.push('Different original source is not silently substituted on reopen');

await assert.rejects(reopened.command('native-command', process.execPath, ['-e', 'process.stdout.write("first");process.stderr.write("error one");process.exitCode=9']));
const cmd = await reopened.command('native-command', process.execPath, ['-e', 'console.log(JSON.stringify({complete:true}))']);
assert.deepEqual(cmd.value, { complete: true });
assert.equal(await fs.readFile(reopened.state.commands[0].output, 'utf8'), 'first');
assert.equal(await fs.readFile(reopened.state.commands[0].errors, 'utf8'), 'error one');
assert.notEqual(reopened.state.commands[0].output, cmd.output);
outcomes.push('Failed and successful native child processes keep both complete log attempts');

// Kill a real process after its durable selection, then reopen exactly that same request.
const childPath = join(root, 'child.mjs');
const modulePath = new URL('./operation-state.mjs', import.meta.url).href;
await fs.writeFile(childPath, `import {OperationState} from ${JSON.stringify(modulePath)};
const s=await OperationState.open(${JSON.stringify(join(root, 'killed'))},${JSON.stringify(identity)});
await s.value('exact-input',async()=>({revision:7,id:'unchanged'}));
await s.phase('native',async()=>{console.log('PERSISTED');await new Promise(()=>{});});`);
const child = spawn(process.execPath, [childPath], { stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((accept, reject) => {
  child.once('error', reject);
  child.stdout.once('data', chunk => { assert.match(chunk.toString(), /PERSISTED/); accept(); });
});
child.kill('SIGKILL'); await new Promise(accept => child.once('close', accept));
const afterKill = await OperationState.open(join(root, 'killed'), identity);
assert.equal(afterKill.state.phases.native.state, 'running');
assert.deepEqual(afterKill.state.values['exact-input'], { revision: 7, id: 'unchanged' });
await afterKill.phase('native', async () => ({ continued: true }));
assert.equal((await readJson(afterKill.path)).phases.native.state, 'complete');
outcomes.push('SIGKILL preserves the exact input and same phase continuation in a new process');

await fs.chmod(join(root, 'token'), 0o644);
await assert.rejects(stableToken(join(root, 'token')), /Private regular token/);
await fs.chmod(join(root, 'token'), 0o600);
await fs.symlink(join(root, 'token'), join(root, 'token-link'));
await assert.rejects(stableToken(join(root, 'token-link')), /Private regular token/);
outcomes.push('Existing public-mode token and token symlink are rejected without rewriting either');

await atomicJson(join(root, 'results.json'), { scope: 'Native filesystem/process recovery helper only', root, outcomes });
console.log(JSON.stringify({ root, outcomes }, null, 2));
