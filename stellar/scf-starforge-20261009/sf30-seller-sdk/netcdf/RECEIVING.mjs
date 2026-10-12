// MIT. Whole original customer programme through retained SDK, Merchant and Applications.
import {readFile,writeFile,mkdir,open,rename} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,resolve,basename} from 'node:path';
import {NetCDFWorkspaceClient,readNetCDFConfiguration,digestFile,need} from './client.mjs';
import {MerchantNetCDFWorkspaces} from './mcp.mjs';
import {netCDFTools} from './mcp-tools.mjs';
import application,{netCDFApplicationStartup,readWorkspaceBinding} from './application-provider.mjs';

const input=JSON.parse(await readFile(process.argv[2],'utf8'));
const directory=resolve(input.directory),resultFile=join(directory,'customer-result.json');
await mkdir(directory,{recursive:true,mode:0o700});
const inputSha=createHash('sha256').update(JSON.stringify(input)).digest('hex');
let record;
try{record=JSON.parse(await readFile(resultFile,'utf8'));need(record.input_sha256===inputSha,'NETCDF_PROGRAMME_INPUT_CHANGED');}
catch(error){if(error.code!=='ENOENT')throw error;record={schema:'stellar-forge.netcdf-customer-programme.v1',operation_id:input.operation_id,input_sha256:inputSha,state:'operating',steps:{}};}
async function persist(){const path=resultFile+'.partial',file=await open(path,'w',0o600);try{await file.writeFile(JSON.stringify(record,null,2));await file.sync();}finally{await file.close();}await rename(path,resultFile);}
async function step(name,parameters,operate){
  const existing=record.steps[name];
  if(existing?.state==='complete')return existing.result;
  const selected=existing?.parameters??parameters;
  record.steps[name]={state:'operating',parameters:selected};await persist();
  const result=await operate(selected);record.steps[name]={state:'complete',parameters:selected,result};await persist();
  process.stdout.write(JSON.stringify({phase:name,state:'complete'})+'\n');return result;
}
const client=new NetCDFWorkspaceClient({directory:input.workspace,python:input.python});
let customer,merchant,receiver,child;
try{
  const binding=await client.binding();record.binding=binding;record.native_process_id=client.processId;await persist();
  const source=await step('complete-original-source',{
    path:input.input_file,name:'Sig1000_tidal.nc',reference:input.reference,expected_sha:input.input_sha256,request_id:'mhkit-native-source-20261012',
  },value=>client.importFile(value.path,Object.fromEntries(Object.entries(value).filter(([key])=>key!=='path'))));
  const variables=await step('complete-source-catalog',{},async()=>{
    const values=[];for await(const variable of client.allVariables(source.id,{pageSize:7}))values.push(variable);
    need(values.length===50&&values.some(value=>value.path==='/vel'),'NETCDF_ORIGINAL_CATALOG_CHANGED');
    const path=join(directory,'source-catalog.json');await writeFile(path,JSON.stringify(values,null,2),{mode:0o600});
    return {variables:values.length,path,...await digestFile(path)};
  });
  const original=await step('complete-original-bytes',{},()=>client.copyObject(source.sha256,join(directory,'Sig1000_tidal.nc')));
  need(original.sha256===input.input_sha256,'NETCDF_ORIGINAL_SOURCE_CHANGED');
  const slices={time:{start:5,stop:25,step:2}};
  const selection=await step('saved-native-selection',{
    title:'MHKiT Signature1000 — original burst selection',source_id:source.id,variables:[{path:'/vel',slices}],decode_cf:true,include_coordinates:true,
    expected_revision:(await client.overview()).project.revision,request_id:'609f-adcp-original-selection',
  },value=>client.saveSelection(value));
  const run=await step('complete-native-result',{selection_id:selection.id,request_id:'609f-adcp-original-run'},value=>client.run(value.selection_id,{request_id:value.request_id}));
  need(run.cells===1162&&run.files.length===5,'NETCDF_ORIGINAL_RESULT_CHANGED');
  await step('retained-native-recovery',{selection_id:selection.id,request_id:'609f-adcp-original-run'},async value=>{
    const replay=await client.run(value.selection_id,{request_id:value.request_id});
    need(JSON.stringify(replay)===JSON.stringify(run),'NETCDF_ORIGINAL_REQUEST_CHANGED');return {run_id:replay.id,files:replay.files};
  });
  const preview=await step('complete-selected-preview',{},async()=>{
    const rows=[];for await(const row of client.previewRows(source.id,'/vel',{slices,decode_cf:true,pageSize:113}))rows.push(row);
    need(rows.length===1120,'NETCDF_PREVIEW_POPULATION_CHANGED');
    const path=join(directory,'complete-selected-preview.json');await writeFile(path,JSON.stringify(rows),{mode:0o600});
    return {rows:rows.length,path,...await digestFile(path)};
  });
  const primaryFiles=await step('complete-native-files',{},async()=>{
    const out=join(directory,'native-result');await mkdir(out,{recursive:true,mode:0o700});const files=[];
    for(const file of run.files){need(basename(file.name)===file.name,'NETCDF_RESULT_FILENAME_INVALID');files.push({...file,...await client.copyObject(file.sha256,join(out,file.name),{pageBytes:65536})});}
    return {files};
  });
  const review=await step('saved-original-review',{
    run_id:run.id,decision:'accepted',reviewer:'Original native customer programme',
    notes:'All original burst indices, native types and source metadata are retained with the selected coordinate variables and complete value files.',
    expected_revision:(await client.overview()).project.revision,request_id:'609f-adcp-original-review',
  },value=>client.saveReview(value));
  const transfer=await step('complete-original-project',{},async()=>{
    const archive=await client.exportProject();return {...archive,...await client.copyObject(archive.sha256,join(directory,'NetCDF_Original_Project.zip'))};
  });
  const received=await step('independent-original-receiving',{},()=>client.receiveProject(transfer.path,join(directory,'customer'),transfer.sha256));
  need(received.binding.project_id===binding.project_id,'NETCDF_RECEIVED_PROJECT_CHANGED');
  customer=new NetCDFWorkspaceClient({directory:received.directory,python:input.python});
  await step('reopened-source-and-history',{},async()=>{
    const state=await customer.overview();need(state.project.id===binding.project_id&&state.sources.some(value=>value.sha256===source.sha256)&&state.selections.some(value=>value.id===selection.id)&&state.runs.some(value=>value.id===run.id)&&state.reviews.some(value=>value.id===review.id),'NETCDF_RECEIVED_HISTORY_CHANGED');
    return {project_id:state.project.id,sources:state.sources.length,selections:state.selections.length,runs:state.runs.length,reviews:state.reviews.length};
  });
  const customerSelection=await step('independent-customer-edit',{
    title:'Customer retained ADCP selection — first four alternate samples',source_id:source.id,
    variables:[{path:'/vel',slices:{dir:{start:0,stop:2,step:1},range:{start:2,stop:14,step:3},time:{start:0,stop:8,step:2}}}],
    decode_cf:false,include_coordinates:true,expected_revision:(await customer.overview()).project.revision,request_id:'609f-adcp-customer-selection',
  },value=>customer.saveSelection(value));
  const customerRun=await step('complete-customer-result',{selection_id:customerSelection.id,request_id:'609f-adcp-customer-run'},value=>customer.run(value.selection_id,{request_id:value.request_id}));
  need(customerRun.cells===42&&customerRun.files.length===5,'NETCDF_CUSTOMER_RESULT_CHANGED');
  await step('complete-customer-result-files',{},async()=>{
    const out=join(directory,'customer-result');await mkdir(out,{recursive:true,mode:0o700});const files=[];
    for(const file of customerRun.files)files.push({...file,...await customer.copyObject(file.sha256,join(out,file.name))});return {files};
  });
  await step('saved-customer-review',{
    run_id:customerRun.id,decision:'accepted',reviewer:'Independent receiving customer',notes:'The narrower explicit index selection preserves the full original source and prior accepted burst edition.',
    expected_revision:(await customer.overview()).project.revision,request_id:'609f-adcp-customer-review',
  },value=>customer.saveReview(value));
  const customerTransfer=await step('complete-customer-handover',{},async()=>{
    const archive=await customer.exportProject();return {...archive,...await customer.copyObject(archive.sha256,join(directory,'NetCDF_Customer_Edited_Project.zip'))};
  });
  const downstream=await step('independent-edited-receiving',{},()=>client.receiveProject(customerTransfer.path,join(directory,'downstream-customer'),customerTransfer.sha256));
  receiver=new NetCDFWorkspaceClient({directory:downstream.directory,python:input.python});
  await step('editable-customer-reopen',{},async()=>{
    const state=await receiver.overview();need(state.project.id===binding.project_id&&state.selections.length===2&&state.runs.length===2&&state.reviews.length===2,'NETCDF_CUSTOMER_HISTORY_CHANGED');
    await receiver.source(source.id);return {project_id:state.project.id,selections:state.selections.length,runs:state.runs.length,reviews:state.reviews.length};
  });
  const configPath=join(directory,'netcdf-connections.json');
  const config={schema:'stellar-forge.netcdf-connections.v1',workspaces:{adcp:{directory:input.workspace,python:input.python,project_id:binding.project_id,sha256:binding.sha256,label:'MHKiT original ADCP programme',
    inputs:{adcp:{path:input.input_file,sha256:input.input_sha256,name:'Sig1000_tidal.nc',reference:input.reference},customer:{path:customerTransfer.path,sha256:customerTransfer.sha256}},
    exportsDirectory:join(directory,'merchant-exports'),receiveRoot:join(directory,'merchant-received')}}};
  await writeFile(configPath,JSON.stringify(config,null,2),{mode:0o600});
  const connection=await readNetCDFConfiguration(configPath);merchant=new MerchantNetCDFWorkspaces({netcdfWorkspaces:connection});
  await step('complete-merchant-workflow',{},async()=>{
    const definitions=netCDFTools((name,description,properties,required,annotations)=>({name,description,properties,required,annotations}));
    need(definitions.length===10,'NETCDF_MERCHANT_CATALOG_CHANGED');
    const listed=await merchant.call('merchant_netcdf_workspaces',{});need(listed.workspaces.length===1,'NETCDF_MERCHANT_WORKSPACE_CHANGED');
    const imported=await merchant.call('merchant_netcdf_import',{workspace:'adcp',id:'609f-merchant-complete-source',input:'adcp',expectedSha256:input.input_sha256});
    need(imported.sha256===source.sha256,'NETCDF_MERCHANT_SOURCE_CHANGED');
    const query=await merchant.call('merchant_netcdf_query',{workspace:'adcp',action:'variables',input:{source_id:imported.id},offset:0,limit:7});need(query.total===50&&query.items.length===7&&query.next_offset===7,'NETCDF_MERCHANT_PAGE_CHANGED');
    const chosen=await merchant.call('merchant_netcdf_selection',{workspace:'adcp',id:'609f-merchant-selection',input:{title:'Merchant retained two-sample ADCP selection',source_id:imported.id,variables:[{path:'/pressure',slices:{time:{start:0,stop:2,step:1}}}],include_coordinates:true,decode_cf:true}});
    const result=await merchant.call('merchant_netcdf_run',{workspace:'adcp',id:'609f-merchant-run',selectionId:chosen.id});
    const decision=await merchant.call('merchant_netcdf_review',{workspace:'adcp',id:'609f-merchant-review',input:{run_id:result.id,decision:'accepted',reviewer:'Merchant receiving operator',notes:'Original pressure and time coordinates retained with complete declared source receiving.'}});
    const report=await merchant.call('merchant_netcdf_report',{workspace:'adcp',runId:result.id});
    const hash=createHash('sha256');let offset=0,bytes=0;
    do{const page=await merchant.call('merchant_netcdf_file_read',{workspace:'adcp',sha256:report.sha256,offset,limit:65536});const part=Buffer.from(page.base64,'base64');hash.update(part);bytes+=part.length;offset=page.next_offset;}while(offset!==null);
    need(hash.digest('hex')===report.sha256&&bytes===report.bytes,'NETCDF_MERCHANT_REPORT_CHANGED');
    const exported=await merchant.call('merchant_netcdf_export',{workspace:'adcp',id:'609f-merchant-full-project'});
    const replay=await merchant.call('merchant_netcdf_export',{workspace:'adcp',id:'609f-merchant-full-project'});need(JSON.stringify(replay)===JSON.stringify(exported),'NETCDF_MERCHANT_EXPORT_CHANGED');
    const delivered=await merchant.call('merchant_netcdf_receive',{workspace:'adcp',input:'customer',expectedSha256:customerTransfer.sha256,name:'original-customer-edition'});
    need(delivered.binding.project_id===binding.project_id,'NETCDF_MERCHANT_RECEIVING_CHANGED');
    return {tools:definitions.map(value=>value.name),source_id:imported.id,selection_id:chosen.id,run_id:result.id,review_id:decision.id,report,report_received_bytes:bytes,export:exported,received:delivered};
  });
  await step('original-applications-listener',{},async()=>{
    const selected=await readWorkspaceBinding(input.workspace),args=['--workspace',input.workspace,'serve','--expected-binding-sha256',selected.sha256,'--port','0'];
    const observation=await new Promise((done,failed)=>{
      child=spawn(input.python,['-B','-u',join(input.source,'cli.py'),...args],{stdio:['ignore','pipe','pipe'],shell:false});
      let buffer='',stderr='';child.stderr.on('data',bytes=>{stderr+=bytes.toString();});child.on('error',failed);
      child.on('close',code=>{if(!buffer.includes('\n'))failed(Error('Original listener exited '+code+': '+stderr));});
      child.stdout.on('data',bytes=>{buffer+=bytes.toString();if(buffer.includes('\n'))done({text:buffer.split('\n')[0],pid:child.pid});});
    });
    const startup=await netCDFApplicationStartup({command:'netcdf',args,inputs:[]},observation.text);
    const catalog=application.catalog({common:[],field:(name,label,type,required,description)=>({name,label,type,required,description})});
    need(startup.workspaceId===binding.project_id&&catalog[0].command==='netcdf','NETCDF_APPLICATION_REOPEN_CHANGED');
    child.kill('SIGINT');await new Promise(done=>child.once('close',done));child=null;
    return {workspace_id:startup.workspaceId,instance_id:startup.original.instanceId,catalog_id:catalog[0].id,listener_pid:observation.pid};
  });
  await merchant.close();merchant=null;await customer.close();customer=null;await receiver.close();receiver=null;
  need(client.processId===record.native_process_id,'NETCDF_RETAINED_CLIENT_CHANGED');
  record.state='complete';record.completed_at=new Date().toISOString();record.summary={original_variables:variables.variables,selected_preview_rows:preview.rows,original_result_cells:run.cells,customer_result_cells:customerRun.cells,original_source_sha256:source.sha256,
    original_project_sha256:transfer.sha256,customer_project_sha256:customerTransfer.sha256,complete_native_files:primaryFiles.files.length,merchant_tools:10,project_id:binding.project_id};
  await persist();process.stdout.write(JSON.stringify({state:'complete',result:resultFile,summary:record.summary})+'\n');
}catch(error){
  record.state='interrupted';record.error={code:error.code??'NETCDF_PROGRAMME_ERROR',message:error.message};await persist();throw error;
}finally{
  if(child){child.kill('SIGINT');await new Promise(done=>child.once('close',done));}
  await merchant?.close();await customer?.close();await receiver?.close();await client.close();
}
