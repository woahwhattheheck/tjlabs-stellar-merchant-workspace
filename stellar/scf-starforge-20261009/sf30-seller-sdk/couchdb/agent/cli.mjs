#!/usr/bin/env node
// MIT. Original merchant host and exact source-owned CouchDB calls.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initializeCouchdbWorkspaceMerchant } from './setup.mjs';
import { MerchantCouchdbWorkspaces, readCouchdbWorkspaceConfiguration } from './client.mjs';
import { only, need, readJson, bytes, safeIssue } from '../common.mjs';
const HELP='CouchDB merchant tools\n\n  couchdb-agent init --options PRIVATE_SETUP_JSON\n  couchdb-agent serve --config MERCHANT_CONFIG [original merchant host options]\n  couchdb-agent call --connection PRIVATE_CONNECTION --tool merchant_couchdb_TOOL --input ORIGINAL_JSON\n\nRetain the same workspaceId and operationId with unchanged complete native inputs.\n';
export async function main(argv=process.argv.slice(2)){
  const action=argv[0];if(!action||['help','--help','-h'].includes(action)){process.stdout.write(HELP);return;}
  if(action==='serve')return (await import('../../../../../stellar-forge/mcp-merchant-operator/serve.mjs')).main(argv);
  const options=Object.create(null);
  for(let i=1;i<argv.length;i+=2){
    need(['--options','--connection','--tool','--input'].includes(argv[i])&&typeof argv[i+1]==='string'&&argv[i+1]&&!argv[i+1].startsWith('--')&&!Object.hasOwn(options,argv[i]),'COUCHDB_AGENT_USAGE',HELP);
    options[argv[i]]=argv[i+1];
  }
  let result;
  if(action==='init'){
    only(options,['--options'],'COUCHDB_AGENT_USAGE');need(options['--options'],'COUCHDB_AGENT_USAGE',HELP);
    result=await initializeCouchdbWorkspaceMerchant(await readJson(resolve(options['--options']),1048576));
  }else if(action==='call'){
    only(options,['--connection','--tool','--input'],'COUCHDB_AGENT_USAGE');need(options['--connection']&&options['--tool']&&options['--input'],'COUCHDB_AGENT_USAGE',HELP);
    const configured=await readCouchdbWorkspaceConfiguration(resolve(options['--connection'])),args=await readJson(resolve(options['--input']),1048576);
    const provider=new MerchantCouchdbWorkspaces({couchdbWorkspaces:configured});
    try{result=await provider.call(options['--tool'],args);}finally{await provider.close();}
  }else need(false,'COUCHDB_AGENT_USAGE',HELP);
  process.stdout.write(bytes(result));return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error=>{process.stderr.write(bytes({error:safeIssue(error)}));process.exitCode=1;});
