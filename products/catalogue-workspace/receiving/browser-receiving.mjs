// SPDX-License-Identifier: MIT
// Consume the original operator's authenticated Playwright Pages; never launch a browser or create a session.
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const demand = (value, message) => { if (!value) throw new Error(message); };
const serial = value => JSON.stringify(value, null, 2) + '\n';
async function fileInfo(file){const hash=createHash('sha256');let bytes=0;for await(const part of createReadStream(file)){bytes+=part.length;hash.update(part);}return {bytes,sha256:hash.digest('hex')};}
async function save(file, value) {
  const bytes = Buffer.from(serial(value));
  await writeFile(file + '.part', bytes, {mode:0o600});
  await rename(file + '.part', file);
  return {path:file,bytes:bytes.length,sha256:sha(bytes)};
}

/**
 * request.schema = tjl.catalogue.browser-receiving.v1
 * {operation_id,project_id,source_url,target_url,review_id,capture_id}
 * courseState is the complete ORIGINAL receive-native.py result after native handover.
 * Pages come from the existing commissioned browser, already authenticated to their actual selected sites.
 */
export async function runCatalogueBrowserReceiving({sourcePage,targetPage,request,courseState,outputDirectory}) {
  demand(request?.schema === 'tjl.catalogue.browser-receiving.v1', 'Select the exact original browser request.');
  demand(request.operation_id === courseState.operation_id && request.project_id === courseState.project_id,
    'Bind this browser course to the original native receiving operation/project.');
  demand(courseState.handover?.catalogue_reopened && courseState.catalogue_download,
    'Complete original native full-project receiving before this following browser course.');
  demand(path.isAbsolute(outputDirectory), 'Select an absolute private output directory.');
  await mkdir(outputDirectory,{recursive:true,mode:0o700});
  const binding = {request,native_request_sha256:courseState.request_sha256,
    archive:courseState.handover.archive,catalogue_sha256:courseState.catalogue_download.sha256};
  const bindingFile=path.join(outputDirectory,'binding.json');
  try {
    demand(serial(JSON.parse(await readFile(bindingFile,'utf8'))) === serial(binding),
      'The original browser receiving selection changed.');
  } catch(error) {
    if(error.code !== 'ENOENT')throw error;
    await save(bindingFile,binding);
  }
  let report={schema:'tjl.catalogue.browser-receiving-result.v1',operation_id:request.operation_id,
    project_id:request.project_id,state:'RUNNING',sites:[],images:[],downloads:[],visual_inspection_required:true};
  const resultFile=path.join(outputDirectory,'result.json');
  try {
    const old=JSON.parse(await readFile(resultFile,'utf8'));
    demand(old.operation_id===request.operation_id&&old.project_id===request.project_id,'Original browser result differs.');
    report=old;
    if(report.state==='CAPTURED_AWAITING_VISUAL_INSPECTION')return report;
  } catch(error) { if(error.code!=='ENOENT')throw error; }
  const responseFor=(page,action)=>page.waitForResponse(response=>{
    if(response.request().method()!=='POST')return false;
    try{return JSON.parse(response.request().postData()||'{}').action===action;}catch{return false;}
  });
  async function clickResult(page,selector,action) {
    const promised=responseFor(page,action);
    await page.locator(selector).click();
    const response=await promised;
    const result=await response.json();
    demand(result.schema==='tjl.catalogue.workspace-result.v1'&&result.action===action&&
      result.state==='COMPLETE'&&(result.project_id===request.project_id||action==='engine'),
      'The actual browser/native response needs attention: '+action);
    await page.locator('#workspace').evaluate(async node=>{
      if(!node.hasAttribute('aria-busy'))return;
      await new Promise(resolve=>{const observer=new MutationObserver(()=>{
        if(!node.hasAttribute('aria-busy')){observer.disconnect();resolve();}
      });observer.observe(node,{attributes:true,attributeFilter:['aria-busy']});});
    });
    return result;
  }
  async function capture(page,role,label) {
    const filename=path.join(outputDirectory,role+'-'+label+'-'+String(report.images.length+1).padStart(4,'0')+'.png');
    await page.screenshot({path:filename,fullPage:true});
    const bytes=await readFile(filename);
    const row={role,label,path:filename,bytes:bytes.length,sha256:sha(bytes)};
    report.images.push(row);await save(resultFile,report);return row;
  }
  async function download(page,role,selector,name,expectedSha=null) {
    const event=page.waitForEvent('download');
    await (typeof selector==='string'?page.locator(selector):selector).click();
    const original=await event;
    demand(!(await original.failure()),'The original browser download failed.');
    const file=path.join(outputDirectory,role+'-'+String(report.downloads.length+1).padStart(4,'0')+'-'+name);
    await original.saveAs(file);
    const measured=await fileInfo(file),actual=measured.sha256;
    if(expectedSha)demand(actual===expectedSha,'Browser download differs from the original native file.');
    const row={role,path:file,suggested_filename:original.suggestedFilename(),bytes:measured.bytes,sha256:actual};
    report.downloads.push(row);await save(resultFile,report);return row;
  }
  for(const [role,page,url] of [['source',sourcePage,request.source_url],['target',targetPage,request.target_url]]) {
    if(report.sites.some(site=>site.role===role))continue;
    demand(page&&typeof page.goto==='function','Use the existing actual authenticated '+role+' Page.');
    const selected=new URL(url);
    demand(['http:','https:'].includes(selected.protocol)&&!selected.username&&!selected.password,
      'Use the original native operator URL without embedded credentials.');
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.locator('#workspace[data-api][data-actor]').waitFor();
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent && !document.querySelector('#workspace')?.hasAttribute('aria-busy'));
    await page.locator('#project-id').fill(request.project_id);
    const project=await clickResult(page,'#open-project','project');
    demand(project.result.project.id===request.project_id,'Wrong original native project opened.');
    await capture(page,role,'project-wide');
    await page.locator('[data-tab="cohort"]').click();
    await page.locator('#capture-select').selectOption(request.capture_id);
    let cohort=await clickResult(page,'#open-capture','cohort'),rows=[...cohort.result.rows],pages=1;
    while(cohort.result.next_offset!==null) {
      cohort=await clickResult(page,'#cohort-next','cohort');rows.push(...cohort.result.rows);pages++;
    }
    demand(JSON.stringify(rows.map(row=>row.identifier))===JSON.stringify(project.result.project.selection.identifiers),
      'The actual browser cohort did not traverse the complete original selection.');
    if(pages>1)await clickResult(page,'#cohort-previous','cohort');
    await capture(page,role,'cohort-wide');
    await page.locator('[data-tab="original"]').click();
    await page.locator('#record-kind').selectOption('review');
    await page.locator('#record-id').fill(request.review_id);
    const reviewed=await clickResult(page,'#read-record','record');
    demand(reviewed.result.id===request.review_id,'The actual original review differs.');
    for(const details of await page.locator('#tab-review details').all()) {
      if(!(await details.evaluate(node=>node.open)))await details.locator('summary').click();
    }
    if(reviewed.result.kind==='IMPORT') {
      await page.locator('#field-search').fill('locale');
      await page.locator('#field-search').fill('');
      if(await page.locator('#field-next').isEnabled()) {
        await page.locator('#field-next').click();await page.locator('#field-previous').click();
      }
      await download(page,role,'#download-review','review.json');
    }
    await capture(page,role,'review-wide');
    await page.locator('[data-tab="operations"]').click();
    await clickResult(page,'#refresh-operations','project');
    const firstInspect=page.locator('#operation-rows button').filter({hasText:'Inspect current result'}).first();
    if(await firstInspect.count()) {
      const response=responseFor(page,'operation');await firstInspect.click();
      const actual=await (await response).json();
      demand(actual.schema==='tjl.catalogue.workspace-result.v1'&&actual.project_id===request.project_id,
        'Original operation did not open.');
      const details=page.locator('#tab-operations details');
      if(!(await details.evaluate(node=>node.open)))await details.locator('summary').click();
    }
    await capture(page,role,'operations-wide');
    await page.locator('[data-tab="files"]').click();
    const files=await clickResult(page,'#refresh-files','files');
    const wanted=courseState.catalogue_download.sha256;
    demand(files.result.files.some(file=>file.sha256===wanted),'The original complete ZIP is absent from this received project.');
    const link=page.locator('#file-rows tr').filter({hasText:wanted}).locator('a');
    demand(await link.count()===1,'Select the exact original archive download.');
    await download(page,role,link,'original-catalogue.zip',wanted);
    await capture(page,role,'files-wide');
    await page.setViewportSize({width:390,height:844});
    for(const tab of ['project','cohort','review','operations','files','original']) {
      await page.locator('[data-tab="'+tab+'"]').click();
      await capture(page,role,tab+'-narrow');
    }
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent && !document.querySelector('#workspace')?.hasAttribute('aria-busy'));
    await page.locator('#project-id').fill(request.project_id);
    const reopened=await clickResult(page,'#open-project','project');
    demand(reopened.result.project.id===project.result.project.id,'Original browser project did not reopen after reload.');
    report.sites.push({role,url,page_title:await page.title(),actor:await page.locator('#workspace').getAttribute('data-actor'),
      project_id:request.project_id,capture_id:request.capture_id,review_id:request.review_id,cohort_pages:pages,
      identifiers:rows.map(row=>row.identifier),native_project:reopened});
    await save(resultFile,report);
  }
  report.state='CAPTURED_AWAITING_VISUAL_INSPECTION';
  report.instruction='The original producing operator must open and LOOK at these actual wide/narrow images and downloaded files. This capture is not visual acceptance.';
  report.completed_at=new Date().toISOString();
  await save(resultFile,report);
  return report;
}
