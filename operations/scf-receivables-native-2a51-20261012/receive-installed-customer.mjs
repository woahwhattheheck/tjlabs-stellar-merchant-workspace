#!/usr/bin/env node
// MIT. Continue one retained customer operation through the original selected release.
import {open,mkdir,lstat,realpath,readFile,readdir,link,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {resolve,dirname,join,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

const OPERATION='SCF-RECEIVABLES-NATIVE-2A51-20261012';
const HERE=dirname(fileURLToPath(import.meta.url));
const ROOT='operations/scf-receivables-native-2a51-20261012';
const DISTRIBUTION='stellar/scf-starforge-20261009/distribution';
const json=value=>JSON.stringify(value,null,2)+'\n';
const sha=value=>createHash('sha256').update(value).digest('hex');
const now=()=>new Date().toISOString();
function need(ok,code,message){if(!ok)throw Object.assign(new Error(message),{code});}
function inside(parent,path){const x=relative(parent,path);return x===''||x!=='..'&&!x.startsWith('../')&&!isAbsolute(x);}
async function exists(path){try{return await lstat(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function regular(path){const s=await lstat(path);need(s.isFile()&&!s.isSymbolicLink(),'CUSTOMER_SOURCE_FILE','Keep the original regular file: '+path);return readFile(path);}
async function read(path){return JSON.parse(await regular(path));}
async function sync(directory){const f=await open(directory,constants.O_RDONLY|(constants.O_DIRECTORY??0));try{await f.sync();}finally{await f.close();}}
async function retain(path,value){
  const body=Buffer.isBuffer(value)?value:Buffer.from(typeof value==='string'?value:json(value));
  if(await exists(path)){need((await regular(path)).equals(body),'CUSTOMER_RECORD_CHANGED','The original retained record differs: '+path);return;}
  const pending=join(dirname(path),'.'+randomUUID()+'.pending'),f=await open(pending,'wx',0o600);
  try{await f.writeFile(body);await f.sync();}finally{await f.close();}
  try{await link(pending,path);}catch(error){
    if(error.code!=='EEXIST')throw error;
    need((await regular(path)).equals(body),'CUSTOMER_RECORD_CHANGED','A different original record was published: '+path);
  }finally{await unlink(pending);}
  await sync(dirname(path));
}
function parse(args){
  const out={};
  for(let i=0;i<args.length;i++){
    const flag=args[i];
    if(['--help','--offline','--held-lock'].includes(flag)){need(!out[flag],'CUSTOMER_ARGUMENT','Use each flag once.');out[flag]=true;continue;}
    need(['--repo','--ref','--out','--selection','--sdk-profile','--sdk-node-modules','--mcp-node-modules','--python','--continuation'].includes(flag)&&
      out[flag]===undefined&&args[i+1]&&!args[i+1].startsWith('--'),'CUSTOMER_ARGUMENT','Unknown, repeated or missing argument: '+flag);
    out[flag]=args[++i];
  }
  return out;
}
function git(repo,args){return execFileSync('git',['-C',repo,...args],{encoding:'utf8',maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});}
async function checkedDirectory(path){
  const resolved=await realpath(path),s=await lstat(resolved);
  need(s.isDirectory()&&!s.isSymbolicLink(),'CUSTOMER_DIRECTORY','Select an original directory: '+path);return resolved;
}
async function logIdentity(path){const bytes=await regular(path);return{path,bytes:bytes.length,sha256:sha(bytes)};}
async function phase(directory,name,command,args,options={}){
  const root=join(directory,'phases',name);await mkdir(root,{recursive:true,mode:0o700});
  const identity={phase:name,command:[command,...args],cwd:options.cwd};
  const resultPath=join(root,'result.json');
  if(await exists(resultPath)){
    const prior=await read(resultPath);need(JSON.stringify(prior.identity)===JSON.stringify(identity),'CUSTOMER_PHASE_CHANGED','Keep the original phase command.');
    for(const file of [prior.stdout,prior.stderr]){const actual=await logIdentity(file.path);need(actual.sha256===file.sha256&&actual.bytes===file.bytes,'CUSTOMER_RESULT_CHANGED','Retained phase output changed.');}
    return prior;
  }
  need(!await exists(join(root,'started.json')),'CUSTOMER_OUTCOME_UNKNOWN',
    'Reconcile the original admitted process before continuing '+root);
  await retain(join(root,'started.json'),{...identity,controllerPid:process.pid,startedAt:now()});
  const stdoutPath=join(root,'stdout.log'),stderrPath=join(root,'stderr.log');
  const stdout=await open(stdoutPath,'wx',0o600),stderr=await open(stderrPath,'wx',0o600);
  let outcome;
  try{
    outcome=await new Promise((done,reject)=>{
      const child=spawn(command,args,{cwd:options.cwd,env:options.env,stdio:['ignore',stdout.fd,stderr.fd]});
      child.once('spawn',()=>process.stdout.write(json({event:'CUSTOMER_PHASE_ADMITTED',phase:name,pid:child.pid,directory:root}).trimEnd()+'\n'));
      child.once('error',reject);
      child.once('close',(exitCode,signal)=>done({exitCode,signal,pid:child.pid??null}));
    });
  }catch(error){outcome={exitCode:null,signal:null,launchError:{code:error.code??'SPAWN_ERROR',message:error.message}};}
  finally{await stdout.sync();await stderr.sync();await stdout.close();await stderr.close();}
  const result={identity,...outcome,completedAt:now(),stdout:await logIdentity(stdoutPath),stderr:await logIdentity(stderrPath)};
  await retain(resultPath,result);
  process.stdout.write(json({event:'CUSTOMER_PHASE_RECEIVED',phase:name,exitCode:result.exitCode,result:resultPath}).trimEnd()+'\n');
  return result;
}
async function completedPhase(...args){
  const result=await phase(...args);need(result.exitCode===0,'CUSTOMER_PHASE_FAILED',
    'Original phase '+result.identity.phase+' failed; retain its complete output at '+result.stderr.path);return result;
}
const HELP='node receive-installed-customer.mjs --repo EXACT_CHECKOUT --ref FULL_COMMIT --out PRIVATE_OPERATION --sdk-profile EXISTING/package.json --mcp-node-modules EXISTING/node_modules [--sdk-node-modules EXISTING/node_modules] [--selection merchant-commissioning-collections] [--python python3] [--continuation PRIVATE_JSON] [--offline]\n\nBuild and admit the exact selected product, then continue the retained Xero customer handover and independent operator through its original programme. Repeat the same command to resume completed phases. A started phase without a result requires original-process reconciliation. Keep the existing backup passphrase environment variable configured; its value is never retained in this operation.\n';
export async function main(args=process.argv.slice(2)){
  const options=parse(args);if(options['--help']){process.stdout.write(HELP);return;}
  for(const key of ['--repo','--ref','--out','--sdk-profile','--mcp-node-modules'])need(options[key],'CUSTOMER_ARGUMENT','Supply '+key);
  const ref=options['--ref'],selection=options['--selection']??'merchant-commissioning-collections';
  need(/^[a-f0-9]{40}$/.test(ref)&&selection==='merchant-commissioning-collections','CUSTOMER_SOURCE','Use the complete immutable commissioning release.');
  need(process.platform==='linux'&&Number(process.versions.node.split('.')[0])>=22,'CUSTOMER_RUNTIME','Use original Linux Node22+.');
  const repo=await checkedDirectory(resolve(options['--repo'])),output=resolve(options['--out']);
  const parent=await checkedDirectory(dirname(output));need(parent===dirname(output),'CUSTOMER_DIRECTORY','Output must use its actual parent.');
  if(!options['--held-lock']){
    const result=await new Promise((done,reject)=>{
      const child=spawn('flock',['--exclusive','--nonblock',output+'.lock',process.execPath,fileURLToPath(import.meta.url),...args,'--held-lock'],{stdio:'inherit'});
      child.once('error',reject);child.once('close',(code,signal)=>done({code,signal}));
    });process.exitCode=result.code??1;return result;
  }
  need(git(repo,['rev-parse','HEAD']).trim()===ref&&git(repo,['rev-parse','--verify',ref+'^{commit}']).trim()===ref,
    'CUSTOMER_SOURCE','Use the checkout at the exact selected original commit.');
  git(repo,['diff','--exit-code',ref,'--',DISTRIBUTION,ROOT]);
  need(await realpath(HERE)===await realpath(join(repo,ROOT)),'CUSTOMER_SOURCE','Invoke this programme from that selected checkout.');
  const passphrase=process.env.STARFORGE_ACCOUNTING_BACKUP_PASSPHRASE;
  need(typeof passphrase==='string'&&Buffer.byteLength(passphrase)>=16&&Buffer.byteLength(passphrase)<=65536,
    'CUSTOMER_BACKUP_SECRET','Configure the original STARFORGE_ACCOUNTING_BACKUP_PASSPHRASE through the existing private secret channel.');
  const continuation=options['--continuation']?await regular(await realpath(options['--continuation'])):null;
  if(continuation)JSON.parse(continuation.toString('utf8'));
  const sdkProfile=await realpath(options['--sdk-profile']),profileBytes=await regular(sdkProfile);
  const sdk=await checkedDirectory(options['--sdk-node-modules']??join(dirname(sdkProfile),'node_modules'));
  const mcp=await checkedDirectory(options['--mcp-node-modules']);
  for(const input of [repo,sdkProfile,sdk,mcp])need(!inside(output,input)&&!inside(input,output),'CUSTOMER_OVERLAP','Keep source, dependencies and operation directories separate.');
  const old=await exists(output);if(old)need(old.isDirectory()&&!old.isSymbolicLink(),'CUSTOMER_DIRECTORY','Keep the original operation directory.');else await mkdir(output,{mode:0o700});
  need(await realpath(output)===output&&!((await lstat(output)).mode&0o077),'CUSTOMER_PRIVATE_DIRECTORY','Keep the operation owner-private.');
  if(!await exists(join(output,'identity.json')))need((await readdir(output)).length===0,'CUSTOMER_DIRECTORY_NOT_EMPTY','Use the existing same operation or a new empty private directory.');
  const identity={schema:'stellar-forge.installed-customer-continuation.v1',operation:OPERATION,sourceCommit:ref,sourceSelection:selection,
    repository:repo,directory:output,sdkProfile,sdkProfileSha256:sha(profileBytes),sdkNodeModules:sdk,mcpNodeModules:mcp,
    python:options['--python']??'python3',offline:Boolean(options['--offline']),
    continuation:continuation?{bytes:continuation.length,sha256:sha(continuation)}:null};
  await retain(join(output,'identity.json'),identity);
  if(continuation)await retain(join(output,'continuation.json'),continuation);
  const environment={};
  for(const key of ['PATH','HOME','LANG','LC_ALL','STARFORGE_ACCOUNTING_BACKUP_PASSPHRASE'])if(process.env[key]!==undefined)environment[key]=process.env[key];
  environment.PYTHONDONTWRITEBYTECODE='1';
  const runtime=join(output,'runtime');await mkdir(runtime,{recursive:true,mode:0o700});
  Object.assign(environment,{TMPDIR:runtime,SCF_MCP_RECEIVABLES_TMP:runtime,SCF_INVOICE_SDK_PACKAGE:sdkProfile});
  const build=await completedPhase(output,'selected-build',process.execPath,[join(repo,DISTRIBUTION,'build.mjs'),
    '--repo',repo,'--ref',ref,'--selection',selection,'--out',join(output,'release-build'),
    '--python',identity.python,...(identity.offline?['--offline']:[])],{cwd:repo,env:environment});
  const built=JSON.parse(await readFile(build.stdout.path,'utf8'));
  need(built.status==='PACKAGED'&&built.sourceCommit===ref&&built.sourceSelection?.id===selection&&
    typeof built.archive==='string'&&/^[a-f0-9]{64}$/.test(built.sha256),'CUSTOMER_BUILD','Keep the original complete selected build receipt.');
  const archive=await regular(built.archive);need(sha(archive)===built.sha256,'CUSTOMER_ARCHIVE_CHANGED','The complete built archive differs.');
  const admission=join(output,'installed');
  await completedPhase(output,'installed-admission',process.execPath,[join(repo,ROOT,'continue-installed.mjs'),
    '--archive',built.archive,'--sha256',built.sha256,'--source-ref',ref,'--out',admission,'--mode','admission','--selection',selection,
    '--sdk-profile',sdkProfile,'--sdk-node-modules',sdk,'--mcp-node-modules',mcp,'--python',identity.python],{cwd:repo,env:environment});
  const releasePath=join(admission,'installed-release.json'),release=await read(releasePath);
  need(release.schema==='stellar-forge.retained-customer-installed-release.v1'&&release.sourceCommit===ref&&
    release.sourceSelection===selection&&release.archive.sha256===built.sha256&&release.admission.complete,
    'CUSTOMER_RELEASE','The admitted original release differs.');
  const customer=join(output,'customer-handover');
  const received=await completedPhase(output,'independent-customer',process.execPath,
    [join(release.sourceRoot,ROOT,'programs/XERO_CUSTOMER_CASE.mjs'),'--release',releasePath,'--out',customer,
      ...(continuation?['--continuation',join(output,'continuation.json')]:[])],
    {cwd:release.sourceRoot,env:environment});
  const nativePath=join(customer,'XERO_CUSTOMER_CASE_RESULT.json'),native=await read(nativePath);
  const result={schema:'stellar-forge.installed-customer-continuation-result.v1',operation:OPERATION,
    sourceCommit:ref,sourceSelection:selection,installedRelease:releasePath,installedReleaseIdentity:await logIdentity(releasePath),
    sourceRoot:release.sourceRoot,archive:release.archive,customerHandover:customer,
    nativeResult:await logIdentity(nativePath),native,completedAt:received.completedAt};
  await retain(join(output,'customer-receiving-result.json'),result);process.stdout.write(json(result));return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{
  process.stderr.write(json({operation:OPERATION,code:error.code??'CUSTOMER_RECEIVING_FAILED',message:error.message}));
  process.exitCode=1;
});
