// MIT. Complete original setup/resume/provider receiving on its equipped host.
import { mkdir, mkdtemp, open, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, resolve, join, dirname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { initializeHostHandoffMerchant } from '../host-handoff-merchant-setup.mjs';
import { hostSetupControlDirectory } from '../host-handoff-setup-state.mjs';
import { readHostHandoffMerchantConfiguration, assertHostHandoffOperatorCustody } from '../host-handoff-merchant.mjs';
import { openMerchantOperator } from '../../../../../stellar-forge/mcp-merchant-operator/operator.mjs';

const sha=raw=>createHash('sha256').update(raw).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
const need=(ok,message)=>{if(!ok)throw new Error(message);};
async function retain(path,value) {
  const file=await open(path,'wx',0o600);
  try{await file.writeFile(typeof value==='string'||Buffer.isBuffer(value)?value:json(value));await file.sync();}
  finally{await file.close();}
}
async function flush(path) {
  const fd=await open(path,'r');try{await fd.sync();}finally{await fd.close();}
}
async function identity(path) {
  const raw=await readFile(path);return{path,bytes:raw.length,sha256:sha(raw)};
}
/** Uses one original directory/connection; creates no host capture/adoption job. */
export async function receiveHostSetup({options,outputDirectory}) {
  need(options&&typeof options==='object'&&!Array.isArray(options),'Read complete original setup options.');
  need(isAbsolute(outputDirectory)&&resolve(outputDirectory)===outputDirectory,'Select an absolute private observation directory.');
  const root=options.directory,controls=hostSetupControlDirectory(root);
  const protectedPaths=[root,controls,options.connection];
  need(protectedPaths.every(p=>p!==outputDirectory&&!p.startsWith(outputDirectory+sep)&&!outputDirectory.startsWith(p+sep)),
    'Keep receiving observations separate from the original setup and source controls.');
  const selected=await readHostHandoffMerchantConfiguration(options.connection,{
    operatorDirectory:root,releaseStore:join(root,'releases'),exportsDirectory:join(root,'customer-exports'),setupDirectory:controls
  });
  for(const host of Object.values(selected.hosts)) {
    for(const key of ['bundleDirectory','captureOperationDirectory','restoreDirectory','adoptionOperationDirectory'])
      if(host[key])assertHostHandoffOperatorCustody([host[key]],[outputDirectory]);
    for(const key of ['selectionFile','planFile','targetFile'])if(host[key]) {
      need(host[key]!==outputDirectory&&!host[key].startsWith(outputDirectory+sep),
        'Keep observations separate from original native inputs.');
    }
  }
  need(await realpath(dirname(outputDirectory))===dirname(outputDirectory),'Use the canonical private observation parent.');
  try{await mkdir(outputDirectory,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
  const outputInfo=await stat(outputDirectory);
  need(outputInfo.isDirectory()&&outputInfo.uid===process.getuid()&&!(outputInfo.mode&0o077)&&await realpath(outputDirectory)===outputDirectory,
    'Use the existing canonical private observation directory.');
  const attempt=await mkdtemp(join(outputDirectory,'invocation-'));
  await flush(outputDirectory);
  const optionsRaw=Buffer.from(json(options)),connectionRaw=await readFile(options.connection);
  need(sha(connectionRaw)===selected.connectionSha256,'The original connection changed before retaining receiving input.');
  await retain(join(attempt,'setup-options.json'),optionsRaw);
  await retain(join(attempt,'original-connection.json'),connectionRaw);
  await retain(join(attempt,'invocation.json'),{schema:'stellar-forge.host-setup-receiving.v1',
    options:{bytes:optionsRaw.length,sha256:sha(optionsRaw)},connection:{path:options.connection,bytes:connectionRaw.length,sha256:sha(connectionRaw)},
    directory:root,controlDirectory:controls,startedAt:new Date().toISOString()});
  await flush(attempt);
  let operator;
  try {
    const before=await initializeHostHandoffMerchant({...options,operation:'inspect'});
    await retain(join(attempt,'before.json'),before);
    need(['NOT_STARTED','BEFORE_INTENT','INCOMPLETE','COMPLETE'].includes(before.status),
      'Preserve the existing unbound operator directory; this course cannot adopt it.');
    const result=await initializeHostHandoffMerchant({...options,
      operation:['NOT_STARTED','BEFORE_INTENT'].includes(before.status)?'initialize':'resume'});
    await retain(join(attempt,'initialized.json'),result);
    const accepted=await initializeHostHandoffMerchant({...options,operation:'inspect'});
    need(accepted.intent?.value?.connectionSha256===sha(connectionRaw),'The accepted setup retained a different original connection.');
    const configuration=join(root,'merchant-mcp.json'),state=join(root,'releases','state.json');
    const baseline={configuration:await identity(configuration),releaseState:await identity(state)};
    operator=await openMerchantOperator(configuration);
    const inventory=await operator.call('merchant_host_handoff_hosts',{});
    await retain(join(attempt,'provider-inventory.json'),inventory);
    await operator.close();operator=null;
    const resumed=await initializeHostHandoffMerchant({...options,operation:'resume'});
    need(resumed.reused===true,'The completed setup must return its original result.');
    const comparable=value=>{const {reused,setup,...original}=value;return original;};
    need(json(comparable(result))===json(comparable(resumed)),'The complete original setup result changed.');
    need(json(baseline)===json({configuration:await identity(configuration),releaseState:await identity(state)}),
      'Setup resume changed original configuration or release bytes.');
    operator=await openMerchantOperator(configuration);
    const reopened=await operator.call('merchant_host_handoff_hosts',{});
    need(json(inventory)===json(reopened),'The original provider inventory changed on cold reopen.');
    await operator.close();operator=null;
    const final=await initializeHostHandoffMerchant({...options,operation:'inspect'});
    await retain(join(attempt,'completed-inspection.json'),final);
    await retain(join(attempt,'resumed.json'),resumed);
    await retain(join(attempt,'reopened-provider.json'),reopened);
    const completed={schema:'stellar-forge.host-setup-receiving.v1',status:'COMPLETE',
      invocation:attempt,originalSetup:result,baseline,completedAt:new Date().toISOString(),
      scope:'Actual original setup, Linux publication, provider open/close/reopen and retained bytes; no host capture/adoption or browser acceptance.'};
    await retain(join(attempt,'result.json'),completed);await flush(attempt);return completed;
  } catch(error) {
    await retain(join(attempt,'failure.json'),{code:error.code??null,message:error.message,at:new Date().toISOString()}).catch(()=>{});
    await flush(attempt).catch(()=>{});throw error;
  } finally {await operator?.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const flags={};
  for(let i=2;i<process.argv.length;i+=2) {
    need(['--options','--output'].includes(process.argv[i])&&process.argv[i+1]&&!flags[process.argv[i]],'Use --options FILE --output DIRECTORY.');
    flags[process.argv[i]]=process.argv[i+1];
  }
  need(flags['--options']&&flags['--output'],'Use --options FILE --output DIRECTORY.');
  const options=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readFile(flags['--options'])));
  const result=await receiveHostSetup({options,outputDirectory:resolve(flags['--output'])});
  process.stdout.write(json(result));
}
