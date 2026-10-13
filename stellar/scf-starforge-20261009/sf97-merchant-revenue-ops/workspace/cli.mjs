#!/usr/bin/env node
// MIT. Original-source merchant pricing workspace.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startWorkspace } from './server.mjs';
import { readCommercialHistory, readSavedPlanningSource } from './model.mjs';
import { openScenarioWorkingCopies } from '../planning/working-copies.mjs';
import { open } from 'node:fs/promises';
import { inspectCostWorkspaceRestore, restoreCostWorkspace } from '../economics/archive.mjs';
export { inspectCostWorkspaceRestore };
import { readJson, merchantRoutes } from '../analyze.mjs';

export const PRICING_WORKSPACE_LAUNCH_SCHEMA = 'stellar-forge.merchant-pricing-workspace-launch.v1';

export async function main(argv = process.argv.slice(2)) {
  const usage = 'node workspace/cli.mjs --config SELLER_JSON --state PRIVATE_DIRECTORY (--snapshot ORIGINAL_TRAFFIC_JSON [--history ORIGINAL_HISTORY_JSON] | --history ORIGINAL_HISTORY_JSON | --ops-url ORIGINAL_LOOPBACK_OPERATIONS_URL) [--native-outbox PRIVATE_SF98_DIRECTORY] [--source-package ORIGINAL_API_MERCHANT_PACKAGE] [--release-store ORIGINAL_SELLER_RELEASE_STORE] [--release-runtime HOST_RUNTIME_JSON] [--supplier-usage ORIGINAL_USAGE_JSON] [--accounting-report ORIGINAL_ACCOUNTING_JSON] [--restore-cost-workspace PRIVATE_BACKUP_TAR [--expected-cost-backup-sha256 SHA256]] [--expected-config-sha256 SHA256] [--port 8457]; inspect a complete backup without opening: --inspect-cost-workspace PRIVATE_BACKUP_TAR --state PRIVATE_DIRECTORY; browse original commercial history without opening: --commercial-history reviews|decisions --state PRIVATE_DIRECTORY [--history-query REQUEST_JSON] [--output NEW_JSON]; retain unfinished scenarios: --scenario-working list|load|save|export|import --state PRIVATE_DIRECTORY [--working-request REQUEST_JSON] [--output NEW_JSON]';
  if (argv.length === 1 && ['--help','-h'].includes(argv[0])) { console.log(usage); return; }
  const allowed = new Set(['--config','--state','--snapshot','--history','--ops-url','--native-outbox','--port',
    '--source-package','--release-store','--release-runtime','--supplier-usage','--accounting-report','--restore-cost-workspace',
    '--inspect-cost-workspace','--expected-cost-backup-sha256','--expected-config-sha256','--commercial-history','--history-query','--output','--scenario-working','--working-request']), args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!allowed.has(argv[i]) || !argv[i+1] || Object.hasOwn(args,argv[i])) throw new TypeError(usage);
    args[argv[i]] = argv[i+1];
  }
  if(args['--scenario-working']) {
    const action=args['--scenario-working'],methods={list:'list',load:'load',save:'save',export:'exportCopy',import:'importCopy'};
    if(!args['--state']||!Object.hasOwn(methods,action)||
       Object.keys(args).some(key=>!['--scenario-working','--state','--working-request','--output'].includes(key))||
       (action!=='list'&&!args['--working-request']))throw new TypeError(usage);
    const directory=resolve(args['--state']);
    const input=args['--working-request']?(await readJson(resolve(args['--working-request']),'scenario working request',8*1024*1024)).value:{};
    const working=await openScenarioWorkingCopies({directory,source:async version=>{
      const value=await readSavedPlanningSource({directory,version});
      return {version:value.version,label:value.label,savedAt:value.savedAt,routes:value.routes,
        commercial:value.commercial,provenance:value.provenance,observation:value.observationSummary,
        sellerChanged:null};
    }});
    const result=await working[methods[action]](input),bytes=JSON.stringify(result,null,2)+'\n';
    if(args['--output']) {
      const file=await open(resolve(args['--output']),'wx',0o600);
      try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
    }else console.log(bytes.trimEnd());
    return result;
  }
  if(args['--working-request'])throw new TypeError('--working-request requires --scenario-working.');
  if(args['--commercial-history']) {
    if(!args['--state']||!['reviews','decisions'].includes(args['--commercial-history'])||
        Object.keys(args).some(key=>!['--commercial-history','--state','--history-query','--output'].includes(key)))
      throw new TypeError(usage);
    const input=args['--history-query']?(await readJson(resolve(args['--history-query']),'commercial history request',2*1024*1024)).value:{};
    if(!input||typeof input!=='object'||Array.isArray(input)||
        (input.kind!==undefined&&input.kind!==args['--commercial-history']))
      throw new TypeError('History request must select the same reviews or decisions as --commercial-history.');
    const report=await readCommercialHistory({directory:resolve(args['--state']),input:{...input,kind:args['--commercial-history']}});
    const bytes=JSON.stringify(report,null,2)+'\n';
    if(args['--output']) {
      const file=await open(resolve(args['--output']),'wx',0o600);
      try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
    } else console.log(bytes.trimEnd());
    return report;
  }
  if(args['--history-query']||args['--output']) throw new TypeError('--history-query and --output require --commercial-history.');
  if(args['--inspect-cost-workspace']) {
    if(!args['--state']||Object.keys(args).some(key=>!['--inspect-cost-workspace','--state'].includes(key)))
      throw new TypeError(usage);
    const review=await inspectCostWorkspaceRestore({
      archive:resolve(args['--inspect-cost-workspace']),directory:resolve(args['--state']),
    });
    console.log(JSON.stringify(review,null,2));
    return review;
  }
  if(args['--expected-cost-backup-sha256']&&(!args['--restore-cost-workspace']||
      !/^[a-f0-9]{64}$/.test(args['--expected-cost-backup-sha256'])))
    throw new TypeError('A reviewed backup SHA-256 requires its original --restore-cost-workspace archive.');
  if (!args['--config'] || !args['--state'] || !(args['--snapshot'] || args['--history'] || args['--ops-url']) ||
      (args['--ops-url'] && (args['--snapshot'] || args['--history']))) throw new TypeError(usage);
  if (args['--port'] !== undefined && (!/^\d{1,5}$/.test(args['--port']) || Number(args['--port'])>65535))
    throw new TypeError('Port must be 0–65535.');
  if ((args['--release-store'] && !args['--source-package']) || (args['--release-runtime'] && !args['--release-store']))
    throw new TypeError('A release store requires --source-package; --release-runtime also requires --release-store.');
  const releaseRuntime = args['--release-runtime']
    ? (await readJson(resolve(args['--release-runtime']),'original release runtime',262144)).value : {};
  let costRestore;
  if(args['--restore-cost-workspace']) {
    // Validate the original selected seller before receiving any workspace files.
    // The normal model checks the same seller again before opening its listener.
    const seller=await readJson(resolve(args['--config']),'seller config');
    merchantRoutes(seller.value);
    if(args['--expected-config-sha256']!==undefined&&seller.hash!==args['--expected-config-sha256'])
      throw Object.assign(new Error('Seller configuration changed after application review.'),{code:'SELLER_CHANGED'});
    costRestore=await restoreCostWorkspace({
      archive:resolve(args['--restore-cost-workspace']),directory:resolve(args['--state']),
      expectedArchiveSha256:args['--expected-cost-backup-sha256'],
    });
  }
  const workspace = await startWorkspace({config:args['--config'],directory:args['--state'],snapshot:args['--snapshot'],
    history:args['--history'],opsUrl:args['--ops-url'],nativeOutbox:args['--native-outbox'],
    sourcePackage:args['--source-package'],releaseStore:args['--release-store'],releaseRuntime,
    supplierUsage:args['--supplier-usage'],accountingReport:args['--accounting-report'],
    expectedConfigSha256:args['--expected-config-sha256'],
    port:args['--port'] === undefined ? 8457 : Number(args['--port'])});
  console.log(JSON.stringify({schema:PRICING_WORKSPACE_LAUNCH_SCHEMA,
    status:'MERCHANT_PRICING_WORKSPACE_READY',...workspace.model.launch,
    pid:process.pid,url:workspace.url,planningUrl:workspace.planningUrl,costsUrl:workspace.url+'/economics',
    ...(workspace.tariffsUrl?{tariffsUrl:workspace.tariffsUrl}:{}),
    ...(workspace.performanceUrl?{performanceUrl:workspace.performanceUrl}:{}),
    ...(costRestore?{costRestore:{...costRestore,archive:resolve(args['--restore-cost-workspace'])}}:{})}));
  const stop = () => workspace.close().catch(() => { process.exitCode = 1; });
  process.once('SIGINT',stop); process.once('SIGTERM',stop);
  return workspace;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => { console.error('SF97 workspace:',error.message); process.exitCode = 1; });
