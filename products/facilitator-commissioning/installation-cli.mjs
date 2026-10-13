#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import {prepareCommissioningInstallationFiles,inspectCommissioningInstallation} from './installation.mjs';
const usage='facilitator-installation inputs --transfer ORIGINAL_NATIVE_TRANSFER --expected-transfer-sha256 SHA256 --out PRIVATE_DIRECTORY\n'+
'facilitator-installation template --transfer ORIGINAL_NATIVE_TRANSFER --expected-transfer-sha256 SHA256 --seed ORIGINAL_SEED_JSON --case ORIGINAL_CASE_JSON --out PRIVATE_DIRECTORY\n'+
'facilitator-installation prepare --transfer ORIGINAL_NATIVE_TRANSFER --expected-transfer-sha256 SHA256 --seed ORIGINAL_SEED_JSON --case ORIGINAL_CASE_JSON --bindings ORIGINAL_BINDINGS_JSON --out PRIVATE_DIRECTORY\n'+
'facilitator-installation inspect --directory COMPLETE_PREPARATION\n';
async function main(args){
  const [command,...rest]=args;if(!command||command==='help'||command==='--help'){process.stdout.write(usage);return;}
  const allowed=command==='inspect'?['directory']:command==='inputs'?['transfer','expected-transfer-sha256','out']:
    command==='template'?['transfer','expected-transfer-sha256','seed','case','out']:
    command==='prepare'?['transfer','expected-transfer-sha256','seed','case','bindings','out']:null;
  if(!allowed)throw Error(usage);const options={};
  for(let i=0;i<rest.length;i+=2){const key=rest[i]?.replace(/^--/,'');if(!rest[i]?.startsWith('--')||!allowed.includes(key)||!rest[i+1]||Object.hasOwn(options,key))throw Error(usage);options[key]=rest[i+1];}
  if(allowed.some(key=>!options[key]))throw Error(usage);
  const result=command==='inspect'?await inspectCommissioningInstallation(options.directory):
    await prepareCommissioningInstallationFiles({mode:command,transfer:options.transfer,
      expectedTransferSha256:options['expected-transfer-sha256'],seed:options.seed,caseSnapshot:options.case,
      bindings:options.bindings,out:options.out});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
main(process.argv.slice(2)).catch(error=>{process.stderr.write(JSON.stringify({error:error.code??'INSTALLATION_PREPARATION',message:error.message})+'\n');process.exitCode=1;});
