// MIT. Immutable full report editions, native PDF production and exact file receiving.
import { readFile, lstat, open, unlink, link } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { privateDirectory, atomicJson, readPrivateJson, withPrivateLock } from '../../routescan/quota.mjs';
import { need, plain, canonical, clone, csvCell } from './model.mjs';
import { digest, sha256 } from './source.mjs';
import { validateQcewReport, compareQcewReports } from './calculate.mjs';
import { buildQcewReportFiles } from './report.mjs';
const run=promisify(execFile), MAX_FILE=48*1024*1024, HASH=/^[a-f0-9]{64}$/;
export const QCEW_FILES='stellar-forge.qcew-report-files.v1';
export const QCEW_RENDERER='stellar-forge.qcew-report-renderer.v1';
const baseNames=['report.html','report.json','data.csv','source-rows.csv','methodology.md'];
const allowedNames=new Set([...baseNames,'changes.json','changes.csv','report.pdf']);
function identity(manifest) {
  return {schema:manifest.schema,editionId:manifest.editionId,reportId:manifest.reportId,
    previousEditionId:manifest.previousEditionId,formats:manifest.formats,renderer:manifest.renderer,files:manifest.files};
}
function editionIdentity(reportId,previousEditionId,formats) { return digest({schema:QCEW_FILES,reportId,previousEditionId,formats}); }
function rootFor(directory,id) {
  need(HASH.test(id),'Choose a saved report edition.');
  return join(resolve(directory),'qcew','editions',id);
}
function fileBytes(file) {
  need(plain(file)&&allowedNames.has(file.name)&&['utf8','base64'].includes(file.encoding)&&typeof file.body==='string',
    'The complete report file is invalid.');
  const bytes=Buffer.from(file.body,file.encoding==='utf8'?'utf8':'base64');
  need(bytes.length<=MAX_FILE && (file.encoding!=='base64'||bytes.toString('base64')===file.body),
    'The complete report file encoding or capacity differs.');
  return bytes;
}
function serializeFile(name,contentType,bytes) {
  return {name,contentType,bytes:bytes.length,sha256:sha256(bytes),
    encoding:name==='report.pdf'?'base64':'utf8',body:bytes.toString(name==='report.pdf'?'base64':'utf8')};
}
function changesCsv(changes) {
  const header=['industry','label','previous_period','current_period','employment_before','employment_before_status','employment_after','employment_after_status',
    'weekly_wage_before','weekly_wage_before_status','weekly_wage_after','weekly_wage_after_status','price_base_before','price_base_after'];
  const rows=changes.rows.map(row=>[row.industry,row.label,changes.previousPeriod,changes.currentPeriod,
    row.employmentBefore?.value,row.employmentBefore?.status,row.employmentAfter.value,row.employmentAfter.status,
    row.weeklyWageBefore?.value,row.weeklyWageBefore?.status,row.weeklyWageAfter.value,row.weeklyWageAfter.status,
    row.wagePriceBasisBefore,row.wagePriceBasisAfter].map(csvCell).join(','));
  return header.map(csvCell).join(',')+'\r\n'+rows.join('\r\n')+'\r\n';
}
function expectedTextFiles(report,previousReport) {
  const files=buildQcewReportFiles(report).map(file=>serializeFile(file.name,file.contentType,Buffer.from(file.body,'utf8')));
  if(previousReport) {
    const changes=compareQcewReports(previousReport,report);
    files.push(serializeFile('changes.json','application/json',Buffer.from(JSON.stringify(changes,null,2)+'\n')));
    files.push(serializeFile('changes.csv','text/csv; charset=utf-8',Buffer.from(changesCsv(changes))));
  }
  return files;
}
async function optionalManifest(root) {
  try {return await readPrivateJson(join(root,'manifest.json'),256*1024);}
  catch(error) {if(error.code==='ENOENT')return null;throw error;}
}
async function writeOwned(root,name,bytes) {
  need(allowedNames.has(name),'Choose a complete report member.');
  const path=join(root,name),temporary=join(root,'.stage-'+name+'-'+randomUUID());
  const file=await open(temporary,'wx',0o600);
  try {
    await file.writeFile(bytes);await file.sync();await file.close();
    try {await link(temporary,path);}
    catch(error) {
      if(error.code!=='EEXIST')throw error;
      const stat=await lstat(path);
      need(stat.isFile()&&!stat.isSymbolicLink()&&stat.size===bytes.length,'The retained report member has another shape.');
      need(sha256(await readFile(path))===sha256(bytes),'The retained report member contains other bytes.','QCEW_REPORT_CONFLICT',409);
    }
  } finally {await file.close().catch(()=>{});await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
async function renderPdf(root,browserPath) {
  need(typeof browserPath==='string'&&browserPath.startsWith('/'),'Configure the existing native Chromium executable for PDF production.');
  const browser=await lstat(browserPath);
  need(browser.isFile()||browser.isSymbolicLink(),'The configured Chromium executable is not available.');
  const userData=await privateDirectory(join(root,'.chromium')),pdfPath=join(root,'report.pdf');
  let version;
  try {version=(await run(browserPath,['--version'],{timeout:15000,maxBuffer:65536,env:{...process.env,TMPDIR:userData}})).stdout.trim();}
  catch {need(false,'The native Chromium executable did not return its version.','QCEW_PDF_EXECUTION',502);}
  need(version.length>0&&version.length<=500,'The native renderer version is invalid.');
  // A prior interrupted attempt may leave this operation's own incomplete PDF.
  try {
    const stat=await lstat(pdfPath);
    need(stat.isFile()&&!stat.isSymbolicLink(),'The native report PDF path belongs to another file type.');
    await unlink(pdfPath);
  } catch(error) {if(error.code!=='ENOENT')throw error;}
  const startedAt=new Date().toISOString();
  try {
    await run(browserPath,['--headless','--disable-gpu','--no-sandbox','--disable-dev-shm-usage',
      '--no-pdf-header-footer','--run-all-compositor-stages-before-draw','--no-first-run',
      '--user-data-dir='+userData,'--print-to-pdf='+pdfPath,pathToFileURL(join(root,'report.html')).href],
      {timeout:90000,maxBuffer:1024*1024,env:{...process.env,TMPDIR:userData}});
  } catch {need(false,'Native PDF production did not complete; resume this same report operation.','QCEW_PDF_EXECUTION',502);}
  const stat=await lstat(pdfPath);
  need(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>8&&stat.size<=MAX_FILE,'The native PDF output is incomplete.');
  const bytes=await readFile(pdfPath);
  need(bytes.subarray(0,5).toString('ascii')==='%PDF-','The native renderer did not produce a PDF.');
  return {file:serializeFile('report.pdf','application/pdf',bytes),
    receipt:{engine:'Chromium',version,startedAt,completedAt:new Date().toISOString(),input:'report.html',inputSha256:sha256(await readFile(join(root,'report.html')))}};
}
export function validateQcewFilePackage(packet,{report,previousReport=null,expectedEdition=null,rebuildText=true}={}) {
  need(plain(packet)&&packet.manifest?.schema===QCEW_FILES&&Array.isArray(packet.files),'Receive every original report member and its manifest.');
  const manifest=packet.manifest;
  need(HASH.test(manifest.reportId)&&HASH.test(manifest.editionId)&&
    (manifest.previousEditionId===null||HASH.test(manifest.previousEditionId))&&manifest.renderer?.html===QCEW_RENDERER&&
    ['["html"]','["html","pdf"]'].includes(JSON.stringify(manifest.formats))&&
    manifest.editionId===editionIdentity(manifest.reportId,manifest.previousEditionId,manifest.formats)&&manifest.manifestSha256===digest(identity(manifest)),
    'The retained report file identity changed.');
  need(Array.isArray(manifest.files)&&manifest.files.length===packet.files.length&&
    new Set(manifest.files.map(file=>file.name)).size===manifest.files.length&&
    new Set(packet.files.map(file=>file.name)).size===packet.files.length,'The complete report member inventory changed.');
  const files=new Map();
  for(const file of packet.files) {
    const bytes=fileBytes(file),expected=manifest.files.find(item=>item.name===file.name);
    need(expected&&expected.bytes===bytes.length&&expected.sha256===sha256(bytes)&&
      file.bytes===expected.bytes&&file.sha256===expected.sha256&&file.contentType===expected.contentType,
      'A complete report member changed.');
    files.set(file.name,{file,bytes});
  }
  need(baseNames.every(name=>files.has(name)),'The saved report is missing a complete original member.');
  if(manifest.previousEditionId!==null) need(files.has('changes.json')&&files.has('changes.csv'),'The successor edition is missing its full comparison.');
  else need(!files.has('changes.json')&&!files.has('changes.csv'),'An initial edition cannot carry an unbound predecessor comparison.');
  let savedReport;
  try {savedReport=JSON.parse(files.get('report.json').bytes.toString('utf8'));} catch {need(false,'The original report JSON is invalid.');}
  validateQcewReport(savedReport);
  need(savedReport.id===manifest.reportId&&(!report||canonical(report)===canonical(savedReport)),
    'The report files belong to another complete model.');
  if(expectedEdition) need(expectedEdition.id===manifest.editionId&&expectedEdition.reportId===manifest.reportId&&
    expectedEdition.manifestSha256===manifest.manifestSha256&&expectedEdition.previousEditionId===manifest.previousEditionId&&canonical(expectedEdition.formats)===canonical(manifest.formats),
    'The report files differ from the retained project edition.');
  if(rebuildText) {
    need(Boolean(previousReport)===(manifest.previousEditionId!==null),'Validate the original predecessor when reopening successor files.');
    for(const expected of expectedTextFiles(savedReport,previousReport)) {
      const actual=files.get(expected.name);
      need(actual&&actual.file.sha256===expected.sha256&&actual.file.bytes===expected.bytes,
        'The complete report output differs from its saved source model and renderer version.');
    }
  }
  need(files.has('report.pdf')===manifest.formats.includes('pdf'),'The retained output selection differs from its complete files.');
  if(files.has('report.pdf')) {
    const pdf=files.get('report.pdf'),receipt=manifest.renderer.pdf;
    need(pdf.bytes.subarray(0,5).toString('ascii')==='%PDF-'&&receipt?.engine==='Chromium'&&typeof receipt.version==='string'&&
      receipt.input==='report.html'&&receipt.inputSha256===files.get('report.html').file.sha256,
      'The native PDF is not bound to the original report HTML.');
  } else need(manifest.renderer.pdf===null,'The native PDF receipt has no corresponding complete file.');
  return {manifest,report:savedReport,files:packet.files};
}
export async function prepareQcewFiles(directory,{report,previousEdition=null,browserPath=null}={}) {
  validateQcewReport(report);
  const previousReport=previousEdition?.report??null,previousEditionId=previousEdition?.manifest.editionId??null;
  const formats=browserPath?['html','pdf']:['html'];
  const editionId=editionIdentity(report.id,previousEditionId,formats),root=await privateDirectory(rootFor(directory,editionId));
  return withPrivateLock(root,'report.lock',async()=>{
    const retained=await optionalManifest(root);
    if(retained) {
      const packet=await readQcewFiles(directory,editionId,{expectedManifest:retained});
      validateQcewFilePackage(packet,{report,previousReport});
      need(Boolean(retained.renderer.pdf)===Boolean(browserPath),'This saved report edition uses another output format selection.','QCEW_REPORT_CONFLICT',409);
      return packet;
    }
    const files=expectedTextFiles(report,previousReport);
    for(const file of files) await writeOwned(root,file.name,fileBytes(file));
    let pdf=null;
    if(browserPath) {
      const result=await renderPdf(root,browserPath);files.push(result.file);pdf=result.receipt;
    }
    const manifest={schema:QCEW_FILES,editionId,reportId:report.id,previousEditionId,formats,
      renderer:{html:QCEW_RENDERER,pdf},files:files.map(({name,contentType,bytes,sha256})=>({name,contentType,bytes,sha256}))};
    manifest.manifestSha256=digest(identity(manifest));
    const packet={manifest,files};
    validateQcewFilePackage(packet,{report,previousReport});
    await atomicJson(root,'manifest.json',manifest,{exclusive:true});
    return packet;
  });
}
export async function readQcewFiles(directory,editionId,{expectedManifest=null}={}) {
  const root=rootFor(directory,editionId),manifest=expectedManifest??await readPrivateJson(join(root,'manifest.json'),256*1024);
  need(manifest.editionId===editionId&&Array.isArray(manifest.files),'The report directory belongs to another saved edition.');
  const files=[];
  for(const entry of manifest.files) {
    need(allowedNames.has(entry.name),'The saved report contains an unknown member.');
    const path=join(root,entry.name),stat=await lstat(path);
    need(stat.isFile()&&!stat.isSymbolicLink()&&stat.size===entry.bytes&&stat.size<=MAX_FILE,'The saved report member is unavailable.');
    files.push(serializeFile(entry.name,entry.contentType,await readFile(path)));
  }
  const packet={manifest,files};validateQcewFilePackage(packet,{rebuildText:false});return packet;
}
export async function receiveQcewFiles(directory,packet,{report,previousReport=null,expectedEdition=null}={}) {
  const validated=validateQcewFilePackage(packet,{report,previousReport,expectedEdition});
  const root=await privateDirectory(rootFor(directory,validated.manifest.editionId));
  return withPrivateLock(root,'report.lock',async()=>{
    const retained=await optionalManifest(root);
    if(retained) {
      need(canonical(retained)===canonical(packet.manifest),'The receiving directory contains another report edition.','QCEW_REPORT_CONFLICT',409);
      const original=await readQcewFiles(directory,retained.editionId,{expectedManifest:retained});
      validateQcewFilePackage(original,{report,previousReport,expectedEdition});
      return original;
    }
    for(const file of packet.files) await writeOwned(root,file.name,fileBytes(file));
    await atomicJson(root,'manifest.json',packet.manifest,{exclusive:true});
    return packet;
  });
}
export function qcewEditionDirectory(directory,editionId) { return rootFor(directory,editionId); }
export function qcewMemberBytes(file) { return fileBytes(file); }
