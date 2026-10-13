import {readFile,writeFile,mkdir,open,link,unlink,readdir,lstat} from 'node:fs/promises';
import {join,dirname,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile),need=(value,message)=>{if(!value)throw Error(message)};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
async function retain(path,body){
 const bytes=Buffer.from(body);await mkdir(dirname(path),{recursive:true,mode:0o700});
 const tmp=path+'.writing-'+randomUUID(),fd=await open(tmp,'wx',0o600);
 try{
  try{await fd.writeFile(bytes);await fd.sync()}finally{await fd.close()}
  try{await link(tmp,path)}catch(error){if(error.code!=='EEXIST')throw error;need((await readFile(path)).equals(bytes),'Previously retained hook output differs: '+path)}
  const dir=await open(dirname(path),'r');try{await dir.sync()}finally{await dir.close()}
 }finally{await unlink(tmp).catch(error=>{if(error.code!=='ENOENT')throw error})}
}
async function walk(root){const files=[];for(const name of (await readdir(root)).sort()){const path=join(root,name),s=await lstat(path);need(!s.isSymbolicLink(),'Unexpected project symlink');if(s.isDirectory())files.push(...await walk(path));else if(s.isFile())files.push(path);}return files;}
export async function receiveProjectBrowser({work,product,page,capture,exactOpen,download,result}){
 const checked={state:'RUNNING',controls:[],native:[],original_example_cells:15,original_unknown_cells:1,rendered_review:'Actual captured screens require the producing operator to open and LOOK.'};
 const attempt=join(work,result.attempt,'project-editor');await mkdir(attempt,{recursive:true,mode:0o700});
 const nativeRoot=join(work,'project-browser-native'),independent=join(work,'project-browser-independent');
 const click=async id=>{await page.locator('#'+id).click();checked.controls.push(id);result.controls.push('Project editor: '+id)};
 const projectMessage=async text=>page.waitForFunction(value=>document.getElementById('project-message').textContent.includes(value),text);
 const reviewMessage=async text=>page.waitForFunction(value=>document.getElementById('message').textContent.includes(value),text);
 async function openProject(file){await page.locator('#project-workspace-file').setInputFiles(file);await click('project-open');await projectMessage('Reopened all');}
 async function native(label,args){
  // The selected original Node runtime executes the original application CLI.
  const invocation=[join(product,'maritime-project-cli.mjs'),...args];
  let response;
  try{response=await execute(process.execPath,invocation,{cwd:product,maxBuffer:16*1024*1024});}
  catch(error){await retain(join(attempt,label+'.failed.json'),json({executable:process.execPath,args:invocation,stdout:error.stdout??'',stderr:error.stderr??'',code:error.code??null}));throw error;}
  await retain(join(attempt,label+'.stdout.json'),response.stdout);
  await retain(join(attempt,label+'.stderr.txt'),response.stderr);
  const value=JSON.parse(response.stdout);checked.native.push({label,args:invocation,...value});return value;
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.goto(pathToFileURL(join(product,'maritime-workbench.html')).href,{waitUntil:'load'});
 await openProject(join(work,'project-delivery','browser-workspace.json'));
 const nativeInitial=await download('project-json','native-project-in-browser-analysis');
 const initial=JSON.parse(await readFile(nativeInitial,'utf8'));
 need(initial.summary.selected_cells===15&&initial.summary.unknown_cells===1,'Native project browser reopen changed the retained original cells');
 await capture('native-project-reopened-in-browser',page);
 // Start a clean in-memory editor by reopening the unchanged offline application.
 await page.reload();need((await page.locator('#project-summary').innerText()).includes('project is empty'),'Fresh project is not empty');
 await capture('project-empty-desktop',page);await page.setViewportSize({width:390,height:844});await capture('project-empty-narrow',page);await page.setViewportSize({width:1440,height:1000});
 await page.locator('#project-id').fill('issuer-browser-project');await page.locator('#project-title').fill('Issuer documentation reporting project');
 await click('capacity-example');await reviewMessage('Review updated');
 await page.locator('#project-entry-title').fill('Capacity · February and March');await click('project-add');await projectMessage('Added');
 await click('traffic-example');await reviewMessage('Review updated');
 await page.locator('#project-entry-title').fill('Container traffic');await click('project-add');await projectMessage('Added');
 await page.locator('#project-entry-title').fill('Container traffic · exact original');await click('project-rename');
 await click('project-up');need(await page.locator('[data-project-edit]').first().getAttribute('data-project-edit')==='entry-2','Entry order did not change');
 await capture('project-two-original-entries-desktop',page);
 await page.locator('[data-project-edit="entry-1"]').click();checked.controls.push('Edit capacity entry');
 await page.locator('#from').fill('2022-03-01');await page.locator('#until').fill('2022-04-01');await page.locator('#compare-toggle').setChecked(false);await click('apply');await reviewMessage('Review updated');
 await page.locator('#project-entry-title').fill('Capacity · March review');await click('project-replace');
 await click('project-remove');need(await page.locator('[data-project-edit]').count()===1,'Entry was not removed');
 await click('project-undo');need(await page.locator('[data-project-edit]').count()===2,'Undo did not restore the complete project');
 await capture('project-edited-reordered-and-restored',page);
 await page.locator('[data-project-edit="entry-1"]').click();
 await page.locator('#from').fill('2021-01-01');await page.locator('#until').fill('2021-02-01');await page.locator('#compare-toggle').setChecked(false);await click('apply');await reviewMessage('contains no source observations');
 await page.locator('#project-entry-title').fill('Capacity · empty retained window');await click('project-add');
 await capture('project-explicit-empty-entry',page);
 await page.locator('[data-project-edit="entry-1"]').click();
 await page.locator('#from').fill('2022-02-01');await page.locator('#until').fill('2022-04-01');
 for(const [id,value]of [['before-from','2022-02-01'],['before-until','2022-03-01'],['after-from','2022-03-01'],['after-until','2022-04-01']])await page.locator('#'+id).fill(value);
 await page.locator('#compare-toggle').setChecked(true);await click('apply');await reviewMessage('Review updated');
 await page.locator('#project-entry-title').fill('Capacity · February and March');await click('project-replace');
 await page.locator('#project-title').fill('Issuer documentation reporting project · final');
 need(await page.locator('#project-save').isDisabled(),'Unapplied project title did not suspend export');await click('project-apply-meta');
 const saved=await download('project-save','complete-browser-project'),savedBytes=await readFile(saved),savedData=JSON.parse(savedBytes);
 need(savedData.entries.length===3&&savedData.sources.length===2,'Complete project did not retain/deduplicate its original pairs');
 const csv=await download('project-csv','complete-project-csv'),analysisFile=await download('project-json','complete-project-analysis'),report=await download('project-report','complete-project-report');
 const analysis=JSON.parse(await readFile(analysisFile,'utf8'));
 need(analysis.summary.selected_cells===15&&analysis.summary.unknown_cells===1&&analysis.summary.empty_entries===1,'Complete edited project changed the original source basis');
 need(analysis.entries[0].id==='entry-2'&&analysis.entries[1].id==='entry-1','Edited ordering was lost');
 need((await readFile(csv,'utf8')).split('\r\n').length-2===15,'Project CSV omitted selected cells');
 const reportText=await readFile(report,'utf8');
 need(reportText.includes('156663')&&reportText.includes('34850')&&reportText.includes('Unknown'),'Standalone report omits original selected values');
 need(!/href="(?:entries|originals|observations.csv|project-analysis.json|project.json|REOPEN.md)/.test(reportText),'Standalone report has native-only file links');
 await exactOpen(report,'complete-project-report-narrow',{narrow:true});await capture('project-complete-desktop',page);
 await page.setViewportSize({width:390,height:844});await capture('project-complete-narrow',page);
 await page.reload();await openProject(saved);await capture('project-cold-reopen-narrow',page);await page.setViewportSize({width:1440,height:1000});
 const reopened=await download('project-json','cold-reopened-project-analysis');need((await readFile(reopened)).equals(await readFile(analysisFile)),'Cold-reopened analysis differs');
 const malformed=structuredClone(savedData);malformed.sources[0].raw+=' ';
 const malformedPath=join(attempt,'changed-original-workspace.json');await retain(malformedPath,json(malformed));
 await page.locator('#project-workspace-file').setInputFiles(malformedPath);await click('project-open');await page.waitForFunction(()=>document.getElementById('project-message').classList.contains('error'));
 need((await page.locator('#project-message').innerText()).includes('preserved'),'Rejected import did not preserve the current project');await capture('changed-original-rejected-project-preserved',page);
 const afterRejection=await download('project-json','project-after-rejected-import');need((await readFile(afterRejection)).equals(await readFile(analysisFile)),'Failed reopen changed the existing project');
 // Exercise actual File.text cancellation with a real saved file and a visible user edit.
 await page.locator('#project-workspace-file').setInputFiles(saved);
 const loading=await page.evaluate(()=>{document.getElementById('project-open').click();const message=document.getElementById('project-message').textContent;const title=document.getElementById('project-title');title.value='Local title after canceled file read';title.dispatchEvent(new Event('input',{bubbles:true}));return message;});
 need(loading.includes('Reading complete project source'),'Actual project file read never entered loading');
 await page.waitForFunction(()=>!document.getElementById('project-open').disabled);
 need(await page.locator('#project-title').inputValue()==='Local title after canceled file read','Superseded project read overwrote current controls');
 await capture('project-file-read-canceled-by-current-edit',page);await openProject(saved);
 const first=await native('project-browser-import',['import-workspace','--workspace',saved,'--out',nativeRoot]);
 const again=await native('project-browser-import-repeat',['import-workspace','--workspace',saved,'--out',nativeRoot]);
 need(first.browser_roundtrip===true&&again.browser_roundtrip===true&&again.resumed===true,'Repeated native import did not reconcile complete project');
 await native('project-browser-inspect',['inspect','--project',nativeRoot]);
 const reopenedNative=await native('project-browser-independent',['reopen','--project',nativeRoot,'--out',independent]);need(reopenedNative.independent_reopen===true,'Independent native project did not reopen');
 await openProject(join(independent,'browser-workspace.json'));
 const roundtrip=await download('project-json','native-independent-back-to-browser');
 need((await readFile(roundtrip)).equals(await readFile(analysisFile)),'Browser → native → independent → browser result differs');
 await capture('independent-native-project-back-in-browser',page);await page.setViewportSize({width:390,height:844});await capture('independent-native-project-back-in-browser-narrow',page);
 for(const [root,label]of [[nativeRoot,'browser-import-native'],[independent,'browser-import-independent']]){
  await exactOpen(join(root,'report.html'),label+'-desktop');await exactOpen(join(root,'report.html'),label+'-narrow',{narrow:true});
  for(const path of await walk(root))await exactOpen(path,label+'-member-'+relative(root,path).replaceAll('/','-'),{captureImage:false});
 }
 checked.state='CAPTURED_REQUIRES_PIXEL_REVIEW';checked.saved_workspace={path:relative(work,saved),bytes:savedBytes.length,sha256:sha(savedBytes)};checked.summary=analysis.summary;
 return checked;
}
