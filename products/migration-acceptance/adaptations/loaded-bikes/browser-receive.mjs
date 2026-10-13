#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Actual browser continuation of the retained Loaded Bikes native receiving course.
import {readFileSync,existsSync,lstatSync,realpathSync,mkdirSync,accessSync,constants} from 'node:fs';
import {resolve,join,dirname,relative,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {acquireWorkspaceLease,privateDirectory} from '../../workbench/vendor/dlt/vendor/sling/vendor/stellar-expert/store.mjs';
import {atomicBytes,atomicJson,canonical,safeRelative,now} from '../../workbench/vendor/dlt/vendor/sling/core/common.mjs';
import {hashFile} from '../../workbench/vendor/dlt/vendor/sling/core/objects.mjs';
import {sourceTables,prepareCatalogue} from './catalogue.mjs';
import {sourceIssues} from './acceptance.mjs';
import {validateProject,correctionIdentity,csvText} from './review-state.mjs';

const ADDON=dirname(fileURLToPath(import.meta.url));
const APPLICATION=resolve(ADDON,'../..');
const APP_ROUTE='/adaptations/loaded-bikes/';
const STORAGE='tjlabs.loaded-bikes.project.v1';
const SCHEMA='tjlabs.loaded-bikes-browser-receiving.v1';
const PANES=['overview','catalogue','relations','mapping','issues','sources','history'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
const copy=value=>JSON.parse(JSON.stringify(value));
const equal=(a,b)=>canonical(a)===canonical(b);
const need=(yes,message)=>{if(!yes)throw new Error(message);};
const utf8=body=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(body);
const read=path=>JSON.parse(utf8(regular(path)).replace(/^\uFEFF/,''));
function regular(path){
  path=resolve(path);const before=lstatSync(path);
  need(before.isFile()&&!before.isSymbolicLink()&&realpathSync(path)===path,'Select a canonical ordinary file: '+path);
  const body=readFileSync(path),after=lstatSync(path);
  need(before.ino===after.ino&&before.dev===after.dev&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs&&body.length===after.size,'A selected file changed while it was read: '+path);
  return body;
}
function identity(body){return {bytes:body.length,sha256:sha(body)};}
function verify(path,expected){const body=regular(path);need(body.length===expected.bytes&&sha(body)===expected.sha256,'The complete retained file differs: '+path);return body;}
function inside(root,path){
  const rel=relative(root,resolve(path));
  need(!rel.startsWith('../')&&rel!=='..'&&!rel.startsWith('/'),'A selected path escapes its original application.');
  return resolve(path);
}
function sourceManifest(root,prefix){
  const raw=regular(join(root,'SOURCE_MANIFEST.json')),manifest=JSON.parse(utf8(raw));
  need(Array.isArray(manifest.files)&&manifest.files.length,'The complete application source manifest is absent.');
  const names=new Set(),files=[];
  for(const descriptor of manifest.files){
    safeRelative(descriptor.path);need(!names.has(descriptor.path)&&descriptor.path!=='SOURCE_MANIFEST.json','Source manifest paths repeat or include the manifest itself.');
    names.add(descriptor.path);const body=verify(join(root,descriptor.path),descriptor);
    files.push({path:prefix+descriptor.path,body,...identity(body)});
  }
  files.push({path:prefix+'SOURCE_MANIFEST.json',body:raw,...identity(raw)});
  return {files,manifest:identity(raw)};
}
function originalResponses(project){return [...project.capture.responses,...(project.claims?.original_response_additions||[])];}
function expectedMembers(project,prepared,sources){
  const files=new Map();
  const add=(path,content,{skipExisting=false}={})=>{
    safeRelative(path);const body=Buffer.isBuffer(content)?content:Buffer.from(content);
    if(files.has(path)){need(skipExisting&&files.get(path).body.equals(body),'Two complete package members conflict: '+path);return;}
    files.set(path,{path,body,...identity(body)});
  };
  add('project.json',json(project));
  for(const file of sources)add(file.path,file.body);
  add('application/adaptations/loaded-bikes/catalogue-capture.json',json(project.capture));
  add('application/adaptations/loaded-bikes/project.json',json(project));
  if(project.claims)add('application/adaptations/loaded-bikes/source-claims.json',json(project.claims));
  for(const response of originalResponses(project)){
    const body=Buffer.from(response.content_base64,'base64');
    need(body.length===response.bytes&&sha(body)===response.sha256,'An original public response differs: '+response.path);
    add(response.path,body);
  }
  if(project.claims)add('source/source-claims.json',json(project.claims));
  for(const file of prepared.files||[])add(file.path,file.content,{skipExisting:true});
  return files;
}
const EXTRACT=[
'import hashlib,json,pathlib,sys,zipfile,stat',
'archive,destination,expected_path=sys.argv[1:]',
'expected=json.loads(pathlib.Path(expected_path).read_text())',
'root=pathlib.Path(destination);root.mkdir(parents=True,exist_ok=True)',
'if root.resolve()!=root.absolute() or root.is_symlink(): raise ValueError("Extraction directory is not canonical")',
'output=[]',
'with zipfile.ZipFile(archive) as z:',
' infos=z.infolist(); names=[i.filename for i in infos]',
' if len(names)!=len(set(names)) or set(names)!=set(expected)|{"README.txt"}: raise ValueError("Complete archive member set differs")',
' for i in infos:',
'  parts=pathlib.PurePosixPath(i.filename).parts',
'  if not parts or i.filename.startswith("/") or "\\\\" in i.filename or any(p in ("..",".","") for p in parts) or i.is_dir() or stat.S_ISLNK(i.external_attr>>16) or i.flag_bits&1: raise ValueError("Unsafe archive member")',
'  b=z.read(i); digest=hashlib.sha256(b).hexdigest()',
'  if i.filename in expected:',
'   want=expected[i.filename]',
'   if len(b)!=want["bytes"] or digest!=want["sha256"]: raise ValueError("Original archive member differs: "+i.filename)',
'  elif len(b)>65536 or b"Loaded Bikes complete catalogue intake" not in b: raise ValueError("The package instructions differ")',
'  target=root.joinpath(*parts);target.parent.mkdir(parents=True,exist_ok=True)',
'  if not target.resolve().is_relative_to(root.resolve()): raise ValueError("Archive path escapes destination")',
'  if target.exists():',
'   if target.is_symlink() or target.read_bytes()!=b: raise ValueError("Existing extracted member differs")',
'  else:',
'   with target.open("xb") as out: out.write(b)',
'  output.append({"path":i.filename,"bytes":len(b),"sha256":digest})',
'print(json.dumps({"members":output,"count":len(output)},sort_keys=True))'
].join('\n');
function extract(zip,directory,expected,python,expectedPath){
  const map=Object.fromEntries([...expected.values()].map(({path,bytes,sha256})=>[path,{bytes,sha256}]));
  atomicJson(expectedPath,map,{immutable:true});
  const result=spawnSync(python,['-c',EXTRACT,zip,directory,expectedPath],{encoding:'utf8',maxBuffer:16*1024*1024,timeout:120000});
  need(!result.error&&result.status===0,'The ordinary complete ZIP could not be received: '+String(result.error?.message||result.stderr||result.signal||result.status));
  return JSON.parse(result.stdout);
}
async function staticHost(routes,port=0){
  const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.csv':'text/csv; charset=utf-8','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8'};
  const server=createServer((req,res)=>{
    try{
      need(req.method==='GET'||req.method==='HEAD','This read-only recipient host accepts GET and HEAD.');
      const url=new URL(req.url,'http://127.0.0.1'),path=decodeURIComponent(url.pathname);
      let selected=null;
      for(const route of routes)if(path.startsWith(route.prefix)){selected=route;break;}
      if(!selected){res.writeHead(404);res.end();return;}
      let rel=path.slice(selected.prefix.length)||'index.html';
      if(rel.endsWith('/'))rel+='index.html';
      safeRelative(rel);
      let body;
      if(selected.files?.has(rel))body=selected.files.get(rel);
      else{
        const file=inside(selected.root,join(selected.root,rel.endsWith('/')?rel+'index.html':rel));
        body=regular(file);
      }
      res.writeHead(200,{'Content-Type':mime[extname(rel)]||'application/octet-stream','Content-Length':body.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      res.end(req.method==='HEAD'?undefined:body);
    }catch(error){res.writeHead(error.code==='ENOENT'?404:400,{'Content-Type':'text/plain'});res.end('The selected original file is unavailable.');}
  });
  await new Promise((yes,no)=>{server.once('error',no);server.listen(port,'127.0.0.1',yes);});
  return {server,origin:'http://127.0.0.1:'+server.address().port,close:()=>new Promise((yes,no)=>server.close(error=>error?no(error):yes()))};
}
class Course{
  constructor(options,root,lease,state){this.o=options;this.root=root;this.lease=lease;this.state=state;this.page=null;this.context=null;}
  save(){this.lease.assert();atomicJson(join(this.root,'browser-operation.json'),this.state);}
  path(name){safeRelative(name);return join(this.root,name);}
  async current(page=this.page){return validateProject(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),STORAGE));}
  async ready(page=this.page){
    await page.waitForFunction(({key,id})=>{
      try{const p=JSON.parse(localStorage.getItem(key));return p?.id===id&&!document.querySelector('#save').disabled&&document.querySelector('#main h2')&&!document.querySelector('#status.error');}catch{return false;}
    },{key:STORAGE,id:this.state.selection.projectId});
    const project=await this.current(page);
    need(equal(project.capture,this.state.initialProject.capture)&&equal(project.claims,this.state.initialProject.claims),'The opened browser selected another source edition.');
    return project;
  }
  async checkpoint(){
    const p=await this.current();this.state.currentProject=p;
    atomicJson(this.path('current-project.json'),p);this.save();return p;
  }
  async tab(name,page=this.page){need(PANES.includes(name),'Unknown native catalogue pane.');await page.locator('[data-tab="'+name+'"]').click();await page.locator('[data-tab="'+name+'"][aria-current=page]').waitFor();}
  async shot(name,page=this.page){
    safeRelative(name);const path=this.path('screenshots/attempt-'+this.state.attempt+'/'+name+'.png');
    mkdirSync(dirname(path),{recursive:true,mode:0o700});
    await page.screenshot({path,fullPage:true});
    const body=regular(path),result={path:relative(this.root,path),...identity(body),viewport:page.viewportSize(),capturedAt:now(),humanLook:'pending'};
    this.state.screenshots.push(result);this.save();return result;
  }
  async width(width,page=this.page){await page.setViewportSize({width,height:width===390?844:1000});}
  async download(name,action,{expected=null,page=this.page}={}){
    safeRelative(name);
    const old=this.state.downloads[name];
    if(old){const body=verify(this.path(old.path),old);if(expected)need(body.equals(Buffer.from(expected)),'The retained download belongs to another review edition: '+name);return old;}
    const promised=page.waitForEvent('download',{timeout:120000});await action();const file=await promised;
    need(!await file.failure(),'The browser did not complete its ordinary download.');
    const target=this.path('downloads/'+name);mkdirSync(dirname(target),{recursive:true,mode:0o700});await file.saveAs(target);
    const body=regular(target);if(expected)need(body.equals(Buffer.from(expected)),'Downloaded bytes differ from the complete original: '+name);
    const descriptor={path:relative(this.root,target),suggestedFilename:file.suggestedFilename(),...identity(body)};
    this.state.downloads[name]=descriptor;this.save();return descriptor;
  }
  marker(name){return '[browser receiving '+this.o.operation+' / '+name+']';}
  async mutation(name,action){
    const marker=this.marker(name),current=await this.current();
    const found=current.history.find(e=>e.reason.includes(marker));
    if(found){await this.checkpoint();return;}
    await action(marker,current.revision);
    await this.page.waitForFunction(({key,marker,revision})=>{
      try{const p=JSON.parse(localStorage.getItem(key));return p.revision===revision+1&&p.history.some(e=>e.reason.includes(marker))&&!document.querySelector('#status.error');}catch{return false;}
    },{key:STORAGE,marker,revision:current.revision});
    await this.checkpoint();
  }
  async reviewFields(reason,root=this.page.locator('#editor-form')){
    await root.locator('[name=reviewer]').fill(this.o.reviewer);
    await root.locator('[name=reason]').fill(reason);
  }
  async openCell(table,index,column){
    await this.tab('catalogue');await this.page.locator('#table-select').selectOption(table);
    await this.page.locator('#search').fill('');
    while(!await this.page.locator('[data-row="'+index+'"][data-column="'+column+'"]').count()){
      need(!await this.page.locator('#next').isDisabled(),'The selected original row is absent from the catalogue.');
      await this.page.locator('#next').click();
    }
    await this.page.locator('[data-row="'+index+'"][data-column="'+column+'"]').click();
    await this.page.locator('#editor[open]').waitFor();
  }
  async setMapping(mapping,reason){
    await this.tab('mapping');await this.page.locator('#table-select').selectOption(mapping.sourceTable);
    const form=this.page.locator('#mapping-form');await form.locator('[name=tableName]').fill(mapping.tableName);
    for(const [i,column]of mapping.columns.entries()){
      await form.locator('[name="column-'+i+'"]').fill(column.name);
      await form.locator('[name="type-'+i+'"]').selectOption(column.data_type);
      await form.locator('[name="precision-'+i+'"]').fill(String(column.precision??38));
      await form.locator('[name="scale-'+i+'"]').fill(String(column.scale??0));
      await form.locator('[name="nullable-'+i+'"]').setChecked(column.nullable);
      await form.locator('[name="key-'+i+'"]').setChecked(mapping.primaryKey.includes(column.name));
    }
    await this.reviewFields(reason,form);await form.locator('button[type=submit]').click();
  }
}
export async function runBrowserReceiving(options){
  for(const key of ['project','output','playwright','chromium','operation'])need(options[key],'Supply --'+key+'.');
  need(/^[A-Za-z0-9_.:-]{1,120}$/.test(options.operation),'Use the original stable receiving operation ID.');
  options.reviewer=options.reviewer||'Receiving operator';options.python=options.python||'python3';
  const root=await privateDirectory(resolve(options.output),{create:true}),lease=await acquireWorkspaceLease(join(root,'browser.lock'));
  let host=null,context=null,course=null;
  try{
    const originalPath=resolve(options.project),originalBytes=regular(originalPath),initial=validateProject(JSON.parse(utf8(originalBytes).replace(/^\uFEFF/,'')));
    need(initial.claims?.claims?.length,'The complete relationship inventory must accompany the original project.');
    const core=sourceManifest(join(APPLICATION,'workbench'),'application/workbench/');
    const addon=sourceManifest(ADDON,'application/adaptations/loaded-bikes/');
    const sources=[...core.files,...addon.files],playwright=resolve(options.playwright),chromium=resolve(options.chromium);
    accessSync(chromium,constants.X_OK);const browserModule=regular(playwright);
    need(lstatSync(chromium).isFile()&&!lstatSync(chromium).isSymbolicLink()&&realpathSync(chromium)===chromium,'Select the original canonical Chromium executable.');
    for(const name of ['project.json','catalogue-capture.json','source-claims.json'])need(!addon.files.some(f=>f.path==='application/adaptations/loaded-bikes/'+name),'Selected project bindings must be appended outside the immutable addon manifest: '+name);
    const selection={operation:options.operation,projectId:initial.id,project:identity(originalBytes),application:APPLICATION,
      manifests:{workbench:core.manifest,addon:addon.manifest},python:options.python,playwright:{path:playwright,...identity(browserModule)},chromium:{path:chromium,...hashFile(chromium)},reviewer:options.reviewer};
    const statePath=join(root,'browser-operation.json');let state;
    if(existsSync(statePath)){
      state=read(statePath);need(state.schema===SCHEMA&&equal(state.selection,selection),'Resume the same retained source/project/runtime selection.');
      need(options.resume||state.status==='controls_received_awaiting_look','Use --resume for this retained browser operation.');
      if(state.status==='controls_received_awaiting_look'){
        for(const item of Object.values(state.downloads))verify(join(root,item.path),item);
        verify(join(root,state.finalProject.path),state.finalProject);
        return state.result;
      }
    }else{
      state={schema:SCHEMA,selection,initialProject:initial,currentProject:initial,status:'prepared',createdAt:now(),attempt:0,downloads:{},screenshots:[],pageErrors:[],networkErrors:[],steps:{}};
      atomicBytes(join(root,'original-project.json'),originalBytes,{immutable:true});
    }
    state.attempt++;state.status='running';state.startedAt=now();course=new Course(options,root,lease,state);course.save();
    const override=new Map([['project.json',Buffer.from(json(state.currentProject))]]);
    host=await staticHost([{prefix:APP_ROUTE,root:ADDON,files:override},{prefix:'/workbench/',root:join(APPLICATION,'workbench')}],state.port||0);
    state.port=host.server.address().port;course.save();
    const mod=await import(pathToFileURL(playwright).href),browser=mod.chromium||mod.default?.chromium;
    need(browser?.launchPersistentContext,'Use the installed original Playwright Chromium module.');
    const profile=await privateDirectory(join(root,'browser-profile'),{create:true}),temp=await privateDirectory(join(root,'browser-temp'),{create:true});
    context=await browser.launchPersistentContext(profile,{executablePath:chromium,headless:true,acceptDownloads:true,viewport:{width:1440,height:1000},locale:'en-GB',timezoneId:'UTC',args:['--no-sandbox'],env:{...process.env,TMPDIR:temp}});
    context.setDefaultTimeout(45000);course.context=context;
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.protocol==='http:'&&url.origin===host.origin)return route.continue();
      if(['data:','blob:','about:'].includes(url.protocol))return route.continue();
      state.networkErrors.push({kind:'unexpected-external-request',url:url.href});course.save();return route.abort();
    });
    const page=await context.newPage();course.page=page;
    page.on('pageerror',error=>{state.pageErrors.push({message:String(error.message),at:now()});course.save();});
    await page.goto(host.origin+APP_ROUTE,{waitUntil:'networkidle'});await course.ready();
    const current=await course.current();
    if(!equal(current,state.currentProject)){
      const prior=state.currentProject;
      need(current.revision>=prior.revision&&equal(current.history.slice(0,prior.revision),prior.history)&&
        current.history.slice(prior.revision).every(e=>e.reason.includes('[browser receiving '+options.operation+' / ')),
        'The retained browser contains another review; preserve that edition before continuing this operation.');
      await course.checkpoint();
    }
    const tables=await sourceTables(initial.capture),findings=await sourceIssues(initial.capture,initial.claims),issues=Array.isArray(findings)?findings:findings.issues;
    need(tables.length&&issues.length,'The complete original source and business questions must be available.');
    for(const width of [1440,390]){
      await course.width(width);
      for(const name of PANES){await course.tab(name);await course.shot(width+'-'+name);}
    }
    await course.width(1440);await course.tab('catalogue');
    // Each original table is searched, paged to its final row and exported in full.
    for(const table of tables){
      await page.locator('#table-select').selectOption(table.name);await page.locator('#search').fill('');
      const key=String(table.rows[0][table.primaryKey[0]]);await page.locator('#search').fill(key);
      need(await page.locator('#main tbody tr').count()>0,'Searching the original source key did not show its row.');
      await page.locator('#search').fill('__receiving_absent_'+options.operation+'__');
      await page.locator('#main .empty').waitFor();await page.locator('#search').fill('');
      let seen=await page.locator('#main tbody tr').count();
      while(!await page.locator('#next').isDisabled()){await page.locator('#next').click();seen+=await page.locator('#main tbody tr').count();}
      need(seen===table.rows.length,'Catalogue pagination did not expose every original row in '+table.name);
      state.steps['table-'+table.name]={rows:seen,columns:table.columns.length};course.save();
    }
    const products=tables.find(t=>t.name==='products');need(products,'The original products table is missing.');
    const pick=products.rows.findIndex(row=>!initial.review.corrections.some(c=>correctionIdentity(c)===correctionIdentity({table:'products',sourceKey:Object.fromEntries(products.primaryKey.map(k=>[k,row[k]])),column:'name'})));
    need(pick>=0,'Select an original uncorrected product name for the attributed receiving exercise.');
    const row=products.rows[pick];
    await course.openCell('products',pick,'product_id');
    need(await page.locator('#editor-form button[type=submit]').isHidden(),'The original source key must remain locked.');
    await page.locator('#close-editor').click();
    await course.openCell('products',pick,'description_html');
    need(await page.locator('#editor textarea[readonly]').first().inputValue()===row.description_html,'The long original HTML cell was truncated.');
    await course.shot('1440-complete-description');await course.width(390);await course.shot('390-complete-description');
    await page.locator('#editor textarea[readonly]').first().evaluate(element=>{element.scrollTop=element.scrollHeight;});await course.shot('390-description-end');
    await page.locator('#close-editor').click();await course.width(1440);
    await course.mutation('temporary-name',async marker=>{
      await course.openCell('products',pick,'name');
      await page.locator('#editor [name=value]').fill(JSON.stringify(row.name+' [receiving exercise only]'));
      await course.reviewFields(marker+' Temporary change in this isolated receiving copy; restore the exact public source next.');
      await page.locator('#editor-form button[type=submit]').click();
    });
    await course.mutation('restore-name',async marker=>{
      await course.openCell('products',pick,'name');await course.reviewFields(marker+' Restore the exact original source after exercising the correction control.');
      await page.locator('#restore').click();
    });
    const mapping=initial.review.tables.find(t=>t.sourceTable==='products'),changed=copy(mapping);
    const price=changed.columns.find(c=>c.source==='price_minor');need(price,'The exact minor-unit price column is missing.');
    changed.tableName='receiving_products_'+sha(Buffer.from(options.operation)).slice(0,8);price.data_type='decimal';price.precision=38;price.scale=0;
    await course.mutation('temporary-mapping',marker=>course.setMapping(changed,marker+' Exercise a named destination and DECIMAL(38,0) while preserving the exact original minor-unit integers.'));
    await course.mutation('restore-mapping',marker=>course.setMapping(mapping,marker+' Restore the supplied destination mapping; the exercise does not choose a customer ERP.'));
    const issueIndex=issues.findIndex(issue=>!initial.issueDecisions.some(d=>d.issueId===issue.id));
    if(issueIndex>=0)await course.mutation('source-question',async marker=>{
      await course.tab('issues');await page.locator('[data-issue="'+issueIndex+'"]').click();
      await page.locator('#editor [name=disposition]').selectOption('open');
      await course.reviewFields(marker+' The complete source question was inspected. It remains open for its actual product owner; no source interpretation was resolved by this receiving course.');
      await page.locator('#editor-form button[type=submit]').click();
    });
    let final=await course.checkpoint();
    need(equal(final.review,initial.review),'A temporary correction or mapping remained in the outgoing review.');
    need(equal(final.capture,initial.capture)&&equal(final.claims,initial.claims),'The original source or published claims changed.');
    await course.tab('relations');
    await page.locator('#relation-search').fill('LB10073');
    need(await page.locator('#main tbody tr').count()>0,'The unresolved original kit reference did not remain searchable.');
    await page.locator('#main details').first().evaluate(element=>{element.open=true;});
    await course.shot('1440-conditional-source-claim');
    await page.locator('#relation-search').fill('');let relationCount=await page.locator('#main tbody tr').count();
    while(!await page.locator('#relation-next').isDisabled()){await page.locator('#relation-next').click();relationCount+=await page.locator('#main tbody tr').count();}
    need(relationCount===final.claims.claims.length,'The complete published relationship inventory is not reachable.');
    await course.download('loaded-bikes-source-claims.json',()=>page.locator('#relations-download').click(),{expected:json(final.claims)});
    await course.tab('sources');
    for(const [i,response]of originalResponses(final).entries()){
      const expected=Buffer.from(response.content_base64,'base64');
      await course.download(response.path,()=>page.locator('[data-source="'+i+'"]').click(),{expected});
    }
    const prepared=await prepareCatalogue({capture:final.capture,review:final.review});
    await course.tab('catalogue');
    for(const table of tables){
      await page.locator('#table-select').selectOption(table.name);
      const selected=final.review.tables.find(m=>m.sourceTable===table.name);
      const target=prepared.tables.find(t=>(t.name||t.tableName)===selected.tableName||t.sourceTable===table.name);
      need(target,'The complete prepared table is missing: '+table.name);
      await course.download('reviewed/'+selected.tableName+'.csv',()=>page.locator('#export-table').click(),{expected:csvText(target)});
    }
    await course.tab('history');
    await page.locator('#main details').evaluateAll(items=>items.forEach(item=>item.open=true));
    await course.shot('1440-complete-review-history');
    const projectDownload=await course.download('loaded-bikes-project.json',()=>page.locator('#history-save').click(),{expected:json(final)});
    state.finalProject=projectDownload;course.save();
    const zip=await course.download('loaded-bikes-intake.zip',()=>page.locator('#history-package').click());
    const expected=expectedMembers(final,prepared,sources);
    const extracted=course.path('received-intake'),inventory=extract(course.path(zip.path),extracted,expected,options.python,course.path('expected-intake-members.json'));
    state.steps.archive={...zip,memberCount:inventory.count,sourceFiles:sources.length,originalResponses:originalResponses(final).length};
    atomicJson(course.path('received-intake-inventory.json'),inventory,{immutable:true});
    // A fresh browser context opens the actual extracted application and retained project.
    const receivedHost=await staticHost([{prefix:'/',root:extracted}]);
    let receivingContext;
    try{
      receivingContext=await browser.launchPersistentContext(await privateDirectory(course.path('received-profile-attempt-'+state.attempt),{create:true}),{executablePath:chromium,headless:true,acceptDownloads:true,viewport:{width:1440,height:1000},locale:'en-GB',timezoneId:'UTC',args:['--no-sandbox'],env:{...process.env,TMPDIR:temp}});
      receivingContext.setDefaultTimeout(45000);
      await receivingContext.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.origin===receivedHost.origin||['data:','blob:','about:'].includes(url.protocol))return route.continue();
        state.networkErrors.push({kind:'unexpected-received-request',url:url.href});course.save();return route.abort();
      });
      const reopened=await receivingContext.newPage();reopened.on('pageerror',error=>{state.pageErrors.push({message:String(error.message),phase:'received',at:now()});course.save();});
      await reopened.goto(receivedHost.origin+'/application/adaptations/loaded-bikes/',{waitUntil:'networkidle'});
      await course.ready(reopened);need(equal(await course.current(reopened),final),'The extracted application did not reopen the same complete review.');
      for(const width of [1440,390]){
        await course.width(width,reopened);
        for(const name of PANES){await course.tab(name,reopened);await course.shot('reopened-'+width+'-'+name,reopened);}
      }
      // Explicit ordinary saved-project file opening, not merely cached browser state.
      await reopened.locator('#file').setInputFiles(course.path(projectDownload.path));
      await reopened.waitForFunction(()=>document.querySelector('#status')?.textContent.startsWith('Opened loaded-bikes-project.json ')&&document.querySelector('#file').value==='');
      await course.ready(reopened);need(equal(await course.current(reopened),final),'Opening the actual downloaded project changed its complete edition.');
      await course.tab('history',reopened);
      const replay=await course.download('reopened-loaded-bikes-intake.zip',()=>reopened.locator('#history-package').click(),{page:reopened});
      const replayInventory=extract(course.path(replay.path),course.path('reopened-intake'),expected,options.python,course.path('expected-intake-members.json'));
      const byPath=items=>Object.fromEntries(items.map(item=>[item.path,{bytes:item.bytes,sha256:item.sha256}]));
      need(equal(byPath(inventory.members),byPath(replayInventory.members)),'The reopened application exported another complete intake edition.');
      state.steps.coldReopen={projectId:final.id,revision:final.revision,archive:replay,memberCount:replayInventory.count,projectOpenedFromActualDownload:true};
    }finally{
      if(receivingContext)await receivingContext.close();
      await receivedHost.close();
    }
    need(state.pageErrors.length===0,'A real application page error occurred; inspect the retained browser-operation.json.');
    need(state.networkErrors.length===0,'An unexpected external application request occurred; inspect the original source.');
    state.status='controls_received_awaiting_look';state.completedAt=now();
    state.result={schema:SCHEMA,status:state.status,operation:options.operation,projectId:final.id,revision:final.revision,
      sourceManifests:selection.manifests,sourceTables:tables.map(t=>({name:t.name,rows:t.rows.length,columns:t.columns.length})),
      publishedRelationships:relationCount,sourceQuestions:issues.length,originalResponses:originalResponses(final).length,
      finalProject:projectDownload,intakeArchive:zip,coldReopen:state.steps.coldReopen,
      screenshots:state.screenshots,downloads:state.downloads,
      recipientReview:'The producing operator must open the retained actual screenshots, ordinary CSV/JSON/ZIP and complete application, correct any visible mistakes, and record that human LOOK/use in the original receiving operation. Screenshots alone are not that inspection.',
      nativeContinuation:'The existing receive.mjs owns native dlt load/reconciliation/acceptance and its complete Workspace handover. This continuation operates the same supplied review project and never starts a second native database course.'};
    course.save();atomicJson(course.path('RESULT.json'),state.result);return state.result;
  }catch(error){
    if(course){course.state.status='interrupted';course.state.error={message:String(error.message),at:now()};course.save();}
    throw error;
  }finally{
    let closeError=null;
    try{if(context)await context.close();}catch(error){closeError=error;}
    try{if(host)await host.close();}catch(error){closeError||=error;}
    if(closeError&&course){course.state.status='close_failed';course.state.error={message:String(closeError.message),at:now()};course.save();}
    await lease.close();
    if(closeError)throw closeError;
  }
}
export async function main(argv=process.argv.slice(2)){
  const options={};
  for(let i=0;i<argv.length;i++){
    const flag=argv[i];need(flag.startsWith('--'),'Use named browser receiving options.');
    const name=flag.slice(2);need(['project','output','playwright','chromium','python','operation','reviewer','resume'].includes(name)&&!Object.hasOwn(options,name),'Unknown or repeated receiving option: '+flag);
    if(name==='resume')options.resume=true;
    else{need(argv[i+1]&&!argv[i+1].startsWith('--'),'Supply a value for '+flag);options[name]=argv[++i];}
  }
  return runBrowserReceiving(options);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().then(value=>process.stdout.write(json(value))).catch(error=>{process.stderr.write(json({error:'LOADED_BIKES_BROWSER_RECEIVING',message:String(error.message)}));process.exitCode=1;});
