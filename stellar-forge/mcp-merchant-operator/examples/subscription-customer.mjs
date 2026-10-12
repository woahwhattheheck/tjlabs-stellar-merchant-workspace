#!/usr/bin/env node
// MIT. Operate a complete publisher/customer subscription from retained OData sources.
import {readFile,open,mkdir,rename,link,unlink,stat} from 'node:fs/promises';
import {dirname,join,resolve,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';

const need=(value,message)=>{if(!value)throw new Error(message);};
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const encoded=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const parse=raw=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
const exists=async path=>{try{await stat(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
async function syncDirectory(path){const handle=await open(path,'r');try{await handle.sync();}finally{await handle.close();}}
async function write(path,value,{immutable=false}={}){
  const raw=Buffer.isBuffer(value)?value:encoded(value),temporary=path+'.'+randomUUID()+'.next';
  if(immutable&&await exists(path)){need((await readFile(path)).equals(raw),'Preserve the selected file: '+path);return;}
  const handle=await open(temporary,'wx',0o600);
  try{await handle.writeFile(raw);await handle.sync();}finally{await handle.close();}
  try{
    if(immutable){try{await link(temporary,path);}catch(error){if(error.code!=='EEXIST')throw error;need((await readFile(path)).equals(raw),'A different selected file exists: '+path);}}
    else await rename(temporary,path);
    await syncDirectory(dirname(path));
  }finally{try{await unlink(temporary);}catch(error){if(error.code!=='ENOENT')throw error;}}
}
async function identity(path){const raw=await readFile(path);return {path,bytes:raw.length,sha256:sha(raw)};}
const progress=(phase,detail={})=>process.stdout.write(JSON.stringify({phase,...detail})+'\n');
const base='stellar/scf-starforge-20261009/sf30-seller-sdk/odata/';
const native=(checkout,path)=>import(pathToFileURL(join(checkout,path)).href);

async function main(){
  need(process.argv.length===3,'Usage: subscription-customer.mjs INPUT.json');
  const inputPath=resolve(process.argv[2]),inputRaw=await readFile(inputPath),input=parse(inputRaw);
  need(input.schema==='stellar-forge.odata-subscription-customer-input.v1','Choose the complete subscription customer input.');
  need(typeof input.operationId==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(input.operationId),'Choose one stable operation ID.');
  need(typeof input.title==='string'&&input.title.trim()===input.title&&input.title.length>0,'Choose the customer subscription title.');
  for(const key of ['checkout','outputDirectory','workspaceTransfer'])need(typeof input[key]==='string'&&isAbsolute(input[key]),'Choose an absolute '+key+'.');
  need(/^[a-f0-9]{64}$/.test(input.workspaceTransferSha256),'Pin the complete original workspace transfer.');
  const checkout=resolve(input.checkout),out=resolve(input.outputDirectory);
  need(out!==checkout&&!out.startsWith(checkout+'/')&&!checkout.startsWith(out+'/'),'Keep the selected source checkout and customer operation separate.');
  const {leased,same}=await native(checkout,base+'live/subscriptions/files.mjs');
  const publisher=await native(checkout,base+'live/subscriptions/core.mjs');
  const customer=await native(checkout,base+'live/subscriptions/customer.mjs');
  const {openCollection}=await native(checkout,base+'live/collection.mjs');
  const {openODataWorkspace}=await native(checkout,base+'workspace.mjs');
  return leased(out,async()=>{
    for(const name of ['steps','transfers','backups'])await mkdir(join(out,name),{recursive:true,mode:0o700});
    const journalPath=join(out,'subscription-customer-operation.json');
    let journal=await exists(journalPath)?parse(await readFile(journalPath)):
      {schema:'stellar-forge.odata-subscription-customer-operation.v1',operation_id:input.operationId,input_sha256:sha(inputRaw),state:'RUNNING',steps:{}};
    need(journal.operation_id===input.operationId&&journal.input_sha256===sha(inputRaw),'Continue the selected operation with its unchanged input.');
    const save=()=>write(journalPath,journal);
    async function selectedFile(record){
      const actual=await identity(record.path);
      need(actual.bytes===record.bytes&&actual.sha256===record.sha256,'The retained customer result changed: '+record.path);
      return parse(await readFile(record.path));
    }
    async function step(label,selection,operation){
      need(/^[a-z][a-z0-9-]+$/.test(label),'Choose a stable step name.');
      const path=join(out,'steps',label+'.json');
      let entry=journal.steps[label];
      if(entry)need(same(entry.selection,selection),'The selected customer operation changed: '+label);
      else{entry={selection,state:'RUNNING'};journal.steps[label]=entry;await save();}
      if(entry.state==='COMPLETE')return selectedFile(entry.result);
      // The native operation may have returned before its outer journal was saved.
      // Adopt that exact retained return instead of performing the step again.
      if(await exists(path)){
        const result=parse(await readFile(path));entry.result=await identity(path);entry.state='COMPLETE';await save();return result;
      }
      entry.state='RUNNING';await save();
      const result=await operation();
      await write(path,result,{immutable:true});
      entry.result=await identity(path);entry.state='COMPLETE';await save();
      progress('subscription-customer-step',{step:label,state:'COMPLETE'});return result;
    }
    async function rows(label,directory,{revision,consumer=false}={}){
      const result=[];let offset=0,page=0,editionSha256=null,total=null;
      do{
        const returned=await step(label+'-'+page,{directory,revision:revision??null,consumer,offset,limit:250},
          ()=>consumer?customer.subscriptionCustomerRows(directory,{offset,limit:250}):
            publisher.subscriptionRows(directory,{revision,kind:'rows',offset,limit:250}));
        if(total===null){total=returned.total;editionSha256=returned.editionSha256;}
        need(returned.total===total&&returned.editionSha256===editionSha256&&Array.isArray(returned.items),'The selected edition changed during paging.');
        if(revision!==undefined)need(returned.revision===revision,'The selected row revision changed.');
        result.push(...returned.items);const next=returned.nextOffset;
        need(next===null||Number.isSafeInteger(next)&&next>offset&&next===result.length,'The row continuation did not advance.');
        offset=next;page++;need(page<=4001,'The complete subscription exceeds its native row limit.');
      }while(offset!==null);
      need(result.length===total,'The complete row sequence is missing data.');
      return {revision,editionSha256,total,items:result};
    }
    try{
      if(journal.state==='COMPLETE'){
        const result=await selectedFile(journal.result);
        for(const entry of Object.values(journal.steps))if(entry.state==='COMPLETE')await selectedFile(entry.result);
        for(const file of result.final_files){
          const actual=await identity(file.path);need(actual.bytes===file.bytes&&actual.sha256===file.sha256,'A completed customer delivery file changed.');
        }
        progress('subscription-customer',{state:'COMPLETE',operation_id:input.operationId,rows:result.source_rows,reused:true});return result;
      }
      journal.state='RUNNING';await save();
      const transferRaw=await readFile(input.workspaceTransfer);
      need(sha(transferRaw)===input.workspaceTransferSha256,'The selected complete OData workspace transfer changed.');
      const workspaceDirectory=join(out,'source-workspace');
      await step('restore-source-workspace',{sha256:input.workspaceTransferSha256,directory:workspaceDirectory},async()=>{
        const workspace=await openODataWorkspace({directory:workspaceDirectory});
        try{return await workspace.restore(parse(transferRaw));}finally{await workspace.close();}
      });
      function collectionPath(value){
        need(typeof value==='string'&&value.length>0&&!isAbsolute(value),'Choose a retained collection relative to the source workspace.');
        const path=resolve(workspaceDirectory,value),rel=relative(workspaceDirectory,path);
        need(rel&&rel!=='..'&&!rel.startsWith('../')&&!isAbsolute(rel),'Choose a collection inside the restored source workspace.');return path;
      }
      const beforeDirectory=collectionPath(input.beforeCollection),afterDirectory=collectionPath(input.afterCollection);
      const before=await openCollection(beforeDirectory),after=await openCollection(afterDirectory);
      need(before.serviceRoot===after.serviceRoot&&before.entitySet===after.entitySet&&same(before.keyFields,after.keyFields),'Select collections from the same original service, entity set and declared keys.');
      const fields=before.mapping.filter(field=>after.mapping.some(other=>same(field,other))).map(field=>field.path);
      need(fields.length>0&&before.keyFields.every(field=>fields.includes(field)),'Retain every declared key and the shared original field definitions.');
      if(input.expectedRows!==undefined)need(before.rows===input.expectedRows&&after.rows===input.expectedRows,'The selected complete source row count differs.');
      const publisherDirectory=join(out,'publisher'),customerDirectory=join(out,'customer');
      const restoredPublisher=join(out,'restored-publisher'),restoredCustomer=join(out,'restored-customer');
      const createRequest={directory:publisherDirectory,collectionDirectory:beforeDirectory,collectionSha256:before.manifestSha256,
        title:input.title,fields,requestId:input.operationId+':baseline'};
      const created=await step('create-baseline',createRequest,()=>publisher.createSubscription(createRequest));
      const createAgain=await step('reopen-baseline-request',createRequest,()=>publisher.createSubscription(createRequest));
      need(created.revision===1&&createAgain.reused===true&&created.manifestSha256===createAgain.manifestSha256,'The original baseline request changed its edition.');
      const baseline=await step('export-baseline',{revision:1,edition:created.manifestSha256},
        ()=>publisher.exportSubscription(publisherDirectory,{output:join(out,'transfers','baseline-1'),fromRevision:0,toRevision:1}));
      const firstReceive=await step('receive-baseline',{sha256:baseline.sha256,directory:customerDirectory},
        ()=>customer.receiveSubscription({directory:customerDirectory,transferDirectory:baseline.directory,expectedSha256:baseline.sha256}));
      const appendRequest={directory:publisherDirectory,collectionDirectory:afterDirectory,collectionSha256:after.manifestSha256,
        requestId:input.operationId+':second-source',expectedRevision:1,
        note:'Select the second retained complete collection over the shared original field definitions. The edition preserves its source query and acquisition window.'};
      const appended=await step('publish-second-source',appendRequest,()=>publisher.appendSubscription(appendRequest));
      need(appended.revision===2,'The selected second complete collection did not become edition 2.');
      if(input.expectedChanges!==undefined)for(const [key,value]of Object.entries(input.expectedChanges))
        need(appended.changes[key]===value,'The observed original change count differs: '+key);
      const incremental=await step('export-second-source',{from:1,to:2,edition:appended.manifestSha256},
        ()=>publisher.exportSubscription(publisherDirectory,{output:join(out,'transfers','changes-1-to-2'),fromRevision:1,toRevision:2}));
      const secondReceive=await step('receive-second-source',{sha256:incremental.sha256,directory:customerDirectory},
        ()=>customer.receiveSubscription({directory:customerDirectory,transferDirectory:incremental.directory,expectedSha256:incremental.sha256}));
      const oldReceive=await step('reuse-old-baseline',{sha256:baseline.sha256,directory:customerDirectory},
        ()=>customer.receiveSubscription({directory:customerDirectory,transferDirectory:baseline.directory,expectedSha256:baseline.sha256}));
      const customerAtTwo=await step('inspect-customer-two',{directory:customerDirectory,revision:2},()=>customer.inspectSubscriptionCustomer(customerDirectory));
      need(oldReceive.reused===true&&customerAtTwo.revision===2&&customerAtTwo.editionSha256===appended.manifestSha256,'An old completed transfer changed the current customer edition.');
      const publisherRows=await rows('publisher-two',publisherDirectory,{revision:2});
      const customerRows=await rows('customer-two',customerDirectory,{revision:2,consumer:true});
      need(same(publisherRows.items,customerRows.items),'The customer differs from the publisher across the complete delivered row sequence.');
      const publisherBackup=await step('backup-publisher-two',{directory:publisherDirectory,revision:2},
        ()=>publisher.subscriptionBackup(publisherDirectory,{output:join(out,'backups','publisher-2'),expectedRevision:2}));
      const customerBackup=await step('backup-customer-two',{directory:customerDirectory,revision:2,edition:appended.manifestSha256},
        ()=>customer.subscriptionCustomerBackup(customerDirectory,{output:join(out,'backups','customer-2'),expectedRevision:2,expectedEditionSha256:appended.manifestSha256}));
      const publisherRestore=await step('restore-publisher-two',{directory:restoredPublisher,sha256:publisherBackup.sha256},
        ()=>publisher.restoreSubscription({directory:restoredPublisher,source:publisherBackup.directory,expectedSha256:publisherBackup.sha256}));
      const customerRestore=await step('restore-customer-two',{directory:restoredCustomer,sha256:customerBackup.sha256},
        ()=>customer.restoreSubscriptionCustomer({directory:restoredCustomer,source:customerBackup.directory,expectedSha256:customerBackup.sha256}));
      const restoredRows=await rows('restored-customer-two',restoredCustomer,{revision:2,consumer:true});
      need(same(customerRows.items,restoredRows.items),'The complete restored customer differs from its saved row sequence.');
      const continuationRequest={directory:restoredPublisher,collectionDirectory:afterDirectory,collectionSha256:after.manifestSha256,
        requestId:input.operationId+':restored-continuation',expectedRevision:2,
        note:'Continue the restored publisher with the same retained second collection. This deliberate unchanged-source edition exercises continued delivery; it introduces no new supplier observation.'};
      const continued=await step('continue-restored-publisher',continuationRequest,()=>publisher.appendSubscription(continuationRequest));
      need(continued.revision===3&&continued.changes.events===0&&continued.changes.unchanged===after.rows,'The same complete retained source changed during restored continuation.');
      const continuation=await step('export-restored-continuation',{from:2,to:3,edition:continued.manifestSha256},
        ()=>publisher.exportSubscription(restoredPublisher,{output:join(out,'transfers','changes-2-to-3'),fromRevision:2,toRevision:3}));
      const continuedReceive=await step('receive-restored-continuation',{directory:restoredCustomer,sha256:continuation.sha256},
        ()=>customer.receiveSubscription({directory:restoredCustomer,transferDirectory:continuation.directory,expectedSha256:continuation.sha256}));
      const finalPublisher=await step('inspect-final-publisher',{directory:restoredPublisher,revision:3},()=>publisher.inspectSubscription(restoredPublisher));
      const finalCustomer=await step('inspect-final-customer',{directory:restoredCustomer,revision:3},()=>customer.inspectSubscriptionCustomer(restoredCustomer));
      need(finalPublisher.head===3&&finalCustomer.revision===3&&finalCustomer.editionSha256===continued.manifestSha256,'The continued publisher and customer do not share edition 3.');
      const finalPublisherRows=await rows('publisher-three',restoredPublisher,{revision:3});
      const finalCustomerRows=await rows('customer-three',restoredCustomer,{revision:3,consumer:true});
      need(same(finalPublisherRows.items,finalCustomerRows.items)&&same(finalCustomerRows.items,restoredRows.items),'The complete continued row sequence changed.');
      const finalPublisherBackup=await step('backup-final-publisher',{revision:3,edition:continued.manifestSha256},
        ()=>publisher.subscriptionBackup(restoredPublisher,{output:join(out,'backups','publisher-3'),expectedRevision:3}));
      const finalCustomerBackup=await step('backup-final-customer',{revision:3,edition:continued.manifestSha256},
        ()=>customer.subscriptionCustomerBackup(restoredCustomer,{output:join(out,'backups','customer-3'),expectedRevision:3,expectedEditionSha256:continued.manifestSha256}));
      const analysis=await step('export-analysis-source',{revision:3,edition:continued.manifestSha256},
        ()=>customer.exportSubscriptionCustomer(restoredCustomer,{output:join(out,'analysis-source'),expectedRevision:3,expectedEditionSha256:continued.manifestSha256}));
      const analysisSource=join(analysis.directory,analysis.source.path);
      const analyticalRestore=await step('restore-analysis-customer',{sha256:analysis.source.sha256,directory:join(out,'analytical-customer')},
        ()=>customer.restoreSubscriptionAnalytical({directory:join(out,'analytical-customer'),sourceManifest:analysisSource,expectedSha256:analysis.source.sha256}));
      const analyticalRows=await rows('analytical-customer-three',join(out,'analytical-customer'),{revision:3,consumer:true});
      need(analyticalRestore.rows===after.rows&&same(analyticalRows.items,finalCustomerRows.items),'The original Analysis proof did not reproduce the complete customer.');
      const definitionPath=join(out,'Subscription_Definition.json');
      await write(definitionPath,finalPublisher.definition,{immutable:true});
      const connectionPath=join(out,'Subscription_Connection.json'),exportsDirectory=join(out,'operator-exports');
      await mkdir(exportsDirectory,{recursive:true,mode:0o700});
      const connection={schema:'stellar-forge.odata-subscription-connection.v1',label:input.title,
        publishers:{original:{label:'Publisher before restoration',directory:publisherDirectory},
          publisher:{label:'Continued publisher',directory:restoredPublisher}},
        customers:{original:{label:'Customer before restoration',directory:customerDirectory},
          analyst:{label:'Continued customer',directory:restoredCustomer},
          analytical:{label:'Customer restored from Analysis source',directory:join(out,'analytical-customer')}},
        collections:{before:{label:'First retained source collection',directory:beforeDirectory,sha256:before.manifestSha256},
          after:{label:'Second retained source collection',directory:afterDirectory,sha256:after.manifestSha256}},
        inputs:{baseline:{label:'Baseline edition 1',directory:baseline.directory,kind:'transfer',sha256:baseline.sha256},
          second:{label:'Incremental edition 2',directory:incremental.directory,kind:'transfer',sha256:incremental.sha256},
          continuation:{label:'Continued edition 3',directory:continuation.directory,kind:'transfer',sha256:continuation.sha256},
          'publisher-backup':{label:'Full publisher edition 3',directory:finalPublisherBackup.directory,kind:'publisher-backup',sha256:finalPublisherBackup.sha256},
          'customer-backup':{label:'Full customer edition 3',directory:finalCustomerBackup.directory,kind:'customer-backup',sha256:finalCustomerBackup.sha256},
          analysis:{label:'Complete Analysis source',directory:analysis.directory,kind:'analysis',sha256:analysis.source.sha256}},
        exportsDirectory};
      await write(connectionPath,connection,{immutable:true});
      const finalFiles=await Promise.all([
        [baseline.directory,'transfer.json'],[incremental.directory,'transfer.json'],[continuation.directory,'transfer.json'],
        [publisherBackup.directory,'backup.json'],[customerBackup.directory,'backup.json'],
        [finalPublisherBackup.directory,'backup.json'],[finalCustomerBackup.directory,'backup.json'],
        [analysis.directory,analysis.source.path],[out,'Subscription_Definition.json'],[out,'Subscription_Connection.json']
      ].map(([directory,name])=>identity(join(directory,name))));
      const result={schema:'stellar-forge.odata-subscription-customer-result.v1',state:'COMPLETE',operation_id:input.operationId,
        workspace_transfer_sha256:input.workspaceTransferSha256,archive_sha256:input.archiveSha256??null,
        before:{collection_sha256:before.manifestSha256,rows:before.rows,query:before.query,acquisition:before.acquisition},
        after:{collection_sha256:after.manifestSha256,rows:after.rows,query:after.query,acquisition:after.acquisition},
        shared_fields:fields,source_rows:after.rows,observed_changes:appended.changes,
        definition:finalPublisher.definition,definition_path:definitionPath,definition_sha256:finalPublisher.definitionSha256,
        baseline,baseline_receiving:firstReceive,second_edition:appended,incremental,second_receiving:secondReceive,
        old_transfer_reuse:oldReceive,publisher_backup:publisherBackup,customer_backup:customerBackup,
        publisher_restore:publisherRestore,customer_restore:customerRestore,
        continuation:{meaning:continuationRequest.note,edition:continued,transfer:continuation,receiving:continuedReceive},
        final_publisher:finalPublisher,final_customer:finalCustomer,final_publisher_directory:restoredPublisher,
        final_customer_directory:restoredCustomer,final_publisher_backup:finalPublisherBackup,final_customer_backup:finalCustomerBackup,
        subscription_connection:connectionPath,analysis,analysis_source_manifest:analysisSource,analysis_source_sha256:analysis.source.sha256,
        analytical_restore:analyticalRestore,final_files:finalFiles};
      const resultPath=join(out,'subscription-customer-result.json');
      await write(resultPath,result,{immutable:true});journal.result=await identity(resultPath);
      journal.state='COMPLETE';journal.finished_at=new Date().toISOString();delete journal.error;await save();
      progress('subscription-customer',{state:'COMPLETE',operation_id:input.operationId,rows:after.rows,observed_changes:appended.changes,edition:3});return result;
    }catch(error){
      journal.state='NEEDS_ATTENTION';journal.error={name:error.name,code:error.code??null,message:error.message};await save();throw error;
    }
  });
}
main().catch(error=>{process.stderr.write(JSON.stringify({name:error.name,code:error.code??null,message:error.message})+'\n');process.exitCode=1;});
