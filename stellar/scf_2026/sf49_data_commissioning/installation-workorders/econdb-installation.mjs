#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {packEcondbWorkspace,catalogueEcondbInstallationSource,inspectEcondbInstallationSource} from './econdb-installation/source.mjs';
import {prepareEcondbInstallation,reopenEcondbInstallation} from './econdb-installation/prepare.mjs';
import {readProfile} from './profiles.mjs';
import {reopenEcondbAnyPreparation} from './econdb-installation/following-service.mjs';
import {main as sourceServiceMain} from './econdb-installation/service-cli.mjs';
import {bindingTemplate} from './prepare-core.mjs';
import {need,read,parse,retain,json,directory,parent} from './econdb-installation/io.mjs';
export async function main(argv=process.argv.slice(2)){
 const [action,...args]=argv,keys={directory:'directory',workspace:'workspace',archive:'archivePath',
 'archive-sha256':'expectedArchiveSha256',project:'projectId','project-revision':'projectRevision',
 'input-sha256':'expectedInputSha256',seed:'seedPath',bindings:'bindingsPath',commissioning:'commissioningPath',attachments:'attachmentsPath',request:'requestPath'};
 need(['pack','catalogue','inspect','template','prepare','reopen','following-compare','following-prepare'].includes(action),'Use econdb-installation pack|catalogue|inspect|template|prepare|reopen|following-compare|following-prepare.');
 const options={};for(let i=0;i<args.length;i+=2){const name=keys[args[i]?.slice(2)];need(args[i]?.startsWith('--')&&name&&args[i+1]&&options[name]===undefined,'Use complete unique --name value options.');options[name]=name==='projectRevision'?Number(args[i+1]):args[i+1];}
 const controller=new AbortController(),stop=()=>controller.abort(new Error('Original Econdb preparation interrupted.'));
 process.once('SIGINT',stop);process.once('SIGTERM',stop);options.signal=controller.signal;
 try{
  if(action==='pack')return await packEcondbWorkspace(options);
  if(action==='catalogue')return await catalogueEcondbInstallationSource(options);
  if(action==='inspect')return (await inspectEcondbInstallationSource(options)).source;
  if(action==='prepare')return await prepareEcondbInstallation(options);
  if(action==='reopen')return await reopenEcondbAnyPreparation(options);
  if(['following-compare','following-prepare'].includes(action)){
   need(options.directory&&options.requestPath,'Select the original Source Desk directory and complete host-captured invocation.');
   const original=parse(await read(resolve(options.requestPath),8*1024*1024));need(original.action===action,'Keep the original following action.');
   return await sourceServiceMain(['--directory',resolve(options.directory),'--input',resolve(options.requestPath)]);
  }
  need(options.seedPath&&options.directory,'Select the original Workshare seed and owned output directory.');
  const b=bindingTemplate(parse(await read(resolve(options.seedPath),2*1024*1024)),readProfile('econdb-customer').value);
  const root=await directory(resolve(options.directory));await retain(await parent(root,'bindings.json'),json(b));return b;
 }finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().then(v=>process.stdout.write(JSON.stringify(v,null,2)+'\n')).catch(e=>{process.stderr.write(JSON.stringify({code:e.code??'ECONDB_INSTALLATION',message:e.message})+'\n');process.exitCode=1;});
