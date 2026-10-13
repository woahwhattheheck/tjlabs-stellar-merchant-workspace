// SPDX-License-Identifier: MIT
// The mapping workbook returns to the original complete-plan editor and mutation journal.
import {parseExactJSON, stringifyExactJSON} from "/vector/json.mjs";
const SOURCE = "starforge.gis-migration-workbook-source.v1";
const RETURN = "starforge.gis-migration-workbook-return.v1";
const MAX_FILE = 16 * 1024 * 1024, MAX_PAIR = 24 * 1024 * 1024;
const fileReads = new WeakMap();
const clone = value => parseExactJSON(stringifyExactJSON(value));
const shorten = value => String(value).length > 140 ? String(value).slice(0,140) + "…" : String(value);
const bytes = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
const base64 = value => {
  let text = "";
  for(let at=0;at<value.length;at+=32768)text+=String.fromCharCode(...value.subarray(at,at+32768));
  return btoa(text);
};
function saveBytes(name, value, type) {
  const url=URL.createObjectURL(new Blob([bytes(value)],{type}));
  const link=document.createElement("a");link.href=url;link.download=name;
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function readFile(file, limit=MAX_FILE) {
  if(!file)throw new Error("Choose the complete original file.");
  if(!file.size || file.size>limit)throw new Error("Keep each complete mapping input within "+Math.floor(limit/1024/1024)+" MiB.");
  const raw=new Uint8Array(await file.arrayBuffer());
  if(raw.length!==file.size)throw new Error("The selected file changed while opening.");
  return {base64:base64(raw),bytes:raw.length,filename:file.name};
}
export async function downloadMappingRegister(api, planId) {
  const result=await api("mapping-register",{planId});
  const raw=bytes(result.registerBase64);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",raw)),x=>x.toString(16).padStart(2,"0")).join("");
  if(raw.length!==result.file.bytes || hash!==result.file.sha256)
    throw new Error("The complete mapping register differs from its native file descriptor.");
  saveBytes("Mapping-Register.json",result.registerBase64,"application/json");
  return result;
}
function completeSource(selection) {
  if(!selection?.registerBase64 || !selection?.workbookBase64)
    throw new Error("Choose both the original Mapping-Register.json and its edited XLSX.");
  const total=bytes(selection.registerBase64).length+bytes(selection.workbookBase64).length;
  if(total>MAX_PAIR)throw new Error("Keep the complete register and XLSX together within 24 MiB.");
  return {schema:SOURCE,registerBase64:selection.registerBase64,workbookBase64:selection.workbookBase64,
    filename:selection.filename||"Edited-Mapping-Register.xlsx"};
}
export async function mappingWorkbookPanel(context) {
  const {h,panel,field,btn,select,table,cell,pager,detail,api,stash,render,downloadText,draft,plans,onAdopt,run}=context;
  const root=panel(h("h3",{},"Customer mapping workbook"),
    h("p",{},"Export a saved plan, review the white choice cells in its workbook, then return the complete revision here. Keep the original register beside the XLSX."));
  if(plans.length) {
    const planId=plans.some(row=>row.id===draft.workbookExportPlanId)?draft.workbookExportPlanId:plans[0].id;
    draft.workbookExportPlanId=planId;
    root.append(h("div",{class:"row"},
      field("Saved plan for the register",select(planId,plans.map(row=>[row.id,row.title+" · "+row.id.slice(0,12)]),async value=>{
        draft.workbookExportPlanId=value;await stash();
      })),
      btn("Export Mapping-Register.json",()=>downloadMappingRegister(api,draft.workbookExportPlanId||planId))));
  }
  const selected=draft.workbookSelection ||= {};
  const reads=fileReads.get(draft)||{ids:{},pending:new Set()};
  fileReads.set(draft,reads);
  const selectionId=()=>draft.workbookSelectionId ||= crypto.randomUUID();
  const changedSelection=()=>{
    draft.workbookSelectionId=crypto.randomUUID();
    delete draft.workbookProposal;delete draft.workbookProposalSelectionId;draft.workbookOffset=0;
  };
  const beginRead=kind=>{
    const id=crypto.randomUUID();
    if(kind==="return") {
      for(const key of ["register","workbook","return"])reads.ids[key]=id;
      reads.pending.clear();
    } else {
      reads.ids[kind]=id;
      if(reads.pending.has("return")){reads.ids.return=id;reads.pending.delete("return");}
    }
    reads.pending.add(kind);changedSelection();
    return id;
  };
  const reviewSelection=async()=>{
    if(reads.pending.size)throw new Error("Wait for the selected mapping files to finish opening before reviewing them.");
    const id=selectionId(),source=completeSource(draft.workbookSelection);
    const proposed=await api("workbook-propose",{source});
    if(selectionId()!==id)
      throw new Error("The workbook selection changed during review. Review the currently selected files.");
    draft.workbookProposal=proposed;draft.workbookProposalSelectionId=id;draft.workbookOffset=0;
    await stash();await render();
  };
  const choose=async(file,kind)=>{
    const id=beginRead(kind);
    try {
      const original=await readFile(file);
      if(reads.ids[kind]!==id)return;
      const current=draft.workbookSelection ||= {};
      if(kind==="register"){current.registerBase64=original.base64;current.registerFilename=original.filename;}
      else {current.workbookBase64=original.base64;current.filename=original.filename;}
      reads.pending.delete(kind);changedSelection();await stash();await render();
    } catch(error) {
      if(reads.ids[kind]!==id)return;
      reads.pending.delete(kind);throw error;
    }
  };
  root.append(h("div",{class:"row"},
    field("Original mapping register",h("input",{type:"file",accept:".json,application/json",onchange:event=>run(()=>choose(event.target.files[0],"register"))})),
    field("Reviewed XLSX workbook",h("input",{type:"file",accept:".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",onchange:event=>run(()=>choose(event.target.files[0],"workbook"))}))),
    h("p",{class:"muted"},(selected.registerFilename||"Register not selected")+" · "+(selected.filename||"Workbook not selected")),
    h("p",{class:"muted"},"Keep exported rows and gray source cells in their original order; filters are available. Add or remove keys, fields and project selections in the native editor. Long choices keep their complete original values and can be edited there."),
    h("div",{class:"toolbar"},btn("Review workbook changes",reviewSelection),
    field("Import complete workbook return",h("input",{type:"file",accept:".json,application/json",onchange:event=>run(async()=>{
      const id=beginRead("return");
      try {
        const original=await readFile(event.target.files[0],40*1024*1024);
        if(reads.ids.return!==id)return;
        const packet=parseExactJSON(new TextDecoder("utf-8",{fatal:true}).decode(bytes(original.base64)));
        if(packet?.schema!==RETURN || packet.source?.schema!==SOURCE)throw new Error("Choose the complete native workbook-return JSON.");
        const source=completeSource(packet.source);
        draft.workbookSelection={...source,registerFilename:"Mapping-Register.json"};
        reads.pending.delete("return");changedSelection();await stash();
        await reviewSelection();
      } catch(error) {
        if(reads.ids.return!==id)return;
        reads.pending.delete("return");throw error;
      }
    })}))));
  const proposed=draft.workbookProposalSelectionId===selectionId()?draft.workbookProposal:null;
  if(proposed) {
    const reviewedSource=()=>{
      if(draft.workbookProposal!==proposed || draft.workbookProposalSelectionId!==selectionId())
        throw new Error("The workbook selection changed. Review its current files before loading or exporting this plan.");
      return completeSource(draft.workbookSelection);
    };
    const changes=proposed.review.changes,offset=draft.workbookOffset||0,limit=25;
    root.append(h("h4",{},proposed.review.changedCells+" changed cells · "+proposed.review.changedChoices+" mapping choices"),
      h("p",{}, "Base plan "+proposed.basePlanId+" · source "+proposed.captureId),
      h("p",{class:"muted"},"A name, null rule or note edited on one composite-key member applies to that complete key. Conflicting edits need one agreed value."),
      table(["Worksheet / cell","Choice","Original","Proposed","Complete change"],changes.slice(offset,offset+limit).map(row=>h("tr",{},
        cell(row.sheet+" / "+row.column+row.row),cell(row.choice),cell(shorten(row.before),"long"),cell(shorten(row.after),"long"),
        cell(btn("Open",()=>detail("Workbook mapping choice",row),"small"))))),
      pager({offset,limit,total:changes.length,hasMore:offset+limit<changes.length},async value=>{
        draft.workbookOffset=value;await stash();await render();
      }),
      h("div",{class:"toolbar"},
        btn("Load complete plan into mapping editor",()=>onAdopt(clone(proposed),reviewedSource()),"primary"),
        btn("Download complete change review",()=>{
          reviewedSource();downloadText("mapping-workbook-review.json",stringifyExactJSON(proposed,2));
        }),
        btn("Save complete workbook return",()=>downloadText("mapping-workbook-return.json",stringifyExactJSON({
          schema:RETURN,source:reviewedSource(),proposal:proposed},2)))) );
  }
  if(draft.workbookSource && draft.workbookReview) {
    const source=draft.workbookSource,review=draft.workbookReview;
    root.append(h("h4",{},"Workbook attached to the current draft"),
      h("p",{},"The complete input pair will travel with this draft when you save its plan. Further native editor changes receive their own comparison."),
      h("p",{class:"code"},review.basePlanId),
      h("div",{class:"toolbar"},
        btn("Original register",()=>saveBytes("Mapping-Register.json",source.registerBase64,"application/json")),
        btn("Imported workbook",()=>saveBytes(source.filename||"Edited-Mapping-Register.xlsx",source.workbookBase64,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")),
        btn("Imported proposal",()=>detail("Complete workbook proposal",review))));
  }
  return root;
}
export function savedWorkbookPanel({h,panel,table,cell,btn,download,inputs,planId}) {
  const rows=inputs.filter(row=>row.kind==="mapping-workbook"&&row.planId===planId);
  if(!rows.length)return null;
  return panel(h("h3",{},"Retained mapping workbooks"),
    h("p",{},"These original workbooks, registers, proposed plans, saved plans and complete edit reviews are included in the whole workspace handover."),
    ...rows.map(row=>h("div",{},
      h("p",{class:"code"},"Original plan "+row.basePlanId),
      table(["Retained file","Bytes","Open"],row.files.map(file=>h("tr",{},
        cell(file.path.split("/").pop()),cell(file.bytes),cell(btn("Download",()=>download(file.path),"small"))))))));
}
