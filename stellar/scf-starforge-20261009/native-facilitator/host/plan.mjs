// MIT. Immutable selected host inputs; no signer value is included in public handover.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { validateConfig, reviewConfig } from '../config.mjs';
import { SCHEMA, BASE, now, hash, json, need, absolute, regular, readJSON, maybeJSON, identity,
  realDirectory, ensureDirectory, atomicFile, resolveAccount, digestFile, command, systemdWord,rawPath,pathWord,
  signerFiles,hostLease } from './shared.mjs';

const PROBE=fileURLToPath(new URL('./probe.mjs',import.meta.url));
export const DEFAULT_BINARIES={systemctl:'/usr/bin/systemctl',systemdAnalyze:'/usr/bin/systemd-analyze',
  getent:'/usr/bin/getent',runuser:'/usr/sbin/runuser',flock:'/usr/bin/flock'};
const environmentNames=config=>[...new Set([...config.signers.map(s=>s.secretEnv),
  ...(config.feeBumpSigner?[config.feeBumpSigner.secretEnv]:[])])].sort();
function validateEnvironment(bytes,names){
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),found=new Set();
  need(bytes.length<=16384&&!text.includes('\0'),'HOST_SIGNER_ENVIRONMENT_INVALID');
  for(const line of text.split(/\r?\n/)){
    if(!line.trim()||line.trimStart().startsWith('#'))continue;
    const m=/^([A-Z_][A-Z0-9_]*)=(S[A-Z2-7]{55})$/.exec(line);
    need(m&&names.includes(m[1])&&!found.has(m[1]),'HOST_SIGNER_ENVIRONMENT_INVALID');
    found.add(m[1]);
  }
  need(names.every(n=>found.has(n)),'HOST_SIGNER_ENVIRONMENT_INCOMPLETE');
}
export function serviceUnit(plan){
  const exec=(mode,port=false)=>[systemdWord(plan.node.path),
    systemdWord(plan.cli,{argument:true}),systemdWord(mode,{argument:true}),
    systemdWord('--config',{argument:true}),systemdWord(plan.configFile,{argument:true}),
    ...(port?[systemdWord('--port',{argument:true}),String(plan.port)]:[]),
    systemdWord('--state',{argument:true}),systemdWord(plan.ownershipDirectory,{argument:true}),
    systemdWord('--require-ready',{argument:true})].join(' ');
  return '[Unit]\nDescription=Starforge original native facilitator '+plan.unit+'\n'
    +'Wants=network-online.target\nAfter=network-online.target\nConditionPathExists=!'+rawPath(plan.marker)+'\n\n'
    +'[Service]\nType=exec\nUser='+plan.account.user+'\nGroup='+plan.account.group+'\n'
    +'WorkingDirectory='+rawPath(plan.runtime.directory)+'\nEnvironment="PATH=/usr/bin:/bin"\n'
    +'EnvironmentFile='+rawPath(plan.environmentFile)+'\nUMask=0077\n'
    +'ExecStartPre='+exec('--check')+'\nExecStart='+exec('--serve',true)+'\n'
    +'Restart=no\nSendSIGHUP=no\nKillSignal=SIGTERM\nRestartKillSignal=SIGTERM\nKillMode=mixed\nTimeoutStartSec=180\nTimeoutStopSec=infinity\nSendSIGKILL=no\n'
    +'NoNewPrivileges=yes\nPrivateTmp=yes\nProtectSystem=strict\nProtectHome=read-only\n'
    +'ReadWritePaths='+pathWord(plan.ownershipDirectory)+'\nRestrictSUIDSGID=yes\n'
    +'[Install]\nWantedBy=multi-user.target\n';
}
export async function preflight(plan){
  const account=await resolveAccount(plan.account.user,plan.account.group,plan.binaries);
  need(account.uid===plan.account.uid&&account.gid===plan.account.gid,'HOST_ACCOUNT_IDENTITY_CHANGED');
  const r=await command(plan.binaries.runuser,['-u',account.user,'-g',account.group,'--',plan.node.path,PROBE,
    '--runtime',plan.runtime.directory,'--config',plan.configFile,'--state',plan.ownershipDirectory],{timeout:120000});
  let p;try{p=JSON.parse(r.stdout);}catch{need(false,'HOST_PROBE_RESULT_INVALID');}
  need(p.ready&&p.uid===account.uid&&p.gid===account.gid&&p.configSha256===plan.configSha256&&
    json(p.runtime)===json(plan.runtime)&&p.cliSha256===plan.cliSha256,'HOST_SELECTED_RUNTIME_CHANGED');
  need((await digestFile(plan.node.path)).sha256===plan.node.sha256,'HOST_NODE_CHANGED');
  return p;
}
export async function stage(options){
  need(process.platform==='linux'&&process.getuid?.()===0,'HOST_ADMINISTRATOR_REQUIRED');
  need(options&&typeof options==='object'&&!Array.isArray(options),'HOST_SELECTION_REQUIRED');
  const known=['hostDirectory','runtimeDirectory','config','environmentFile','unit','user','group','port',
    'ownershipDirectory','createOwnershipDirectory','enableAtBoot','binaries','systemdDirectory','stageId'];
  need(Object.keys(options).every(k=>known.includes(k)),'HOST_SELECTION_FIELD_UNKNOWN');
  const binaries={...DEFAULT_BINARIES,...options.binaries};
  need(Object.keys(binaries).length===Object.keys(DEFAULT_BINARIES).length,'HOST_BINARY_FIELD_UNKNOWN');
  for(const p of Object.values(binaries))absolute(p);
  const account=await resolveAccount(options.user,options.group,binaries);
  const hostDirectory=absolute(options.hostDirectory),runtimeDirectory=absolute(options.runtimeDirectory);
  const unit=options.unit;
  need(typeof unit==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}\.service$/.test(unit),'HOST_UNIT_INVALID');
  need(Number.isInteger(options.port)&&options.port>0&&options.port<=65535,'HOST_PORT_INVALID');
  need(typeof options.enableAtBoot==='boolean','HOST_BOOT_SELECTION_REQUIRED');
  const input=await regular(absolute(options.config),65536),secret=await regular(absolute(options.environmentFile),16384);
  need((secret.stat.uid===0||secret.stat.uid===account.uid)&&!(secret.stat.mode&0o077),'HOST_PRIVATE_SIGNER_ENVIRONMENT_REQUIRED');
  const config=validateConfig(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(input.bytes)));
  const ownershipDirectory=absolute(options.ownershipDirectory??config.operations.ownershipDirectory);
  const selected=validateConfig({...config,operations:{...config.operations,ownershipDirectory,requireReady:true}});
  const names=environmentNames(selected);validateEnvironment(secret.bytes,names);
  const systemdDirectory=absolute(options.systemdDirectory??'/etc/systemd/system');
  await realDirectory(systemdDirectory,{uid:0});
  // Existing runtime/source and private signing state are never recursively re-owned.
  if(options.createOwnershipDirectory===true)await ensureDirectory(ownershipDirectory,{uid:account.uid,gid:account.gid,mode:0o700});
  else await realDirectory(ownershipDirectory,{uid:account.uid,mode:0o700});
  await ensureDirectory(hostDirectory,{uid:0,gid:account.gid,mode:0o750});
  const lease=await hostLease(hostDirectory,binaries.flock);
  try{
    await ensureDirectory(join(hostDirectory,'bundles'),{uid:0,gid:account.gid,mode:0o750});
    await ensureDirectory(join(hostDirectory,'operations'),{uid:0,gid:0,mode:0o700});
    const identityFile=join(hostDirectory,'host.json'),existing=await maybeJSON(identityFile);
    const host={schema:SCHEMA,unit,account,ownershipDirectory,systemdDirectory,port:options.port,network:selected.network};
    if(existing)need(json(existing.value)===json(host),'HOST_IDENTITY_SELECTION_CHANGED');
    else await atomicFile(identityFile,json(host),{mode:0o640,gid:account.gid});
    const stageId=options.stageId??randomUUID();
    need(typeof stageId==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(stageId),'HOST_STAGE_ID_INVALID');
    const directory=join(hostDirectory,'bundles',stageId);
    const nodePath=await realpath(process.execPath),node=await digestFile(nodePath);
    const stageRequest={host,runtimeDirectory,configSha256:input.sha256,environmentSha256:secret.sha256,
      enableAtBoot:options.enableAtBoot,binaries,node:{path:nodePath,sha256:node.sha256},stageId};
    const stageRequestSha256=hash(json(stageRequest));
    await ensureDirectory(directory,{uid:0,gid:account.gid,mode:0o750});
    const completed=await maybeJSON(join(directory,'bundle.json'));
    if(completed){
      const prior=await readBundle(directory);need(prior.plan.stageRequestSha256===stageRequestSha256,'HOST_STAGE_ID_REUSED');
      await preflight(prior.plan);return publicBundle(prior);
    }
    const stageFile=join(directory,'stage-input.json'),saved=await maybeJSON(stageFile);
    need(!saved||saved.value.requestSha256===stageRequestSha256,'HOST_STAGE_ID_REUSED');
    const stageInput=saved?.value??{requestSha256:stageRequestSha256,createdAt:now(),request:stageRequest};
    if(!saved)await atomicFile(stageFile,json(stageInput),{mode:0o600});
    const configFile=join(directory,'facilitator.json'),environmentFile=join(directory,'signer.env');
    await atomicFile(configFile,input.bytes,{allowed:[null,input.sha256],mode:0o640,gid:account.gid});
    await atomicFile(environmentFile,secret.bytes,{allowed:[null,secret.sha256],mode:0o600,gid:0});
    const r=await command(binaries.runuser,['-u',account.user,'-g',account.group,'--',nodePath,PROBE,
      '--runtime',runtimeDirectory,'--config',configFile,'--state',ownershipDirectory],{timeout:120000});
    let observed;try{observed=JSON.parse(r.stdout);}catch{need(false,'HOST_PROBE_RESULT_INVALID');}
    need(observed.ready&&observed.uid===account.uid&&observed.gid===account.gid&&
      observed.configSha256===input.sha256&&json(observed.review)===json(reviewConfig(selected)),
      'HOST_ORIGINAL_CONFIG_REVIEW_MISMATCH');
    const plan={schema:SCHEMA,stageRequestSha256,stageId,createdAt:stageInput.createdAt,directory,hostDirectory,unit,account,ownershipDirectory,
      network:selected.network,accounts:[...new Set([...selected.signers.map(s=>s.address),
        ...(selected.feeBumpSigner?[selected.feeBumpSigner.address]:[])])].sort(),
      port:options.port,url:'http://127.0.0.1:'+options.port,enableAtBoot:options.enableAtBoot,
      ownershipSelection:{configured:config.operations.ownershipDirectory,selected:ownershipDirectory,via:'ORIGINAL_CLI_STATE_ARGUMENT'},
      systemdDirectory,unitFile:join(systemdDirectory,unit),marker:join(hostDirectory,'maintenance.json'),
      binaries,node:{path:nodePath,version:observed.node.version,modules:observed.node.modules,sha256:node.sha256},
      runtime:observed.runtime,cli:join(observed.runtime.sourceRoot,BASE+'cli.mjs'),cliSha256:observed.cliSha256,
      configFile,configSha256:input.sha256,environmentFile,environmentSha256:secret.sha256,
      environmentNames:names,review:reviewConfig(selected),sourceInput:{configSha256:input.sha256},
      drainBehavior:'ORIGINAL_ACCEPTED_NATIVE_WORK_RETAINS_SIGNER_LEASES'};
    plan.signerCustody=await signerFiles(plan);
    const unitBytes=serviceUnit(plan);plan.unitSha256=hash(unitBytes);
    const bundleId=hash(json(plan));
    await atomicFile(join(directory,unit),unitBytes,{allowed:[null,hash(unitBytes)],mode:0o640,gid:account.gid});
    await command(binaries.systemdAnalyze,['verify','--man=no',join(directory,unit)],{timeout:60000});
    await atomicFile(join(directory,'bundle.json'),json({bundleId,plan}),{mode:0o640,gid:account.gid});
    return publicBundle({bundleId,plan});
  } finally{await lease.close();}
}
export async function readBundle(directory){
  absolute(directory);const doc=(await readJSON(join(directory,'bundle.json'))).value,p=doc.plan;
  need(p?.schema===SCHEMA&&p.directory===directory&&doc.bundleId===hash(json(p)),'HOST_BUNDLE_IDENTITY_INVALID');
  need(directory.startsWith(join(p.hostDirectory,'bundles')+'/')&&dirname(directory)===join(p.hostDirectory,'bundles'),
    'HOST_BUNDLE_PATH_INVALID');
  need(p.configFile===join(directory,'facilitator.json')&&p.environmentFile===join(directory,'signer.env')&&
    p.unitFile===join(p.systemdDirectory,p.unit)&&p.marker===join(p.hostDirectory,'maintenance.json'),
    'HOST_BUNDLE_PATH_INVALID');
  await realDirectory(p.hostDirectory,{uid:0,gid:p.account.gid,mode:0o750});
  await realDirectory(directory,{uid:0,gid:p.account.gid,mode:0o750});
  const cfg=await regular(p.configFile,65536),env=await regular(p.environmentFile,16384),unit=await regular(join(directory,p.unit));
  need(cfg.sha256===p.configSha256&&env.sha256===p.environmentSha256&&unit.sha256===p.unitSha256&&
    unit.sha256===hash(serviceUnit(p)),'HOST_BUNDLE_FILE_CHANGED');
  need(cfg.stat.uid===0&&cfg.stat.mode===0o640&&env.stat.uid===0&&env.stat.mode===0o600,'HOST_BUNDLE_PERMISSIONS_CHANGED');
  const config=validateConfig(JSON.parse(cfg.bytes));
  validateEnvironment(env.bytes,p.environmentNames);
  const selected=validateConfig({...config,operations:{...config.operations,ownershipDirectory:p.ownershipDirectory,requireReady:true}});
  need(json(reviewConfig(selected))===json(p.review),'HOST_BUNDLE_REVIEW_CHANGED');
  return doc;
}
export function publicBundle({bundleId,plan:p}){
  return {schema:SCHEMA,bundleId,directory:p.directory,hostDirectory:p.hostDirectory,unit:p.unit,account:p.account,
    url:p.url,port:p.port,network:p.network,ownershipDirectory:p.ownershipDirectory,ownershipSelection:p.ownershipSelection,enableAtBoot:p.enableAtBoot,
    runtime:p.runtime,node:p.node,configSha256:p.configSha256,cliSha256:p.cliSha256,
    unitSha256:p.unitSha256,environmentNames:p.environmentNames,review:p.review,createdAt:p.createdAt};
}
export function compareBundles(before,after){
  const a=publicBundle(before),b=publicBundle(after);
  const names=['unit','account','url','network','ownershipDirectory','runtime','node','configSha256','environmentNames','review','enableAtBoot'];
  const changes=names.filter(k=>json(a[k])!==json(b[k])).map(k=>({field:k,before:a[k],after:b[k]}));
  return {before:a.bundleId,after:b.bundleId,changes,
    privateSigningEnvironmentChanged:before.plan.environmentSha256!==after.plan.environmentSha256};
}
