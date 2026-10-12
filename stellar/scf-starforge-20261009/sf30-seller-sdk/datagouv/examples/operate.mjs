// Complete operated example using one original public capture; no public provider writes.
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const inputArgument=process.argv[2];
if(!inputArgument)throw new Error('Choose the retained operation configuration JSON file');
const args=JSON.parse(inputArgument.trimStart().startsWith('{')?inputArgument:await readFile(resolve(inputArgument),'utf8'));
const root=resolve(args.root),app=resolve(args.applicationRoot??join(root,'application')),sdk=join(app,'stellar/scf-starforge-20261009/sf30-seller-sdk/datagouv');
const {openDataGouvWorkspace,receiveArchive}=await import(pathToFileURL(join(sdk,'workspace.mjs')));
const {startDataGouvWorkspace}=await import(pathToFileURL(join(sdk,'server.mjs')));
const {readCapture,hash,encoded,need}=await import(pathToFileURL(join(sdk,'capture.mjs')));
const work=join(root,'workspace'),ops=join(root,'operations');await mkdir(ops,{recursive:true,mode:0o700});
const exists=async p=>{try{await lstat(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
const file=join(ops,'original-inputs.json');let inputs=await exists(file)?JSON.parse(await readFile(file)):null;
if(!inputs){inputs={operationId:'DATACTIVIST-PUBLISHER-OPERATING-018A-20261012-01',requests:Object.fromEntries(['import','plan','review','publish','select','compare','keep'].map(k=>[k,randomUUID()]))};await writeFile(file,encoded(inputs),{flag:'wx',mode:0o600});}
const result={schema:'stellar-forge.datagouv-operated-example.v1',operationId:inputs.operationId,startedAt:new Date().toISOString(),complete:false,stages:[],providerWrites:0};
const stage=(name,detail)=>{result.stages.push({name,completedAt:new Date().toISOString(),...detail});process.stdout.write(JSON.stringify({stage:name,...detail})+'\n');};
let workspace,service,browser;const errors=[];
try{
 const captureFile=args.captureManifest?resolve(args.captureManifest):join(root,'retained-source','Datactivist_Public_Source_20261012_018A','capture','capture.json'),original=await readCapture(captureFile);
 need(original.manifest.row_count===34844&&hash(original.rawFiles.get('original/resource.csv'))==='fec6338a55ea2c4eaaa76d63e8e4d97d9c1e7d8d5666924b8a292eb58a830e05','Use the exact complete original provider CSV');
 workspace=await openDataGouvWorkspace({directory:work,create:!await exists(work),title:'Datactivist · Publisher operations'});
 const retained=await workspace.importCapture({manifest:captureFile,expectedSha256:original.manifestHash,label:'Municipal classification · original provider edition',requestId:inputs.requests.import});
 const source=await workspace.inspectCapture(retained.hash,{limit:25});
 let publication=await workspace.preparePublication({captureHash:retained.hash,label:'Municipal classification · complete historical edition',projection:source.projection,order:[{column:'cog_commune',direction:'asc'}],requestId:inputs.requests.plan});
 publication=await workspace.extract(publication.id);need(['READY','REVIEWED','PUBLISHED'].includes(publication.state),'The original native extraction did not complete: '+publication.state+' '+publication.error);
 if(publication.state!=='PUBLISHED'){
   publication=await workspace.review(publication.id,{captureHash:retained.hash,reviewer:'018A native operator',note:'Reviewed the entire unchanged public CSV, its historical 2020 coverage, original five fields, unique commune codes, blank strings and full 34,844-row publication.',requestId:inputs.requests.review});
   publication=await workspace.publish(publication.id,{reviewId:publication.reviewId,requestId:inputs.requests.publish});
 }
 need(publication.state==='PUBLISHED','The full local native edition was not published');
 stage('complete_native_publication',{publicationId:publication.id,runId:publication.runId,snapshot:publication.snapshot,rows:34844,sourceSha256:retained.originalSha256});
 let selection=workspace.status().selection;
 if(!inputs.selection){inputs.selection={publicationId:publication.id,expectedRevision:selection.revision,reviewer:'018A native operator',note:'Select the fully operated historical edition for actual customer queries.',requestId:inputs.requests.select};await writeFile(file,encoded(inputs),{mode:0o600});}
 selection=await workspace.select(inputs.selection);
 let cursor=null,pages=0,rows=0;const returned=new Map(),allHash=createHash('sha256');
 do{
   const query=new URLSearchParams({limit:'250'});if(cursor)query.set('cursor',cursor);
   const page=await workspace.query({publicationId:publication.id,query:query.toString()});
   need(page.status===200&&page.body.dataset.snapshot===publication.snapshot,'The customer query changed its original snapshot');
   for(const row of page.body.rows){need(!returned.has(row.cog_commune),'A customer page repeated an original source row');returned.set(row.cog_commune,row);allHash.update(JSON.stringify(row)+'\n');rows++;}
   cursor=page.body.page.nextCursor;pages++;need(pages<10000,'Customer continuation did not terminate');
 }while(cursor);
 need(rows===original.rows.length,'Customer continuation omitted original source rows');
 for(const row of original.rows)need(JSON.stringify(returned.get(row.cog_commune))===JSON.stringify(row),'An original field changed in customer receiving');
 const leading=original.rows.find(x=>x.cog_commune.startsWith('0')),filter=await workspace.query({publicationId:publication.id,query:new URLSearchParams({where_cog_commune:leading.cog_commune,limit:'25'}).toString()});
 need(filter.status===200&&filter.body.rows.length===1&&JSON.stringify(filter.body.rows[0])===JSON.stringify(leading),'Leading-zero commune query changed');
 stage('complete_customer_pagination',{pages,rows,allRowsSha256:allHash.digest('hex'),leadingZeroQuery:leading.cog_commune,allCellsCompared:true});
 const comparison=await workspace.compare({before:retained.hash,after:retained.hash,keys:['cog_commune'],requestId:inputs.requests.compare});
 need(comparison.summary.unchanged===34844&&comparison.summary.added===0&&comparison.summary.removed===0&&comparison.summary.changed===0&&comparison.summary.rawBodyChanged===false,'The unchanged retained edition comparison differs');
 if(!inputs.keep){inputs.keep={comparisonId:comparison.id,action:'keep',expectedRevision:workspace.status().selection.revision,reviewer:'018A native operator',note:'The same complete retained provider edition is unchanged. Keep the current historical edition; no later provider capture or changed row is represented.',requestId:inputs.requests.keep};await writeFile(file,encoded(inputs),{mode:0o600});}
 await workspace.decide(inputs.keep);
 const csv=await workspace.download('csv',publication.id),originalCsv=await workspace.download('original',retained.hash),config=await workspace.download('config',publication.id),candidate=await workspace.download('candidate',publication.id);
 need(hash(originalCsv.bytes)===retained.originalSha256,'The full original CSV download changed');
 stage('edition_decision_and_complete_exports',{comparisonId:comparison.id,decision:'keep',comparisonBasis:'same original retained edition',unchanged:34844,csvBytes:csv.bytes.length,csvSha256:hash(csv.bytes),originalCsvBytes:originalCsv.bytes.length,queryConfigBytes:config.bytes.length,nativeCandidateBytes:candidate.bytes.length});
 await workspace.close();workspace=null;
 workspace=await openDataGouvWorkspace({directory:work});need(workspace.status().selection.publicationId===publication.id,'Cold reopen lost the selected original publication');const reopened=await workspace.query({query:'limit=1'});need(reopened.status===200&&reopened.body.dataset.snapshot===publication.snapshot,'Cold reopen changed the dataset snapshot');await workspace.close();workspace=null;
 stage('original_cold_reopen',{snapshot:publication.snapshot,selectedPublication:publication.id});
 service=await startDataGouvWorkspace({directory:work,port:0,sourceRoot:app});
 const actual=await fetch(service.url+'/api/status').then(r=>r.json());need(actual.selection.publicationId===publication.id,'HTTP workspace differs from native source');
 const page=await fetch(service.url+'/api/query?'+new URLSearchParams({publication:publication.id,where_cog_commune:leading.cog_commune,limit:'25'})).then(r=>r.json());
 need(page.rows.length===1&&JSON.stringify(page.rows[0])===JSON.stringify(leading),'Actual HTTP customer values differ');
 const originalHttp=Buffer.from(await (await fetch(service.url+'/api/download?'+new URLSearchParams({kind:'original',id:retained.hash}))).arrayBuffer());need(hash(originalHttp)===retained.originalSha256,'Actual HTTP full original download differs');
 stage('http_source_and_customer_query',{port:service.server.address().port,originalDownloadBytes:originalHttp.length,sourceSha256:hash(originalHttp)});
 if(args.browserExecutable){
   const pw=await import(pathToFileURL(args.playwrightModule));browser=await pw.chromium.launch({headless:true,executablePath:args.browserExecutable,args:['--no-sandbox','--disable-dev-shm-usage']});
   const qa=join(root,'browser-qa');await mkdir(qa,{recursive:true,mode:0o700});const views=[];
   for(const width of [1440,390]){
     const context=await browser.newContext({viewport:{width,height:960},acceptDownloads:true});const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(service.url,{waitUntil:'networkidle'});
     await page.waitForFunction(()=>document.getElementById('connection').textContent==='Workspace open');
     for(const view of ['overview','sources','publications','compare','portal','handover']){
       await page.locator('nav a[href="#'+view+'"]').click();await page.waitForFunction(v=>!document.getElementById(v).hidden,view);
       const size=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
       need(size.document===width&&size.body<=width,'Actual '+view+' view overflows '+width+'px');const screenshot=join(qa,view+'-'+width+'.png');await page.screenshot({path:screenshot,fullPage:true});
       views.push({view,width,...size,screenshot});
     }
     await page.locator('nav a[href="#sources"]').click();await page.getByRole('button',{name:'Open source',exact:true}).first().click();await page.waitForSelector('#source-detail:not([hidden])');need(await page.locator('#source-rows tbody tr').count()===25,'Browser source preview did not show all 25 selected rows');
     const downloadPromise=page.waitForEvent('download');await page.locator('#source-csv').click();const download=await downloadPromise;const path=join(qa,'original-'+width+'.csv');await download.saveAs(path);need(hash(await readFile(path))===retained.originalSha256,'Browser complete source download differs');
     await page.locator('nav a[href="#publications"]').click();await page.getByRole('button',{name:'Open current',exact:true}).click();await page.waitForSelector('#publication-detail:not([hidden])');await page.locator('#query-form input[name=query]').fill('where_cog_commune='+leading.cog_commune+'&limit=25');await page.getByRole('button',{name:'Run query',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('#query-rows tbody tr').length===1);need((await page.locator('#query-rows').innerText()).includes(leading.cog_commune),'Browser query lost the original commune code');
     for(const view of ['source-detail','publication-detail']){const size=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));need(size.document===width,'Actual detailed view overflows '+width+'px');views.push({view,width,...size});}
     await context.close();
   }
   await browser.close();browser=null;need(errors.length===0,'Browser page errors: '+errors.join('; '));stage('desktop_and_mobile_browser',{views,errors,completeOriginalDownloads:2,realQueryViews:2});
 }else throw new Error('Select the actual existing browser runtime for complete desktop/mobile operation');
 await service.close();service=null;
 workspace=await openDataGouvWorkspace({directory:work});const archive=await workspace.exportArchive({sourceRoot:app});const archivePath=join(ops,'publisher-workspace.datawork');await writeFile(archivePath,archive.bytes,{mode:0o600});await workspace.close();workspace=null;
 const receivingDir=join(root,'receiving-'+hash(archive.bytes).slice(0,12)),receiving=await receiveArchive({file:archivePath,directory:receivingDir,expectedSha256:hash(archive.bytes)});
 const customer=await openDataGouvWorkspace({directory:join(receivingDir,'workspace')});
 try{need(customer.status().workspace.id===actual.workspace.id,'Independent receiving changed the workspace identity');const query=await customer.query({publicationId:publication.id,query:'limit=250'});need(query.status===200&&query.body.dataset.snapshot===publication.snapshot&&query.body.rows.length===250,'Independent customer query did not reopen its exact original snapshot');}
 finally{await customer.close();}
 async function receivedCommand(argv){
   return new Promise((done,reject)=>{
     const child=spawn(process.execPath,[join(receivingDir,'application','start-publisher.mjs'),...argv],{cwd:join(receivingDir,'application'),shell:false,stdio:['ignore','pipe','pipe']});
     let stdout='',stderr='',size=0;
     child.stdout.on('data',chunk=>{size+=chunk.length;if(size>4*1024*1024){child.kill('SIGTERM');return;}stdout+=chunk;});
     child.stderr.on('data',chunk=>{if(stderr.length<32768)stderr+=chunk;});
     child.once('error',reject);child.once('close',code=>{
       if(code!==0||size>4*1024*1024)return reject(new Error('Independent installed application failed: '+code+' '+stderr));
       try{done(JSON.parse(stdout));}catch(e){reject(new Error('Independent installed application returned invalid JSON: '+e.message));}
     });
   });
 }
 const receivedStatus=await receivedCommand(['status','--directory',join(receivingDir,'workspace')]);
 need(receivedStatus.workspace.id===actual.workspace.id&&receivedStatus.selection.publicationId===publication.id,'The fresh receiving application process lost its original workspace');
 const receivedPage=await receivedCommand(['query','--directory',join(receivingDir,'workspace'),'--publication',publication.id,'--query','limit=250']);
 need(receivedPage.status===200&&receivedPage.body.dataset.snapshot===publication.snapshot&&receivedPage.body.rows.length===250,'The fresh receiving application process did not execute its customer query');
 stage('complete_archive_and_independent_receiving',{archivePath,archiveBytes:archive.bytes.length,archiveSha256:hash(archive.bytes),...receiving,independentApplicationProcesses:2,receivingSourceExecuted:true});
 result.complete=true;result.publicationId=publication.id;result.snapshot=publication.snapshot;result.captureSha256=retained.hash;
}catch(e){result.error={name:e.name,code:e.code??null,message:e.message,stack:e.stack};process.stderr.write(JSON.stringify(result.error)+'\n');process.exitCode=1;}
finally{await browser?.close();await service?.close();await workspace?.close();result.completedAt=new Date().toISOString();const file=join(ops,'operation-result.json');await writeFile(file,encoded(result),{mode:0o600});process.stdout.write(JSON.stringify({state:result.complete?'DATACTIVIST_OPERATING_COMPLETE':'DATACTIVIST_OPERATING_RETAINED',complete:result.complete,stages:result.stages.length,error:result.error?.message??null,result:file})+'\n');}
