// MIT. Supplied-page continuation of the original Awards receiving operation.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {parseIntakeWorkingFile} from "../../awards-intake-working.mjs";
import {parseAwardCsvText} from "../../awards-csv-source.mjs";

const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const eq=(a,b,message)=>assert.deepEqual(a,b,message);
async function originalFile(descriptor){
  assert(descriptor&&typeof descriptor.path==="string"&&Number.isSafeInteger(descriptor.bytes)&&/^[a-f0-9]{64}$/.test(descriptor.sha256),
    "Retain a complete original file descriptor through the existing receiver.");
  const bytes=new Uint8Array(await readFile(descriptor.path));
  eq({bytes:bytes.length,sha256:sha(bytes)},{bytes:descriptor.bytes,sha256:descriptor.sha256},"Read the exact retained download.");
  return {bytes,opened:parseIntakeWorkingFile(bytes)};
}
/**
 * Operates the caller's authenticated page and original retention callbacks.
 * The caller journals the complete returned result in its existing operation.
 * No host, browser process, controller or native application action is created.
 *
 * retainDownload(trigger,label) -> complete {path,bytes,sha256,filename?}.
 * captureViews(label) -> caller's original desktop/390px screenshot results.
 * reopenPage() -> reload/select the same native portfolio in this same context.
 * openIndependentPage() -> {page,retainDownload,captureViews,close}.
 * Callbacks retain each interrupted attempt's complete files separately.
 */
export async function runAwardIntakeWorkingReceiving({
  page,csvPath,roundId,actor,status="draft",columns,retainDownload,captureViews,reopenPage,openIndependentPage
}){
  assert(page&&typeof retainDownload==="function"&&typeof captureViews==="function"&&typeof reopenPage==="function",
    "Use the existing original browser and complete-file retention callbacks.");
  assert(typeof openIndependentPage==="function","Supply an independently authenticated page from the existing admitted browser.");
  assert(Array.isArray(columns)&&columns.every(v=>Array.isArray(v)&&v.length===2),"Use the original explicit column mapping.");
  const source=new Uint8Array(await readFile(csvPath)),parsed=parseAwardCsvText(new TextDecoder("utf-8",{fatal:true}).decode(source));
  assert(parsed.rows.length>0&&parsed.headers.length>0,"Use the original nonempty intake CSV.");
  const header=parsed.headers[Math.min(parsed.headers.length,20)-1],files=[],screenshots=[];
  const literals={reasonA:"Retained intake A · café 007",reasonB:"Retained intake B · later 0008",
    correction:"Unfinished café\nKeep 0007"};
  const dialog=()=>page.locator("#detail-dialog");
  const ready=async p=>{
    await p.waitForFunction(()=>{
      const d=document.querySelector("#detail-dialog"),b=d?.querySelector("#intake-working-save");
      return Boolean(d?.open&&b&&!b.disabled);
    });
    const errors=await p.locator("#detail-dialog [role=alert]").allTextContents();
    assert(!errors.some(x=>x.trim()),"The live intake reported: "+errors.filter(Boolean).join(" / "));
  };
  const click=async name=>{await dialog().getByRole("button",{name,exact:true}).click();await ready(page);};
  const close=async p=>{await p.locator("#close-detail").click();await p.locator("#detail-dialog").waitFor({state:"hidden"});};
  const saveFile=async(label,p=page,retain=retainDownload)=>{
    const descriptor=await retain(()=>p.locator("#intake-working-download").click(),label);
    const value=await originalFile(descriptor);files.push(descriptor);await ready(p);return value;
  };
  const assertWork=(opened,reason)=>{
    eq(sha(opened.csv),sha(source),"The complete original CSV is unchanged.");
    const work=opened.record.work,row=work.rowDecisions?.[0];
    assert(row,"Keep the original first source row.");
    eq(row.reason,reason,"Keep the exact selected working reason.");
    eq(row.correctionDrafts[header],literals.correction,"Keep inactive literal correction text.");
    assert(!Object.hasOwn(row.corrections,header),"The inactive correction must remain inactive.");
    eq(work.editorRow,0,"Reopen the actual source-row editor.");
    return work;
  };
  await page.getByRole("button",{name:"Import application CSV",exact:true}).click();
  await dialog().getByLabel("Original application CSV",{exact:true}).setInputFiles(csvPath);await ready(page);
  await dialog().getByLabel("Funding round",{exact:true}).selectOption(roundId);
  await dialog().getByLabel("Recording actor",{exact:true}).fill(actor);
  await dialog().getByLabel("Imported status",{exact:true}).selectOption(status);
  await click("Map CSV columns");
  for(const [name,column]of columns)await dialog().getByLabel(name,{exact:true}).selectOption(column);
  await click("Review original source rows");
  await click("Inspect original row 1");
  await dialog().getByLabel("Disposition for row 1",{exact:true}).selectOption("exception");
  await dialog().getByLabel("Reason / agreement for row 1",{exact:true}).fill(literals.reasonA);
  await dialog().getByLabel("Correct "+header+" in row 1",{exact:true}).check();
  await dialog().getByLabel("Working "+header+" in row 1",{exact:true}).fill(literals.correction);
  literals.correction=await dialog().getByLabel("Working "+header+" in row 1",{exact:true}).inputValue();
  await dialog().getByLabel("Correct "+header+" in row 1",{exact:true}).uncheck();
  await dialog().getByLabel("Working-copy label",{exact:true}).fill("Original receiving intake A");
  await click("Save working checkpoint");
  const a=await saveFile("intake-working-original-a");assertWork(a.opened,literals.reasonA);
  screenshots.push(...await captureViews("intake-working-original-a"));
  await close(page);await reopenPage();
  await page.getByRole("button",{name:"Saved intake work",exact:true}).click();await ready(page);
  await dialog().locator("#intake-library-list").selectOption(a.opened.record.id);
  await click("Inspect retained intake work");await click("Restore inspected working state");
  eq(await dialog().getByLabel("Reason / agreement for row 1",{exact:true}).inputValue(),literals.reasonA);
  eq(await dialog().getByLabel("Working "+header+" in row 1",{exact:true}).inputValue(),literals.correction);
  assert(!await dialog().getByLabel("Correct "+header+" in row 1",{exact:true}).isChecked());
  await dialog().getByLabel("Reason / agreement for row 1",{exact:true}).fill(literals.reasonB);
  await dialog().getByLabel("Working-copy label",{exact:true}).fill("Later receiving intake B");
  await click("Save working checkpoint");
  const b=await saveFile("intake-working-live-b");assertWork(b.opened,literals.reasonB);
  // Portable A branches in this same browser; it cannot overwrite newer B.
  await dialog().locator("#intake-working-open").setInputFiles(files[0].path);await ready(page);
  await click("Restore inspected working state");
  const restored=await saveFile("intake-working-restored-a");assertWork(restored.opened,literals.reasonA);
  assert(restored.opened.record.id!==a.opened.record.id,"Portable adoption creates a separate local record.");
  eq(restored.opened.record.importedRecord,a.opened.record,"Keep the complete imported record and its checkpoints.");
  await dialog().locator("#intake-library-list").selectOption(b.opened.record.id);
  await click("Inspect retained intake work");
  const bRetained=await retainDownload(()=>dialog().locator("#intake-inspected-download").click(),"intake-working-preserved-b");
  files.push(bRetained);const bAgain=await originalFile(bRetained);
  assertWork(bAgain.opened,literals.reasonB);
  eq(bAgain.opened.record.work,b.opened.record.work,"Restoring A preserves the complete live B state.");
  assert(bAgain.opened.record.checkpoints.length>=b.opened.record.checkpoints.length,"Preserve B's original checkpoints.");
  screenshots.push(...await captureViews("intake-working-library-preserved-a-b"));
  await close(page);
  const independent=await openIndependentPage();
  try{
    assert(independent.page&&typeof independent.retainDownload==="function"&&typeof independent.captureViews==="function"&&typeof independent.close==="function");
    const p=independent.page,d=p.locator("#detail-dialog");
    await p.getByRole("button",{name:"Saved intake work",exact:true}).click();await ready(p);
    await d.locator("#intake-working-open").setInputFiles(files[0].path);await ready(p);
    await d.locator("#intake-library-restore").click();await ready(p);
    eq(await d.getByLabel("Reason / agreement for row 1",{exact:true}).inputValue(),literals.reasonA);
    eq(await d.getByLabel("Working "+header+" in row 1",{exact:true}).inputValue(),literals.correction);
    const received=await saveFile("intake-working-independent-reopen",p,independent.retainDownload);
    assertWork(received.opened,literals.reasonA);
    eq(received.opened.record.importedRecord,a.opened.record,"The fresh browser retains the whole original record.");
    screenshots.push(...await independent.captureViews("intake-working-independent-reopen"));
    await close(p);
  }finally{await independent.close();}
  return {
    schema:"stellar-forge.awards-intake-working-receiving.v1",
    source:{bytes:source.length,sha256:sha(source)},originalWorkingRecord:a.opened.record.id,
    restoredWorkingRecord:restored.opened.record.id,
    workflow:{closeReload:true,inactiveCorrections:true,exactEditorPosition:true,
      sameBrowserPortableBranch:true,displacedWorkPreserved:true,independentCompleteFileReopen:true},
    files,screenshots,nativeApplicationWrites:0
  };
}
