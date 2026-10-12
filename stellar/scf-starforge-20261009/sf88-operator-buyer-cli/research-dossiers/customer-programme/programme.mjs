// MIT. A complete customer Research programme on the existing source-native engines.
import {join,resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {writeJson} from '../../node/store.mjs';
import {withPrivateLock} from '../../../sf30-seller-sdk/routescan/quota.mjs';
import {startDossierWorkspace} from '../server.mjs';
import {ResearchWorkspaceClient} from '../workspace-client.mjs';
import {createSourceBundle} from '../source-bundles.mjs';
import {readCustomerSelection,readEngineSelection} from './selection.mjs';
import {receiveCustomerSources,receiveCustomerCitationReviews,receiveChronologyBundle,preserveUnselected} from './citation.mjs';
import {renderCustomerChronology} from './chronology.mjs';
import {runCustomerEuropePmc} from './europe-pmc.mjs';
import {runCustomerBrowserReceiving,runCustomerMerchantReceiving} from './receiving.mjs';
import {need,absolute,key,member,directory,exists,value,read,retain,retainBytes,checked,descriptor,
  step,same,digest,jsonBytes,section,requireRevision,runProcess,verifyFiles,inside,publicFiles} from './retention.mjs';

const PREFIX='stellar/scf-starforge-20261009/sf88-operator-buyer-cli/';
const HERE=dirname(fileURLToPath(import.meta.url));
const html=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link=(name,label)=>'<a href="'+html(name)+'">'+html(label)+'</a>';
const filePin=item=>({file:item.file??item.path,bytes:item.bytes,sha256:item.sha256});

async function listener(root,name,workspaceDirectory,python){
  const selectedFile=join(root,name+'.listener.private.json');
  const previous=await exists(selectedFile)?await value(selectedFile):null;
  if(previous)need(previous.workspaceDirectory===workspaceDirectory,'CUSTOMER_LISTENER_WORKSPACE_CHANGED');
  const app=await startDossierWorkspace({directory:workspaceDirectory,port:previous?.port??0,
    clinicalTrialsPython:python,extractionPython:python});
  try{
    await retain(selectedFile,{workspaceDirectory,port:Number(new URL(app.origin).port)});
    const client=new ResearchWorkspaceClient({url:app.url,directory:workspaceDirectory,expectedWorkspaceId:app.workspaceId});
    const status=await client.status();
    need(status.workspaceId===app.workspaceId,'CUSTOMER_NATIVE_WORKSPACE_IDENTITY_CHANGED');
    const connectionFile=join(root,name+'.connection.private.json');
    await writeJson(connectionFile,{url:app.url,workspaceId:app.workspaceId,directory:workspaceDirectory});
    return {app,client,connectionFile,workspaceDirectory};
  }catch(error){await app.close();throw error;}
}

async function originalExport(client,id,revision,format,root,name){
  return step(root,'export-'+key(name),async()=>({dossierId:id,revision,format}),async selected=>{
    const target=join(root,key(name)+'.'+format),candidate=join(root,key(name)+'.native.'+format);
    let bytes;
    if(await exists(candidate))bytes=await read(candidate);
    else{
      await client.exportDossier(selected.dossierId,{revision:selected.revision,format:selected.format,file:candidate});
      bytes=await read(candidate);
    }
    if(format==='json.gz')need(bytes[0]===0x1f&&bytes[1]===0x8b,'CUSTOMER_ORIGINAL_PORTABLE_EXPORT_REQUIRED');
    // Download creates the original complete native candidate atomically. Its
    // actual bytes remain the one selected export across continuation.
    await retainBytes(target,bytes);
    return {...await descriptor(target),revision,format};
  });
}

async function analyst({client,selection,reviews,currentRevision,engine,connectionFile,python,node,root}){
  const results=[];
  for(const selected of reviews){
    const slot=await directory(join(root,key(selected.key))),requestFile=join(slot,'review-request.selected.json');
    await retain(requestFile,selected.request);
    const operationId='customer-'+digest(Buffer.from(selection.operation_id+'\n'+selected.key)).slice(0,64);
    const result=await step(slot,'original-python',async()=>({operationId,reviewId:selected.review.id,
      requestId:selected.request.requestId,currentRevision,workspaceId:client.workspaceId,
      dossierId:selected.original.id}),async chosen=>{
      const completion=join(slot,'original','complete.json');
      if(!await exists(completion)){
        const logFile=join(slot,'process-'+randomUUID()+'.json');
        await runProcess(python,[join(engine.root,PREFIX+'python/examples/research_citation_analyst.py'),
          '--directory',await directory(join(slot,'original')),'--checkout',engine.root,
          '--connection',connectionFile,'--workspace-id',client.workspaceId,
          '--dossier',selected.original.id,'--request-file',requestFile,
          '--operation-id',operationId,'--node',node,'--current-revision',String(currentRevision),
          '--wait-seconds','900','--with-workbook'],{
          cwd:engine.root,env:{PYTHONPATH:join(engine.root,PREFIX+'python')+(process.env.PYTHONPATH?':'+process.env.PYTHONPATH:''),
            PYTHONDONTWRITEBYTECODE:'1'},logFile});
      }
      const original=await value(completion);
      need(original.state==='COMPLETE'&&original.reviewId===selected.review.id&&
        original.requestId===selected.request.requestId&&original.currentRevision===currentRevision&&
        original.workspaceId===client.workspaceId&&original.binding.operationId===operationId&&original.workbook&&
        original.exactSavedRequestRecovered===true&&original.customerHandoverVerified===true,
        'CUSTOMER_ORIGINAL_ANALYST_RECEIVING_CHANGED');
      await verifyFiles(original.files);
      return {key:selected.key,original,completion:await descriptor(completion),root:join(slot,'original')};
    });
    await verifyFiles(result.original.files);results.push(result);
  }
  return results;
}

function customerGuide({selection,mapping,citations,europePmc,currentRevision,publicMembers}){
  const rows=citations.reviews.map(row=>{
    const base='merchant/'+key(row.key)+'/citation-merchant-';
    return '<tr><td>'+html(row.noticeBefore.noticeDoi??row.review.noticeId)+'</td><td>'+html(row.review.decision)+
      '</td><td>'+html(row.review.actor)+'</td><td>'+html(row.review.reason)+
      '</td><td>'+link(base+'previous.html','Before review')+'<br>'+link(base+'reviewed.html','Reviewed report')+'</td></tr>';
  }).join('');
  const workbooks=publicMembers.filter(row=>row.kind==='analyst'&&row.path.endsWith('.xlsx'));
  const analystArchives=publicMembers.filter(row=>row.kind==='analyst'&&row.path.endsWith('Citation_Analyst_Complete_Handover.zip'));
  const epmc=Object.entries(europePmc.native.operations).map(([name,row])=>'<tr><td>'+html(row.label)+'</td><td>'+
    html(row.sourcePages.length)+'</td><td>'+link('europe-pmc/editions/'+name+'/records.csv','CSV')+' · '+
    link('europe-pmc/editions/'+name+'/records.ris','RIS')+' · '+link('europe-pmc/editions/'+name+'/review.json','Review decisions')+'</td></tr>').join('');
  return '<!doctype html>\n<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'+
    '<title>'+html(selection.customer_label)+' · Research handover</title><style>'+
    '*{box-sizing:border-box}body{margin:0;color:#222;background:#eee;font:16px/1.55 system-ui,sans-serif}main{max-width:1140px;margin:auto;padding:40px;background:#fff;min-height:100vh}'+
    'h1{font-size:30px;margin:8px 0}h2{margin-top:36px;font-size:22px}p{max-width:85ch}a{color:inherit;text-decoration:underline;text-underline-offset:3px}'+
    'table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #ccc;padding:10px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f3f3f3}'+
    '.table{overflow:auto}.muted{color:#666}.summary{border-top:5px solid #333;border-bottom:1px solid #ccc;padding:20px 0}'+
    'pre{background:#f4f4f4;border:1px solid #ccc;padding:16px;white-space:pre-wrap;overflow-wrap:anywhere}li{margin:7px 0}'+
    '@media(max-width:650px){main{padding:22px 16px}h1{font-size:25px}table{min-width:680px}}</style><main>'+
    '<div class="summary"><p class="muted">Research delivery</p><h1>'+html(selection.customer_label)+'</h1><p>'+html(mapping.metadata.title)+
    '</p><p>'+html(mapping.questions.length)+' selected questions · '+html(selection.occurrences.length)+' selected citation locations · '+
    html(citations.reviews.length)+' recorded reviews</p></div>'+
    '<h2>Read the dossier</h2><p>'+link('dossier/current.html','Open the complete current report')+' · '+
    link('dossier/current.md','Markdown report')+'</p><p>The current report includes the selected source editions, citation decisions, finding dispositions and retained chronology. Its editable history is included in the portable dossier.</p>'+
    '<h2>Review decisions</h2><div class="table"><table><thead><tr><th>Registered notice</th><th>Decision</th><th>Reviewer</th><th>Reason</th><th>Reports</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<h2>Source chronology</h2><p>'+link('chronology/chronology.html','Open the source chronology')+' · '+
    link('chronology/chronology.md','Markdown chronology')+'</p><p>Each date keeps its stated precision and source location. Reviewer interpretations appear with their supporting facts and recorded reasons.</p>'+
    '<h2>Literature editions</h2><div class="table"><table><thead><tr><th>Selected edition</th><th>Original source pages</th><th>Files</th></tr></thead><tbody>'+epmc+'</tbody></table></div>'+
    '<h2>Analyst workbooks</h2><ul>'+workbooks.map(row=>'<li>'+link(row.path,basename(row.path))+'</li>').join('')+
    analystArchives.map(row=>'<li>'+link(row.path,'Complete analyst workspace and review handover')+'</li>').join('')+'</ul>'+
    '<h2>Continue the work</h2><p>'+link('dossier/current.json.gz','Editable Research dossier')+' · '+
    link('europe-pmc/Europe_PMC_Workspace.json.gz','Editable Europe PMC library')+'</p><p>Use the included receiver to open the saved dossier, then continue in the original Research workspace.</p>'+
    '<pre>node engine/'+PREFIX+'research-dossiers/customer-programme/receiving.mjs --open --serve --package-directory /absolute/extracted/package --workspace-directory /absolute/private/research</pre>'+
    '<p>'+link('ENGINE_AND_OPERATION_GUIDE.md','Installation, complete inputs and operation guide')+'</p>'+
    '<details><summary>Delivery reference</summary><p>'+html(selection.operation_id)+' · Dossier '+html(mapping.dossierId)+' · Revision '+html(currentRevision)+
    '</p><p>'+link('PROGRAMME.json','Complete native programme selection')+' · '+link('PACKAGE_MANIFEST.json','Complete file inventory')+' · '+
    link('inputs/selection.original.json','Original commissioning input')+'</p></details></main></html>\n';
}

export async function runCustomerProgramme(options){
  const root=await directory(absolute(options.directory));
  return withPrivateLock(root,'customer-programme.lock',async()=>{
    const selected=await readCustomerSelection(absolute(options.selectionFile),options.selectionSha256,{retainedDirectory:join(root,'delivery','inputs')});
    const {selection,documents,chronology,europePmcSelection}=selected;
    const engine=await readEngineSelection({root:absolute(options.engineRoot),manifestFile:absolute(options.engineManifestFile),
      manifestSha256:options.engineManifestSha256});
    const workspaceDirectory=await directory(absolute(options.workspaceDirectory??join(root,'workspace')));
    const receivingWorkspace=await directory(join(root,'europe-pmc-receiving-workspace'));
    const python=options.python??'python3',node=options.node??process.execPath;
    need(typeof python==='string'&&python&&typeof node==='string'&&node,'CUSTOMER_RUNTIME_SELECTION_REQUIRED');
    absolute(options.playwrightModule);absolute(options.chromiumExecutable);
    const binding={schema:'sf88.research-customer-programme-operation.v1',operationId:selection.operation_id,
      selectionSha256:selected.sha256,engineManifestSha256:engine.manifestSha256,
      implementation:engine.implementation.map(({file,...row})=>row),root,workspaceDirectory,receivingWorkspace,
      engineRoot:engine.root,python,node,playwrightModule:options.playwrightModule,chromiumExecutable:options.chromiumExecutable};
    await retain(join(root,'operation.json'),binding);
    await retainBytes(join(root,'selection.original.json'),selected.bytes);
    const finalPath=join(root,'COMPLETE.json');
    if(await exists(finalPath)){
      const complete=await value(finalPath);need(same(complete.binding,binding),'CUSTOMER_COMPLETE_PROGRAMME_CHANGED');
      await verifyFiles(complete.files);return complete;
    }
    const publicRoot=await directory(join(root,'delivery')),operations=await directory(join(root,'operations'));
    const members=new Map();
    async function include(name,source,kind,mode='100644'){
      member(name);const sourcePin=filePin(source);const body=await checked(sourcePin);
      const target=join(publicRoot,...name.split('/'));
      await retainBytes(target,body);
      const row={path:name,file:target,bytes:body.length,sha256:digest(body),mode,kind};
      if(members.has(name))need(same(members.get(name),row),'CUSTOMER_PACKAGE_MEMBER_COLLISION');
      else members.set(name,row);
      return row;
    }
    async function includeValue(name,body,kind){
      const target=join(publicRoot,...member(name).split('/'));
      const pin=await retain(target,body);return include(name,pin,kind);
    }
    // The immutable operator input and complete original source bodies are part
    // of the handover before any native customer mutation.
    await include('inputs/selection.original.json',await descriptor(join(root,'selection.original.json')),'input');
    for(const [name,document]of documents)
      await include('inputs/original/'+key(name)+'/'+member(document.filename),document,'original-input');
    for(const operation of europePmcSelection.operations)if(operation.import){
      const found=[...documents.entries()].find(([,row])=>row.file===operation.import.file&&row.bytes===operation.import.bytes&&row.sha256===operation.import.sha256);
      need(found,'CUSTOMER_EPMC_SOURCE_NOT_IN_ORIGINAL_DOCUMENT_SELECTION');
      operation.import.file=join(publicRoot,'inputs','original',key(found[0]),member(found[1].filename));
    }
    let source,receiver,primaryError;
    async function closeOwned(){
      const owners=[receiver,source],failures=[];receiver=undefined;source=undefined;
      for(const owner of owners)if(owner){
        try{await owner.client.close();}catch(error){failures.push(error);}
        try{await owner.app.close();}catch(error){failures.push(error);}
      }
      need(!failures.length,'CUSTOMER_ORIGINAL_LISTENER_CLOSE_FAILED');
    }
    try{
      source=await listener(root,'source',workspaceDirectory,python);
      receiver=await listener(root,'receiver',receivingWorkspace,python);
      const client=source.client;
      const mapping=await receiveCustomerSources({client,selection,documents,directory:join(operations,'sources')});
      const europePmc=await runCustomerEuropePmc({client,receivingClient:receiver.client,selection:europePmcSelection,
        dossierId:mapping.dossierId,questionIds:mapping.questionIds,expectedRevision:mapping.revision,
        directory:join(operations,'europe-pmc'),adapters:options.europePmcAdapters??{}});
      const citations=await receiveCustomerCitationReviews({client,selection,mapping,expectedRevision:europePmc.finalRevision,
        directory:join(operations,'citations')});
      const chronologyBindings={...mapping.bindings};
      for(const row of citations.reviews)chronologyBindings['notice.'+row.key]={dossierId:mapping.dossierId,noticeId:row.review.noticeId};
      const rendered=renderCustomerChronology(chronology,{customerLabel:selection.customer_label,
        dossierId:mapping.dossierId,revision:citations.revision,bindings:chronologyBindings});
      const chronologyDirectory=await directory(join(operations,'chronology'));
      const chronologyOriginal=documents.get(selection.chronology.document_key);
      const chronologyFiles=new Map([
        ['chronology.original.json',chronologyOriginal.original],
        ['chronology.html',Buffer.from(rendered.html)],
        ['chronology.md',Buffer.from(rendered.markdown)]
      ]);
      for(const row of chronology.documents){
        const original=documents.get(row.document_key);
        need(original&&original.sha256===row.sha256&&original.bytes===row.bytes,'CUSTOMER_CHRONOLOGY_SOURCE_CHANGED');
        chronologyFiles.set('originals/'+key(row.document_key)+'/'+member(row.filename),original.original);
      }
      for(const [name,bytes]of chronologyFiles){
        const retained=await retainBytes(join(chronologyDirectory,...name.split('/')),bytes);
        await include('chronology/'+name,retained,'chronology');
      }
      const label=(selection.customer_label+' — Source chronology').slice(0,240);
      const sourceManifest={schema:'sf88-research-source-manifest-v1',label,
        sourceTerms:'The original source and licence declarations are retained in chronology.original.json. This attachment records the selected chronology and reviewer interpretations.',
        sourceReference:'Customer-selected original chronology, source bodies and locators',
        sources:[{key:'customer-chronology',title:label,selected:false,classification:'background',
          files:[...chronologyFiles.keys()],metadata:{customerSelectionSha256:selected.sha256,sourceRevision:citations.revision,
            originalChronologySha256:chronologyOriginal.sha256}}],findings:[]};
      const bundle=createSourceBundle({manifestBytes:jsonBytes(sourceManifest),files:chronologyFiles});
      const bundleFile=await retainBytes(join(chronologyDirectory,'chronology.source-bundle.json'),bundle.bytes);
      await include('chronology/chronology.source-bundle.json',bundleFile,'chronology');
      const chronologyReceived=await receiveChronologyBundle({client,mapping,questionKey:selection.chronology.question_key,
        document:{...bundleFile,original:bundle.bytes},label,expectedRevision:citations.revision,directory:chronologyDirectory});
      const currentRevision=chronologyReceived.revision;
      const analystResults=await analyst({client,selection,reviews:citations.reviews,currentRevision,engine,
        connectionFile:source.connectionFile,python,node,root:await directory(join(operations,'analyst'))});
      const merchant=await runCustomerMerchantReceiving({url:source.app.url,workspaceDirectory,dossierId:mapping.dossierId,
        currentRevision,reviews:citations.reviews,directory:join(operations,'merchant')});
      const browser=await runCustomerBrowserReceiving({client,url:source.app.url,dossierId:mapping.dossierId,currentRevision,
        reviews:citations.reviews,directory:join(operations,'browser'),playwrightModule:options.playwrightModule,
        chromiumExecutable:options.chromiumExecutable});
      const current=await requireRevision(client,mapping.dossierId,currentRevision);
      const preserved=preserveUnselected(mapping.dossier.original,current,mapping.questionIds);
      const history=await section(client,mapping.dossierId,'revisions',currentRevision);
      need(history.length===currentRevision,'CUSTOMER_NATIVE_HISTORY_INCOMPLETE');
      await includeValue('dossier/current.metadata.json',current,'native');
      await includeValue('dossier/history.json',history,'native');
      for(const format of ['json.gz','html','md']){
        const original=await originalExport(client,mapping.dossierId,currentRevision,format,
          await directory(join(operations,'native-exports')),'current-'+format.replace(/\./g,'-'));
        await include('dossier/current.'+format,original,'native');
      }
      await includeValue('citation/source-receiving.json',mapping,'citation');
      await includeValue('citation/citation-receiving.json',citations,'citation');
      await includeValue('chronology/native-receiving.json',chronologyReceived,'chronology');
      for(const row of europePmc.files)
        await include('europe-pmc/'+member(row.file),{file:row.path,bytes:row.bytes,sha256:row.sha256},'europe-pmc');
      for(const row of merchant.files)await include('merchant/'+row.name,row,'merchant');
      for(const row of browser.files)await include('browser/'+row.name,row,row.kind);
      await includeValue('browser/receiving.json',browser,'browser');
      await includeValue('merchant/receiving.json',merchant,'merchant');
      for(const received of analystResults){
        await include('analyst/'+key(received.key)+'/complete.json',received.completion,'analyst');
        for(const row of received.original.files)
          await include('analyst/'+key(received.key)+'/'+inside(received.root,row.file),row,'analyst');
      }
      for(const row of engine.files)await include('engine/'+row.path,row,'engine',row.mode);
      const engineMembers=new Set(engine.files.map(row=>row.path));
      for(const row of engine.implementation)if(!engineMembers.has(row.path))
        await include('engine/'+row.path,row,'implementation',row.mode);
      const engineManifestPin=await retainBytes(join(root,'ENGINE_SOURCE.original.json'),engine.manifestBytes);
      await include('ENGINE_SOURCE.json',engineManifestPin,'engine-selection');
      await include('ENGINE_AND_OPERATION_GUIDE.md',await descriptor(join(HERE,'README.md')),'guide');
      const native={dossierId:mapping.dossierId,revision:currentRevision,portable:'dossier/current.json.gz',
        metadata:'dossier/current.metadata.json',history:'dossier/history.json'};
      const programme={schema:'sf88.research-customer-programme-native.v1',state:'NATIVE_RECEIVED',
        operationId:selection.operation_id,customerLabel:selection.customer_label,selectionSha256:selected.sha256,
        sourceWorkspaceId:source.app.workspaceId,native,selectedQuestions:mapping.questionIds,
        originalDocumentBytes:selected.originalBytes,selectedCitationLocations:mapping.occurrences,
        citationReviews:citations.reviews.map(row=>({key:row.key,request:row.request,review:row.review})),
        sourceChronology:{inputSha256:chronologyOriginal.sha256,sourceRevision:citations.revision,
          receivedEditionId:chronologyReceived.edition.id,receivedRevision:currentRevision},
        europePmc:europePmc.native,analyst:analystResults.map(row=>({key:row.key,original:row.original})),
        browser:{workspaceId:browser.workspaceId,readOnlyRequests:browser.readOnlyRequests,observations:browser.observations},
        merchant:{received:merchant.received.map(row=>({key:row.key,original:row.original}))},preserved,
        engine:{repository:engine.repository,ref:engine.ref,
          manifestSha256:engine.manifestSha256,originalFiles:engine.files.length,implementationFiles:engine.implementation.length}};
      await includeValue('PROGRAMME.json',programme,'programme');
      const guide=Buffer.from(customerGuide({selection,mapping,citations,europePmc,currentRevision,publicMembers:[...members.values()]}));
      await include('START_HERE.html',await retainBytes(join(root,'START_HERE.html'),guide),'guide');
      // Only the explicit completed membership is packaged. Live connections,
      // browser profiles, process logs and local request journals stay outside.
      for(const row of members.values()){
        const body=await checked(row);
        for(const token of [source.app.token,receiver.app.token])
          need(!body.includes(Buffer.from(token)),'CUSTOMER_LIVE_SESSION_IN_DELIVERY');
      }
      const packageRequest={schema:'sf88.research-customer-package-build.v1',operationId:selection.operation_id,
        customerLabel:selection.customer_label,selectionSha256:selected.sha256,native,engine:programme.engine,
        files:[...members.values()].sort((a,b)=>a.path.localeCompare(b.path)),
        output:join(root,selection.output.filename_stem+'.zip'),maximumArchiveBytes:selection.output.maximum_archive_bytes,
        resultFile:join(root,'PACKAGE_BUILT.json')};
      const requestFile=await retain(join(root,'package-request.private.json'),packageRequest);
      if(!await exists(packageRequest.resultFile))
        await runProcess(python,[join(HERE,'receive-customer.py'),'build','--request',requestFile.file,
          '--sha256',requestFile.sha256],{cwd:root,logFile:join(root,'package-process-'+randomUUID()+'.json')});
      const packaged=await value(packageRequest.resultFile);await checked(packaged.archive);
      need(packaged.selectionSha256===selected.sha256,'CUSTOMER_PACKAGE_RECEIVING_SELECTION_CHANGED');
      const receivingResult=join(root,'PACKAGE_RECEIVED.json');
      if(!await exists(receivingResult))
        await runProcess(python,[join(HERE,'receive-customer.py'),'receive',
          '--archive',packaged.archive.file,'--sha256',packaged.archive.sha256,
          '--directory',join(root,'cold-receiving'),'--node',node,'--python',python,'--result',receivingResult],
          {cwd:root,logFile:join(root,'receiving-process-'+randomUUID()+'.json')});
      const received=await value(receivingResult);
      need(received.archive.sha256===packaged.archive.sha256&&received.native.dossierId===mapping.dossierId&&
        received.native.selectedRevision===currentRevision,'CUSTOMER_COMPLETE_COLD_RECEIVING_CHANGED');
      const files=[packaged.archive,await descriptor(packageRequest.resultFile),await descriptor(receivingResult),
        await descriptor(join(publicRoot,'START_HERE.html')),await descriptor(join(publicRoot,'PROGRAMME.json'))];
      const complete={schema:'sf88.research-customer-programme-complete.v1',state:'COMPLETE',binding,
        operationId:selection.operation_id,customerLabel:selection.customer_label,native,
        archive:packaged.archive,packageManifestSha256:packaged.manifestSha256,receiving:received,
        nativeProgramme:join(publicRoot,'PROGRAMME.json'),startHere:join(publicRoot,'START_HERE.html'),files};
      await closeOwned();
      await retain(finalPath,complete);return complete;
    }catch(error){
      primaryError=error;throw error;
    }finally{
      try{await closeOwned();}catch(error){
        if(!primaryError)throw error;
        primaryError.listenerCloseCode=error.code??'CUSTOMER_ORIGINAL_LISTENER_CLOSE_FAILED';
      }
    }
  });
}

async function main(args){
  if(args.length===0||args.includes('--help')){
    process.stdout.write('Usage: node programme.mjs --selection /absolute/selection.json --selection-sha256 HASH --directory /absolute/private/run --engine-root /absolute/original/checkout --engine-manifest /absolute/ENGINE_SOURCE.json --engine-manifest-sha256 HASH --playwright-module /absolute/playwright/index.mjs --chromium /absolute/chromium [--workspace /absolute/original/workspace] [--python python3] [--node node]\n');return;
  }
  need(args.length%2===0,'CUSTOMER_PROGRAMME_ARGUMENT_VALUE_REQUIRED');
  const selected={},allowed=['--selection','--selection-sha256','--directory','--engine-root','--engine-manifest',
    '--engine-manifest-sha256','--playwright-module','--chromium','--workspace','--python','--node'];
  for(let i=0;i<args.length;i+=2){
    need(allowed.includes(args[i])&&!Object.hasOwn(selected,args[i])&&typeof args[i+1]==='string'&&args[i+1],
      'CUSTOMER_PROGRAMME_ARGUMENT_INVALID');selected[args[i]]=args[i+1];
  }
  for(const name of allowed.slice(0,8))need(selected[name],'CUSTOMER_PROGRAMME_ARGUMENT_REQUIRED');
  const result=await runCustomerProgramme({selectionFile:resolve(selected['--selection']),selectionSha256:selected['--selection-sha256'],
    directory:resolve(selected['--directory']),engineRoot:resolve(selected['--engine-root']),
    engineManifestFile:resolve(selected['--engine-manifest']),engineManifestSha256:selected['--engine-manifest-sha256'],
    playwrightModule:resolve(selected['--playwright-module']),chromiumExecutable:resolve(selected['--chromium']),
    ...(selected['--workspace']?{workspaceDirectory:resolve(selected['--workspace'])}:{}),
    python:selected['--python']??'python3',node:selected['--node']??process.execPath});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main(process.argv.slice(2)).catch(error=>{process.stderr.write(JSON.stringify({state:'INCOMPLETE',
    code:error.code??'CUSTOMER_PROGRAMME_FAILED'})+'\n');process.exitCode=1;});
