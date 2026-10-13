#!/usr/bin/env node
// MIT. Open one original accounting owner from the complete received handover.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

export async function openReceivedCustomer({handover,instance,paused=true,port=0}){
  handover=path.resolve(handover);instance=path.resolve(instance);
  const binding=JSON.parse(await fs.readFile(path.join(instance,'INSTANCE.json'),'utf8'));
  const passEnv='STARFORGE_ACCOUNTING_CUSTOMER_'+createHash('sha256').update(instance).digest('hex').slice(0,24).toUpperCase();
  const previousEnv=Object.hasOwn(process.env,passEnv)?process.env[passEnv]:undefined;
  const restoreEnv=()=>{if(previousEnv===undefined)delete process.env[passEnv];else process.env[passEnv]=previousEnv;};
  process.env[passEnv]=(await fs.readFile(path.join(instance,'private/restore-key.txt'),'utf8')).replace(/\r?\n$/,'');
  let app;
  try{
    const module=path.join(handover,'application/stellar/scf-starforge-20261009/merchant-settlement-accounting/workspace/server.mjs');
    const {startAccountingWorkspace}=await import(pathToFileURL(module));
    app=await startAccountingWorkspace({directory:path.join(instance,'state/account'),
      recoveryStateRoot:path.join(instance,'state'),recoveryBackupRoot:path.join(instance,'backups'),
      recoveryPassEnv:passEnv,recoveryStartPaused:paused,host:'127.0.0.1',port,
      expectedWorkspaceId:binding.workspaceId,expectedSourcesSha256:binding.sourcesSha256});
    const close=app.close.bind(app);
    app.close=async()=>{try{return await close();}finally{restoreEnv();}};
    return app;
  }catch(error){restoreEnv();throw error;}
}

async function main(){
  const args=process.argv.slice(2),options={handover:process.cwd(),paused:true,port:0};
  for(let i=0;i<args.length;i++){
    if(args[i]==='--open'){options.paused=false;continue;}
    if(['--handover','--instance','--port'].includes(args[i])){
      const key=args[i].slice(2);if(!args[i+1])throw new Error('Supply '+args[i]+' value.');
      options[key]=key==='port'?Number(args[++i]):args[++i];continue;
    }
    throw new Error('Use --handover DIRECTORY --instance PRIVATE_DIRECTORY [--open] [--port NUMBER].');
  }
  if(!options.instance)throw new Error('Choose the private receiving instance with --instance.');
  const app=await openReceivedCustomer(options);
  console.log(JSON.stringify({status:app.maintenance.view().mode,url:app.url,
    message:'Open this local address in your browser. Press Ctrl-C to close this owner.'}));
  let closing;
  const stop=()=>{closing??=app.close().then(()=>{console.log(JSON.stringify({status:'CLOSED'}));process.exit(0);})
    .catch(error=>{console.error(error.message);process.exit(1);});};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
if(import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
