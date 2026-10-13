// Operate the original local customer through its maintained MCP and browser.
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {receiveBrowserWorkspace} from './duckdb-browser-workspace-receiving.mjs';
const input=JSON.parse(await readFile(process.argv[2],'utf8'));
const output={schema:'stellar-forge.duckdb-analytical-node-receiving.v1',workspace_id:input.workspace_id,state:'RUNNING',steps:{}};
const need=(value,message)=>{if(!value)throw Error(message);};
const sha=value=>createHash('sha256').update(value).digest('hex');
const save=async()=>writeFile(join(input.directory,'node-receiving.json'),JSON.stringify(output,null,2)+'\n',{mode:0o600});
await save();
const {createNativeDuckDB}=await import(pathToFileURL(join(input.source_root,'stellar-forge/mcp-paid-agent/native-duckdb.mjs')));
await mkdir(input.native_root,{recursive:true,mode:0o700});
const native=createNativeDuckDB({manifest:{directory:input.native_root}});
let calls=0;
const call=async(operation,body={})=>{calls++;const value=await native.call({action:'duckdb',duckdbWorkspace:'OriginalAnalyticalSource',duckdbOperation:operation,duckdbRequest:body});return value.result;};
try{
 const registered=await native.register({name:'OriginalAnalyticalSource',database:input.workspace,sources:[]},{expectedWorkspaceId:input.workspace_id});
 need(registered.workspaceId===input.workspace_id,'Original MCP workspace changed');
 const status=await call('analytics-status');
 need(status.results>=3&&status.reports>=1,'Original analytical results missing');
 const definitions=await call('analytics-analyses',{offset:0,limit:1});
 need(definitions.analyses.length===1&&definitions.total>=2,'Original catalog pagination changed');
 const definition=await call('analytics-analysis',{id:input.analysis,revision:1});
 need(definition.revision===1,'Original historical analysis revision changed');
 const reviewed=await call('analytics-review',{definition:definition.definition});
 need(reviewed.review_sha256===definition.review.review_sha256,'Original native review changed through MCP');
 const result=await call('analytics-result',{id:input.result});
 const groups=[];let offset=0;
 for(;;){const page=await call('analytics-result-rows',{id:input.result,offset,limit:7});groups.push(...page.rows);if(page.next_offset===null){need(groups.length===page.total,'Original MCP result page was incomplete');break;}offset=page.next_offset;}
 const manifest=await call('analytics-export-manifest',{export_id:input.export.export_id});
 need(manifest.manifest_file.sha256===input.export.manifest_sha256&&manifest.archive_file.sha256===input.export.archive.sha256,'Original MCP export binding changed');
 const parts=[];let byteOffset=0;
 for(;;){
  const response=await call('file',{export_id:input.export.export_id,filename:manifest.archive_file.name,
      sha256:manifest.archive_file.sha256,byteOffset,maxBytes:65536});
  const file=response.file;
  need(file&&file.encoding==='base64'&&typeof file.data==='string','Original maintained file reader contract changed');
  const raw=Buffer.from(file.data,'base64');need(raw.length>0||manifest.archive_file.bytes===0,'Original MCP file chunk empty');parts.push(raw);
  if(file.nextByteOffset===null||file.nextByteOffset===undefined){need(byteOffset+raw.length===manifest.archive_file.bytes,'Original MCP archive stopped early');break;}
  need(file.nextByteOffset===byteOffset+raw.length,'Original MCP byte range changed');byteOffset=file.nextByteOffset;
 }
 const archive=Buffer.concat(parts);need(archive.length===manifest.archive_file.bytes&&sha(archive)===manifest.archive_file.sha256,'Complete original MCP archive changed');
 const received=join(input.directory,'mcp-analytical-workbook.zip');await writeFile(received,archive,{mode:0o600});
 output.steps.mcp={workspace_id:status.workspace_id,calls,complete_result_rows:groups.length,
    historical_revision:definition.revision,review_sha256:reviewed.review_sha256,
    archive:{name:'mcp-analytical-workbook.zip',bytes:archive.length,sha256:sha(archive)}};
 await save();
const browserInfo=await stat(input.browser);
need(browserInfo.isFile(),'Use the original retained browser executable');
const {chromium}=await import('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js');
const browser=await chromium.launch({headless:true,executablePath:input.browser,
 args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'],env:{...process.env,TMPDIR:input.directory}});
const errors=[],network=[];
try{
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}});
 const page=await context.newPage();page.setDefaultTimeout(30000);
 page.on('pageerror',error=>errors.push(String(error)));
 page.on('response',response=>{if(response.status()>=400)network.push({path:new URL(response.url()).pathname,status:response.status()});});
 const launch=new URL(input.launch);launch.pathname='/analytics/';
 await page.goto(launch.href,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>document.querySelector('#notice')?.textContent.includes('Original workspace opened.'));
 const visited=[];
 for(const screen of ['source','analysis','results','workbook','reports','requests']){
  await page.locator('[data-screen="'+screen+'"]').click();
  await page.locator('#screen-'+screen).waitFor({state:'visible'});visited.push(screen);
 }
 await page.locator('[data-screen="source"]').click();
 await page.locator('#source-edition').selectOption(input.original_edition);
 await page.locator('#open-source').click();
 await page.waitForFunction(()=>document.querySelector('#source-facts')?.textContent.includes('32'));
 await page.locator('[data-screen="analysis"]').click();
 await page.locator('#analysis-select').selectOption(input.analysis);
 await page.locator('#analysis-revision').fill('1');
 await page.locator('#open-analysis').click();
 await page.waitForFunction(()=>document.querySelector('#analysis-title')?.value.includes('Original source'));
 await page.locator('#analysis-form button[type="submit"]').click();
 await page.locator('#analysis-review').waitFor({state:'visible'});
 await page.waitForFunction(()=>!document.querySelector('#save-analysis')?.disabled);
 await page.locator('[data-screen="results"]').click();
 await page.locator('#result-kind').selectOption('results');
 await page.locator('#result-select').selectOption(input.result);
 await page.locator('#open-result').click();
 await page.waitForFunction(()=>document.querySelector('#result-grid')?.textContent.includes('Source group'));
 await page.locator('[data-screen="workbook"]').click();
 await page.locator('#workbook-select').selectOption(input.workbook);
 await page.locator('#workbook-revision').fill('2');
 await page.locator('#open-workbook').click();
 await page.waitForFunction(()=>document.querySelector('#workbook-pages')?.children.length>=6);
 const pageCount=await page.locator('#workbook-pages > *').count();
 await page.locator('[data-screen="reports"]').click();
 await page.locator('#report-select').selectOption(input.report);await page.locator('#open-report').click();
 await page.waitForFunction(()=>document.querySelector('#report-facts')?.textContent.includes('2'));
 await page.locator('#export-select').selectOption(input.export.export_id);await page.locator('#open-export').click();
 const [download]=await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button',{name:/^Download whole customer package/}).click()
 ]);
 const downloaded=join(input.directory,'browser-analytical-workbook.zip');await download.saveAs(downloaded);
 const actual=await readFile(downloaded);
 need(actual.length===input.export.archive.bytes&&sha(actual)===input.export.archive.sha256,'Actual browser package download changed');
 await page.screenshot({path:join(input.directory,'analytical-workbooks.png'),fullPage:true});
 need(errors.length===0&&network.length===0,'Original browser emitted a retained page/network error');
 output.steps.browser={screens:visited,source_rows:32,opened_analysis_revision:1,review_enabled:true,
     workbook_revision:2,workbook_pages:pageCount,report_id:input.report,
     download:{name:'browser-analytical-workbook.zip',bytes:actual.length,sha256:sha(actual)},
     screenshot:'analytical-workbooks.png',page_errors:errors,network_errors:network};
 await save();
 output.steps.browser_workspace=await receiveBrowserWorkspace({page,input,nativeCall:call,operationId:input.operation_id??'SCF-DUCKDB-ANALYTICAL-WORKBOOK-5EEE-20261012'});
 need(output.steps.browser_workspace.state==='COMPLETE','Complete original browser workspace receiving did not finish');
 output.steps.mcp.calls=calls;
 output.steps.browser.screens=[...visited,'browser'];
 await save();
 await page.screenshot({path:join(input.directory,'analytical-workbooks-browser-workspace.png'),fullPage:true});
 output.steps.browser.workspace_screenshot='analytical-workbooks-browser-workspace.png';
 need(errors.length===0&&network.length===0,'Original browser continuation emitted a retained page/network error');
 await save();
 await context.close();
}finally{await browser.close();}
}finally{await native.close();}
output.state='COMPLETE';output.completed_at=new Date().toISOString();await save();
console.log(JSON.stringify({state:output.state,steps:Object.keys(output.steps),workspace_id:output.workspace_id}));
