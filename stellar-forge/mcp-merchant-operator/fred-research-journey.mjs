#!/usr/bin/env node
// MIT. Complete customer-agent receiving on the original economic Research workspace.
import {readFile,writeFile,mkdir,lstat,open,link,unlink} from 'node:fs/promises';
import {join,resolve,dirname,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {FredWorkspaceClient,readFredWorkspaceConfiguration,saveFredFile,receiveFredWorkspaceFile,
  canonicalFredJSON,FRED_DDP_MAX_PROJECT_BYTES} from './fred-workspace-client.mjs';
import {MerchantFredWorkspaces} from './fred-workspace.mjs';
import {startFredWorkspace} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/workspace.mjs';
import {readFredProject} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/project.mjs';
import {privateDirectory,atomicJson} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/routescan/quota.mjs';

const SCHEMA='stellar-forge.fred-research-agent-journey.v1';
const ALIAS='regional-research';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const equal=(a,b)=>canonicalFredJSON(a)===canonicalFredJSON(b);
function need(ok,message){if(!ok)throw Object.assign(new Error(message),{code:'RESEARCH_AGENT_RECEIVING_INVALID'});}
function requestId(operation,name){return 'research-agent-'+hash(Buffer.from(operation+'\n'+name)).slice(0,64);}
function safeName(value){return hash(Buffer.from(typeof value==='string'?value:canonicalFredJSON(value))).slice(0,24);}
async function optional(file){try{return JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function original(file,{bytes,sha256}={},maximum=FRED_DDP_MAX_PROJECT_BYTES){
  file=resolve(file);const stat=await lstat(file);
  need(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=maximum,'Use a complete ordinary original file: '+file);
  const body=await readFile(file);
  need(bytes===undefined||body.length===bytes,'Original byte count differs: '+file);
  need(sha256===undefined||hash(body)===sha256,'Original SHA256 differs: '+file);
  return body;
}
async function exactFile(file,bytes){
  const temporary=join(dirname(file),'.'+safeName(file)+'.'+randomUUID());
  let fd;try{fd=await open(temporary,'wx',0o600);await fd.writeFile(bytes);await fd.sync();await fd.close();fd=null;
    try{await link(temporary,file);}catch(error){if(error.code!=='EEXIST')throw error;
      const old=await original(file);need(old.equals(bytes),'The retained complete output changed: '+file);}
  }finally{await fd?.close();await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  return {path:file,bytes:bytes.length,sha256:hash(bytes)};
}
async function exactJSON(file,value){return exactFile(file,Buffer.from(JSON.stringify(value,null,2)+'\n'));}
function quantitative(state){
  const {research,operations,revision,...retained}=state;
  return retained;
}
function originalSource(inputFile,source){
  need(typeof source.file==='string'&&source.file.length>0&&!isAbsolute(source.file),'Retain the original relative source filename.');
  const base=dirname(resolve(inputFile)),path=resolve(base,source.file),rel=relative(base,path);
  need(rel!==''&&rel!=='..'&&!rel.startsWith('../')&&!rel.startsWith('..\\\\')&&!isAbsolute(rel),'Original source must remain under its retained input directory.');
  // Reject traversal on either host convention before following a provider-supplied input.
  need(!source.file.replace(/\\/g,'/').split('/').some(part=>part==='..'||part==='.'),'Original source filename contains traversal.');
  return path;
}
async function startAttachment(project,directory,inputs,fetchImpl=globalThis.fetch){
  const state=await readFredProject(project);
  const host=await startFredWorkspace({directory:project});let owner,client;
  try{
    const privateRoot=await privateDirectory(join(directory,'connection'));
    await atomicJson(privateRoot,'startup.json',{schema:'stellar-forge.fred-workspace-startup.v1',projectId:state.id,url:host.url});
    await atomicJson(privateRoot,'workspaces.json',{schema:'stellar-forge.fred-workspace-connection.v1',workspaces:{
      [ALIAS]:{label:'Original regional Research workspace',projectId:state.id,
        consoleUrlFile:'./startup.json',inputs,maxDdpResponseBytes:FRED_DDP_MAX_PROJECT_BYTES}
    }});
    const config=await readFredWorkspaceConfiguration(join(privateRoot,'workspaces.json'));
    const exportsDirectory=await privateDirectory(join(directory,'provider-files'));
    owner=new MerchantFredWorkspaces({fredWorkspaces:config,exportsDirectory},{fetchImpl});
    client=new FredWorkspaceClient(config.workspaces[ALIAS],{fetchImpl});
    need((await client.state()).project.id===state.id,'Attach to the exact original project.');
    return {host,owner,client,definition:config.workspaces[ALIAS],privateRoot,
      async close(){await this.owner.close();this.client.close();await host.close();}};
  }catch(error){await owner?.close();client?.close();await host.close();throw error;}
}
async function pages(owner,name,input,directory,{key='items',asOf,revision,projectId,limit=50}={}){
  let offset=0,total=null,currentId;const values=[],files=[];
  for(;;){
    const args={workspace:ALIAS,...input,offset,limit,expectedRevision:revision,...(asOf?{asOf}:{})};
    const page=await owner.call(name,args);
    need(page.projectId===projectId&&page.revision===revision,'Research pages changed project or revision.');
    need(page.offset===offset&&Array.isArray(page[key])&&Number.isSafeInteger(page.total),'Incomplete Research page.');
    if(total===null){total=page.total;currentId=page.currentId;}
    need(page.currentId===currentId,'Research selected definition changed across pages.');need(page.total===total,'Research collection changed during pagination.');
    if(asOf)need(page.asOf===asOf,'Research coverage timestamp changed across pages.');
    need(page[key].length===page.returned&&offset+page.returned<=total,'Research page count is inconsistent.');
    files.push(await exactJSON(join(directory,name+'-'+safeName(input)+'-'+offset+'.json'),page));
    values.push(...page[key]);
    if(page.nextOffset===null){need(values.length===total,'Research pagination ended early.');break;}
    need(page.nextOffset===offset+page.returned&&page.nextOffset>offset,'Research page did not advance.');
    offset=page.nextOffset;
  }
  return {values,total,files,...(currentId===undefined?{}:{currentId})};
}
async function inventory(attachment,directory,asOf){
  directory=await privateDirectory(directory);const {owner,client}=attachment;
  const state=(await client.state()).project,binding={projectId:state.id,revision:state.revision};
  const result={...binding,asOf,catalogue:[],taxonomy:{},entries:[],products:[],files:[]};
  const catalogue=await pages(owner,'merchant_fred_research_catalogue',{},directory,
    {...binding,asOf,key:'rows',limit:1});result.catalogue=catalogue.values;result.files.push(...catalogue.files);
  for(const section of ['topics','geographies']){
    const value=await pages(owner,'merchant_fred_research_taxonomy',{section},directory,binding);
    result.taxonomy[section]=value.values;result.files.push(...value.files);
  }
  for(const row of result.catalogue){
    const entry={entryId:row.entryId};
    for(const section of ['versions','sources','reviews']){
      const value=await pages(owner,'merchant_fred_research_entry',{entryId:row.entryId,section},directory,{...binding,asOf});
      entry[section]=value.values;entry.currentId=value.currentId;result.files.push(...value.files);
    }
    result.entries.push(entry);
  }
  const products=await pages(owner,'merchant_fred_research_products',{},directory,binding);
  result.files.push(...products.files);
  for(const row of products.values){
    const product={...row};
    for(const section of ['versions','editions','requirements','coverage']){
      const value=await pages(owner,'merchant_fred_research_product',{productId:row.productId,section},directory,{...binding,asOf});
      product[section]=value.values;result.files.push(...value.files);
    }
    result.products.push(product);
  }
  need((await client.state()).project.revision===state.revision,'The Research inventory changed before its last page.');
  await exactJSON(join(directory,'inventory.json'),result);return result;
}
async function downloadInventory(attachment,view,directory){
  directory=await privateDirectory(directory);const selections=[
    {kind:'research-catalogue',expectedRevision:view.revision},
    ...view.entries.map(entry=>({kind:'research-entry',entryId:entry.entryId,expectedRevision:view.revision})),
    ...view.products.map(product=>({kind:'research-product',productId:product.productId,expectedRevision:view.revision})),
    ...view.products.flatMap(product=>product.editions.map(edition=>({kind:'research-product',
      productId:product.productId,editionId:edition.id,expectedRevision:view.revision})))
  ];
  const sources=new Map();
  for(const entry of view.entries)for(const source of entry.sources)sources.set(source.id,source);
  for(const source of sources.values())selections.push({kind:'research-source',snapshotId:source.id,expectedRevision:view.revision});
  const files=[];
  for(const selection of selections){
    const filename=selection.kind+'-'+safeName(selection)+
      (selection.kind==='research-catalogue'?'.csv':selection.kind==='research-source'?'.original':'.json');
    const expected=selection.kind==='research-source'?sources.get(selection.snapshotId):null;
    const result=await saveFredFile(attachment.client,selection,join(directory,filename),
      expected?{expectedSha256:expected.sha256}:{});
    if(expected)need(result.bytes===expected.bytes&&result.sha256===expected.sha256,'Original Research source download differs.');
    const {reused,...identity}=result;files.push({selection,...identity});
  }
  need((await attachment.client.state()).project.revision===view.revision,'Complete downloads changed project revision.');
  await exactJSON(join(directory,'files.json'),files);return files;
}
function selectedView(view){
  const {files,...selected}=view;return selected;
}
function fileIdentity(files){
  return files.map(({selection,bytes,sha256,name,type,projectId})=>({selection,bytes,sha256,name,type,projectId}));
}

/**
 * Caller owns the original ESI controller lease for the duration of this operation.
 * The CLI obtains an independent local course lease using the installed flock binary.
 */
export async function runFredResearchJourney({directory,researchDirectory,inputFile}){
  directory=await privateDirectory(resolve(directory));researchDirectory=resolve(researchDirectory);inputFile=resolve(inputFile);
  const inputBytes=await original(inputFile,{},2*1024*1024),input=JSON.parse(inputBytes);
  need(input.schema==='stellar-forge.research-native-input.v1'&&Array.isArray(input.sources)&&input.sources.length>=2,
    'Select the complete original Research programme input.');
  const previous=await optional(join(researchDirectory,'journey.json'));
  need(previous?.status==='COMPLETE'&&previous.identity.operation===input.operation&&
    previous.identity.inputSha256===hash(inputBytes),'Continue the completed original Research programme and exact input.');
  const project=join(researchDirectory,'project'),initial=await readFredProject(project);
  need(initial.research&&initial.qcew,'Continue the same completed Research and county-report project.');
  const identity={operation:input.operation,projectId:initial.id,inputSha256:hash(inputBytes),
    researchDirectory,sourceJournalSha256:hash(await original(join(researchDirectory,'journey.json')))};
  let journal=await optional(join(directory,'journey.json'));
  if(journal)need(journal.schema===SCHEMA&&equal(journal.identity,identity),'Continue this exact original agent course.');
  else journal={schema:SCHEMA,identity,startedAt:new Date().toISOString(),asOf:new Date().toISOString(),
    status:'RUNNING',steps:[],requests:[],fault:{name:'first-original-source-upload',status:'ARMED'}};
  if(journal.status==='COMPLETE'){
    const saved=journal.steps.find(item=>item.name==='download_complete_original_project'&&item.status==='COMPLETE')?.result;
    need(saved,'The completed original course has no retained complete project.');
    await original(saved.path,{bytes:saved.bytes,sha256:saved.sha256});
    await original(join(directory,'received-complete-economic-project.json'),{bytes:saved.bytes,sha256:saved.sha256});
    return journal;
  }
  const checkpoint=()=>atomicJson(directory,'journey.json',journal);
  await checkpoint();const actions=await privateDirectory(join(directory,'requests'));
  const inputs={};
  for(let index=0;index<input.sources.length;index++){
    const source=input.sources[index],path=originalSource(inputFile,source),bytes=await original(path,source,16*1024*1024);
    inputs['source-'+index]={kind:'research-source',path,label:source.filename,sha256:hash(bytes)};
  }
  let attachment=null;
  const step=async(name,work)=>{
    const saved=journal.steps.find(item=>item.name===name&&item.status==='COMPLETE');
    if(saved)return saved.result;
    const startedAt=new Date().toISOString();
    try{const result=await work();journal.steps.push({name,status:'COMPLETE',startedAt,completedAt:new Date().toISOString(),result});
      delete journal.lastError;await checkpoint();console.log(JSON.stringify({event:'research_agent_step',name,result}));return result;}
    catch(error){journal.status='INTERRUPTED';journal.lastError={name,at:new Date().toISOString(),code:error.code??'ERROR',message:error.message};
      await checkpoint();throw error;}
  };
  const actualFetch=async(url,options)=>{
    const response=await fetch(url,options);
    let body;try{body=typeof options?.body==='string'?JSON.parse(options.body):null;}catch{}
    if(journal.fault.status==='ARMED'&&body?.id===journal.fault.requestId&&
       options?.method==='POST'&&new URL(url).pathname==='/api/action'&&response.ok){
      const bytes=Buffer.from(await response.arrayBuffer());
      journal.fault={...journal.fault,status:'RETURN_WITHHELD',responseBytes:bytes.length,
        responseSha256:hash(bytes),observedAt:new Date().toISOString()};
      await checkpoint();
      throw Object.assign(new Error('The actual committed source-upload return was withheld by this receiving course.'),
        {code:'RESEARCH_AGENT_RETURN_WITHHELD'});
    }
    return response;
  };
  const reopen=async()=>{
    if(attachment){await attachment.owner.close();attachment.client.close();
      const config=await readFredWorkspaceConfiguration(join(attachment.privateRoot,'workspaces.json'));
      attachment.owner=new MerchantFredWorkspaces({fredWorkspaces:config,
        exportsDirectory:await privateDirectory(join(directory,'original','provider-files'))},{fetchImpl:actualFetch});
      attachment.client=new FredWorkspaceClient(config.workspaces[ALIAS],{fetchImpl:actualFetch});
    }
  };
  const mutate=async(name,tool,action,body,{withhold=false}={})=>{
    const filename=join(actions,name+'.json');let retained=await optional(filename);
    if(retained)need(retained.tool===tool&&retained.action===action&&equal(retained.body,body),'Original agent request input changed: '+name);
    else{
      const current=(await attachment.client.state()).project;
      retained={schema:'stellar-forge.research-agent-request.v1',tool,action,body,
        args:{workspace:ALIAS,id:requestId(input.operation,name),expectedRevision:current.revision,...body}};
      await atomicJson(actions,name+'.json',retained,{exclusive:true});
      journal.requests.push({name,id:retained.args.id,tool,action,file:filename});await checkpoint();
    }
    if(withhold&&!journal.fault.requestId){journal.fault.requestId=retained.args.id;await checkpoint();}
    if(!journal.requests.some(item=>item.id===retained.args.id)){
      journal.requests.push({name,id:retained.args.id,tool,action,file:filename});await checkpoint();
    }
    const observed=await attachment.client.operation(retained.args.id);
    if(withhold&&observed.operation&&journal.fault.status==='ARMED'){
      journal.fault={...journal.fault,status:'HISTORY_RECOVERED',operationId:retained.args.id,
        observedAt:new Date().toISOString()};await checkpoint();
    }
    let result;
    try{
      if(observed.pending){
        result=await attachment.owner.call('merchant_fred_research_resume',{workspace:ALIAS,id:retained.args.id,
          expectedRevision:retained.args.expectedRevision,action});
      }else result=await attachment.owner.call(tool,retained.args);
    }catch(error){
      await reopen();
      const recovered=await attachment.client.operation(retained.args.id);
      if(!recovered.operation&&!recovered.pending)throw error;
      result=recovered.pending
        ?await attachment.owner.call('merchant_fred_research_resume',{workspace:ALIAS,id:retained.args.id,
          expectedRevision:retained.args.expectedRevision,action})
        :await attachment.owner.call(tool,retained.args);
    }
    const final=await attachment.client.operation(retained.args.id);
    need(final.operation&&!final.pending,'The original agent request did not settle in project history.');
    return {id:retained.args.id,expectedRevision:retained.args.expectedRevision,result,operation:final.operation,revision:final.revision};
  };
  try{
    await step('retain_original_project',async()=>{
      const file=await exactJSON(join(directory,'original-project-state.json'),initial);
      return {projectId:initial.id,revision:initial.revision,quantitativeSha256:hash(Buffer.from(canonicalFredJSON(quantitative(initial)))),
        operationIds:initial.operations.map(item=>item.id),file};
    });
    attachment=await startAttachment(project,await privateDirectory(join(directory,'original')),inputs,actualFetch);
    const before=await step('read_complete_original_catalogue',()=>inventory(attachment,join(directory,'before'),journal.asOf));
    await step('download_original_catalogue_and_products',()=>downloadInventory(attachment,before,join(directory,'before-files')));
    const csvRecord=await saveFredFile(attachment.client,{kind:'research-catalogue'},
      join(directory,'original-catalogue.csv'));
    inputs.catalogue={kind:'research-catalogue',path:csvRecord.path,label:'Complete original Research catalogue',sha256:csvRecord.sha256};
    await atomicJson(attachment.privateRoot,'workspaces.json',{schema:'stellar-forge.fred-workspace-connection.v1',workspaces:{
      [ALIAS]:{label:'Original regional Research workspace',projectId:identity.projectId,
        consoleUrlFile:'./startup.json',inputs,maxDdpResponseBytes:FRED_DDP_MAX_PROJECT_BYTES}
    }});
    await reopen();
    await step('inspect_original_host_inputs',async()=>{
      const result=[];for(const name of Object.keys(inputs))result.push(await attachment.owner.call('merchant_fred_input_inspect',{workspace:ALIAS,input:name}));
      return result;
    });
    await step('save_original_entry_definition',async()=>{
      const entry=before.entries.find(item=>item.entryId===input.sources[0].definition.entryId);
      need(entry,'The original source is absent from the current catalogue.');
      const version=entry.versions.find(item=>item.id===entry.currentId);
      need(version?.definition,'The complete original entry definition is absent.');
      return mutate('entry-definition','merchant_fred_research_entry_save','research-entry-save',{definition:version.definition});
    });
    await step('import_complete_original_csv',()=>mutate('catalogue-import','merchant_fred_research_import','research-import',
      {input:'catalogue',expectedSha256:csvRecord.sha256}));
    for(let index=0;index<input.sources.length;index++){
      const source=input.sources[index],entryId=source.definition.entryId;
      await step('upload_original_'+index,async()=>{
        const entry=await attachment.owner.call('merchant_fred_research_entry',{workspace:ALIAS,entryId,section:'versions'});
        return mutate('source-upload-'+index,'merchant_fred_research_source_upload','research-source-upload',
          {input:'source-'+index,expectedSha256:inputs['source-'+index].sha256,entryId,definitionId:entry.currentId,
            filename:source.filename,contentType:source.contentType,...(source.retrievedAt?{retrievedAt:source.retrievedAt}:{})},
          {withhold:index===0});
      });
      await step('review_original_'+index,async()=>{
        const entry=await attachment.owner.call('merchant_fred_research_entry',{workspace:ALIAS,entryId,section:'sources'});
        need(entry.current?.sourceId,'The original source upload has no retained identity.');
        return mutate('source-review-'+index,'merchant_fred_research_review','research-review',
          {snapshotId:entry.current.sourceId,decision:'ACCEPT',reviewer:input.reviewer,note:source.reviewNote});
      });
    }
    await step('save_current_research_product',async()=>{
      const product=before.products.find(item=>item.productId===input.product.productId);
      need(product,'The original Research product is absent.');
      const version=product.versions.find(item=>item.id===product.currentId);
      need(version?.definition,'The complete original product definition is absent.');
      return mutate('product-definition','merchant_fred_research_product_save','research-product-save',{definition:version.definition});
    });
    await step('issue_agent_received_product',()=>mutate('product-issue','merchant_fred_research_product_issue','research-product-issue',
      {productId:input.product.productId,issuedBy:input.reviewer,
        note:'Customer-agent receiving of the retained original catalogue and sources; original prior product editions remain available.'}));
    await step('recover_same_original_upload',async()=>{
      const saved=await optional(join(actions,'source-upload-0.json'));
      await reopen();const beforeRevision=(await attachment.client.state()).project.revision;
      const replay=await attachment.owner.call(saved.tool,saved.args);
      need(replay.replayed===true&&(await attachment.client.state()).project.revision===beforeRevision,
        'The original completed source upload must replay without another mutation.');
      need(['RETURN_WITHHELD','HISTORY_RECOVERED'].includes(journal.fault.status),
        'Retain either the observed withheld response or the actual earlier committed operation.');
      return {id:saved.args.id,revision:beforeRevision,replayed:true,withheldReturn:journal.fault};
    });
    if(!journal.afterAsOf){journal.afterAsOf=new Date().toISOString();await checkpoint();}
    const after=await step('read_complete_received_catalogue',()=>inventory(attachment,join(directory,'after'),journal.afterAsOf));
    await step('locate_original_source_by_taxonomy',async()=>{
      const {expectedEntryId,...filters}=input.search;
      const result=await pages(attachment.owner,'merchant_fred_research_catalogue',filters,
        await privateDirectory(join(directory,'search')),{projectId:after.projectId,revision:after.revision,
          asOf:journal.afterAsOf,key:'rows',limit:1});
      need(result.values.some(row=>row.entryId===expectedEntryId),'The original source was lost from its declared taxonomy.');
      return {filters,expectedEntryId,total:result.total,files:result.files};
    });
    const files=await step('download_all_retained_research_files',()=>downloadInventory(attachment,after,join(directory,'after-files')));
    await step('receive_retained_provider_chunks',async()=>{
      const selected=files.find(item=>item.selection.kind==='research-source');
      need(selected,'Select a complete retained Research source.');
      const previous=await optional(join(directory,'provider-chunk-receiving.json'));
      if(previous){
        need(equal(previous.selection,selected.selection)&&previous.output.sha256===selected.sha256&&
          previous.output.bytes===selected.bytes,'The original retained-chunk selection changed.');
        const bytes=await original(previous.output.path,{bytes:selected.bytes,sha256:selected.sha256});
        let end=0;for(const part of previous.receipts){
          need(part.offset===end&&part.bytes>0&&hash(bytes.subarray(end,end+part.bytes))===part.sha256,
            'The retained complete chunk receipt changed.');
          end+=part.bytes;need(part.nextOffset===(end<bytes.length?end:null),'The retained chunk offsets changed.');
        }
        need(end===bytes.length,'The retained chunk receipt is incomplete.');return previous;
      }
      let offset=0,readId=null,reopened=false;const chunks=[],receipts=[];
      for(;;){
        const part=await attachment.owner.call('merchant_fred_file_read',{workspace:ALIAS,
          ...selected.selection,expectedSha256:selected.sha256,offset,limit:4096,...(readId?{readId}:{})});
        const bytes=Buffer.from(part.data??'','base64');
        need(part.encoding==='base64'&&part.offset===offset&&bytes.length===part.bytesRead&&
          bytes.toString('base64')===part.data&&part.file?.sha256===selected.sha256&&
          part.file.bytes===selected.bytes,'The original retained chunk or file identity changed.');
        chunks.push(bytes);receipts.push({readId:part.readId,offset,bytes:bytes.length,
          nextOffset:part.nextOffset,sha256:hash(bytes)});
        offset+=bytes.length;
        if(part.nextOffset===null){need(offset===selected.bytes,'The retained source ended early.');break;}
        need(part.nextOffset===offset&&bytes.length>0,'The retained byte offset did not advance.');
        if(!reopened){
          // Read IDs belong to this owner lifetime. The same SHA and next byte
          // offset reopen the original file after the actual client closes.
          await reopen();readId=null;reopened=true;
        }else readId=part.readId;
      }
      const bytes=Buffer.concat(chunks);
      need(hash(bytes)===selected.sha256,'The complete reassembled original source changed.');
      const output=await exactFile(join(directory,'provider-chunk-original-source.bin'),bytes);
      const result={selection:selected.selection,output,reopened,receipts};
      await exactJSON(join(directory,'provider-chunk-receiving.json'),result);return result;
    });
    await step('preserve_original_economic_editions',async()=>{
      const originalState=JSON.parse(await readFile(join(directory,'original-project-state.json'),'utf8'));
      const current=(await attachment.client.state()).project;
      need(equal(quantitative(originalState),quantitative(current)),'An original quantitative project member changed during Research operation.');
      need(originalState.operations.every((item,index)=>equal(item,current.operations[index])),'Original economic operation history changed.');
      for(const product of before.products){
        const received=after.products.find(item=>item.productId===product.productId);
        need(received&&product.editions.every(item=>received.editions.some(other=>equal(item,other))),
          'An original Research product edition changed.');
      }
      return {projectId:current.id,revision:current.revision,originalOperationCount:originalState.operations.length,
        preservedOriginalProductEditions:before.products.reduce((count,item)=>count+item.editions.length,0)};
    });
    const complete=await step('download_complete_original_project',async()=>{
      const result=await saveFredFile(attachment.client,{kind:'project'},join(directory,'complete-economic-project.json'));
      need(result.bundle?.schema==='stellar-forge.fred-project-bundle.v7'||result.bundle?.version===7,
        'The complete Research project must retain original version7.');
      return result;
    });
    await step('close_and_reconnect_original_provider',async()=>{
      await attachment.owner.close();
      need((await attachment.client.state()).project.id===identity.projectId,'Closing the borrowed provider stopped the original workspace.');
      await reopen();const view=await inventory(attachment,join(directory,'reopened'),journal.afterAsOf);
      need(equal(selectedView(view),selectedView(after)),'The reopened provider lost original Research records.');
      return {projectId:view.projectId,revision:view.revision,entries:view.entries.length,products:view.products.length};
    });
    await attachment.close();attachment=null;
    await step('independent_complete_project_receiving',async()=>{
      const target=join(directory,'received-project');
      const receipt=await receiveFredWorkspaceFile(complete.path,target,{expectedSha256:complete.sha256});
      const receiptFile=join(directory,'receiving-receipt.json'),retained=await optional(receiptFile);
      if(retained){
        const identity=value=>{const {reused,...received}=value.received;return {...value,received};};
        need(equal(identity(retained),identity(receipt)),'The original complete receiving receipt changed.');
        return retained;
      }
      await exactJSON(receiptFile,receipt);return receipt;
    });
    attachment=await startAttachment(join(directory,'received-project'),
      await privateDirectory(join(directory,'received')),inputs);
    await step('open_independent_received_agent',async()=>{
      const view=await inventory(attachment,join(directory,'received-catalogue'),journal.afterAsOf);
      need(equal(selectedView(view),selectedView(after)),'Complete receiving changed original Research state.');
      const receivedFiles=await downloadInventory(attachment,view,join(directory,'received-files'));
      need(equal(fileIdentity(receivedFiles),fileIdentity(files)),'Independent receiving changed a complete source or product download.');
      const saved=await optional(join(actions,'source-upload-0.json'));
      const revision=(await attachment.client.state()).project.revision;
      const replay=await attachment.owner.call(saved.tool,saved.args);
      need(replay.replayed===true&&(await attachment.client.state()).project.revision===revision,
        'The original source upload failed to replay after complete independent receiving.');
      const reopened=await saveFredFile(attachment.client,{kind:'project'},join(directory,'received-complete-economic-project.json'),
        {expectedSha256:complete.sha256});
      return {projectId:view.projectId,revision,files:receivedFiles.length,replayedId:saved.args.id,completeProject:reopened};
    });
    journal.status='COMPLETE';journal.completedAt=new Date().toISOString();delete journal.lastError;await checkpoint();
    return journal;
  }finally{await attachment?.close();}
}

async function main(){
  const options={};for(let index=2;index<process.argv.length;index+=2){
    const key=process.argv[index];need(['--directory','--research-directory','--input','--lease-held','--controller-lock-fd'].includes(key)&&process.argv[index+1],
      'Use --directory, --research-directory and --input with complete existing paths.');
    need(options[key]===undefined,'Select each named option once.');options[key]=process.argv[index+1];
  }
  for(const key of ['--directory','--research-directory','--input'])need(options[key],'Supply '+key+'.');
  const directory=await privateDirectory(resolve(options['--directory']));
  if(options['--lease-held']===undefined){
    const lock=join(directory,'operation.lock'),fd=await open(lock,'a',0o600);
    await fd.close();const info=await lstat(lock);
    need(info.isFile()&&!info.isSymbolicLink(),'Use the original ordinary course lock file.');
    const args=['-n','-E','73',lock,process.execPath,resolve(process.argv[1]),
      ...process.argv.slice(2),'--lease-held','1'];
    const stdio=['inherit','inherit','inherit'];
    if(options['--controller-lock-fd']!==undefined){
      const inherited=Number(options['--controller-lock-fd']);
      need(Number.isInteger(inherited)&&inherited>=3&&inherited<=1024,'Keep the original controller lock descriptor.');
      while(stdio.length<=inherited)stdio.push('ignore');stdio[inherited]=inherited;
    }
    const child=spawn('flock',args,{stdio});
    const code=await new Promise((resolve,reject)=>{child.once('error',reject);
      child.once('exit',(code,signal)=>signal?reject(new Error('Course interrupted by '+signal)):resolve(code));});
    need(code!==73,'The same original agent course already has an active operator.');
    process.exitCode=code??1;return;
  }
  need(options['--lease-held']==='1','Use the original inherited course lease.');
  // The installed flock process retains the course lease until this child exits.
  const result=await runFredResearchJourney({directory,researchDirectory:options['--research-directory'],inputFile:options['--input']});
  console.log(JSON.stringify({status:result.status,operation:result.identity.operation,directory,steps:result.steps.length}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(error=>{console.error(JSON.stringify({code:error.code??'ERROR',message:error.message}));process.exitCode=1;});
}
