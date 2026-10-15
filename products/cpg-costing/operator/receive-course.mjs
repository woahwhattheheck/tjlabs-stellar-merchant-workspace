/* MIT. One complete authored operator-session receiving course, using unchanged production APIs. */
export function runOperatorCourse(api,createSessionAPI,codec,authoredContent){
 let sequence=0;const at="2026-10-14T23:00:00Z",S=createSessionAPI(api,{encode:codec.utf8Encode,sha256:t=>codec.sha256Bytes(codec.utf8Encode(t))},{id:()=>"authored-operator-"+(++sequence),now:()=>at}),checks=[];
 const assert=(v,m)=>{if(!v)throw Error(m);},hash=t=>codec.sha256Bytes(codec.utf8Encode(t)),clone=x=>JSON.parse(JSON.stringify(x));
 let blank=S.create({title:"Authored operator receiving",createdAt:at,input:api.blankInput()});
 blank.draft.actor="Authored reviewer";blank.draft.rawInput='{"unfinished":';blank.draft.mapping.raw='{"id":';
 const blankText=JSON.stringify(S.pack(blank)),reopened=S.receive(blankText);
 assert(reopened.draft.rawInput===blank.draft.rawInput&&reopened.draft.mapping.raw===blank.draft.mapping.raw,"Invalid raw draft was lost");checks.push("Blank draft-only session retains exact unfinished input and mapping through export/reopen");
 const original=api.importWorkspace(authoredContent),incoming=S.create({title:"Authored supplied workspace",createdAt:at,input:api.blankInput()});incoming.workspace=original;incoming.draft.selectedEditionId=original.editions.at(-1).id;
 let session=S.replace(blank,incoming,"Authored example receive");
 assert(session.backups.length===1&&session.backups[0].snapshot.draft.rawInput==='{"unfinished":',"Draft-only prior state missing");checks.push("Complete example receive retains zero-operation previous draft");
 const chosen=original.editions.at(-1);session.draft.rawInput=JSON.stringify(chosen.input,null,2);session.draft.name="Authored named corrected edition";session.draft.actor="Authored reviewer";session.draft.note="Reopen and source-preservation course; selected input remains unchanged.";session.draft.parentEditionId=chosen.id;
 const preview=S.preview(session),stale=clone(session);stale.draft.name+=" changed";let rejected=false;try{S.save(stale,preview);}catch{rejected=true;}assert(rejected,"Stale preview accepted");
 const saved=S.save(session,preview);session=saved.session;assert(session.workspace.editions.at(-1).preparedBy==="Authored reviewer"&&session.workspace.editions.at(-1).parentEditionId===chosen.id,"Correction identity missing");
 checks.push("Exact preview binds current draft and freezes named parent-linked edition");
 session.workspace=api.review(session.workspace,{editionId:saved.editionId,decision:"approved",reviewer:"Authored receiver",note:"Approved only for this fictional source receiving exercise."},S.meta(session,"authored-operator-review"));
 const compared=api.compare(session.workspace,chosen.id,saved.editionId);assert(compared.rows.every(r=>r.delta===null||r.delta==="0"),"Identical selected input changed calculation");checks.push("Selected edition comparison and named review preserve every original");
 session.draft.review.note="Unfinished further review";session.draft.rowEdit={group:"lots",index:0,raw:'{"partlyEdited":',original:JSON.stringify(chosen.input.lots[0])};
 const carrier=JSON.stringify(S.pack(session));const cold=S.receive(carrier);assert(cold.draft.rowEdit.raw==='{"partlyEdited":'&&cold.draft.review.note==="Unfinished further review","Pending review/row lost");
 const exact=api.exportWorkspace(cold.workspace);assert(api.importWorkspace(exact.content).rootSha256===cold.workspace.rootSha256,"Cold domain reopen changed root");
 for(const s of original.sources){const after=cold.workspace.sources.find(x=>x.id===s.id);assert(after&&after.content_base64===s.content_base64&&after.bodySha256===s.bodySha256,"An original source changed");}
 checks.push("Complete working and domain cold reopen retain pending row, review and all exact originals");
 const restored=S.restoreBackup(cold,cold.backups[0].id);assert(restored.draft.rawInput==='{"unfinished":'&&restored.backups.some(b=>b.snapshot.workspace.rootSha256===cold.workspace.rootSha256),"Restoring previous session discarded current state");checks.push("Restoring prior unfinished work retains current complete session");
 const broken=JSON.parse(carrier);broken.session.draft.actor="changed";let mismatch=false;try{S.receive(JSON.stringify(broken));}catch{mismatch=true;}assert(mismatch,"Edited carrier identity accepted");checks.push("Changed received carrier rejects transactionally");
 return {schema:"commons.costing-operator-receive-result.v1",runtime:"Production pure JavaScript APIs; authored source only",checks,sourceCount:cold.workspace.sources.length,editionCount:cold.workspace.editions.length,reviewCount:cold.workspace.reviews.length,workspaceRoot:cold.workspace.rootSha256,carrierBytes:codec.utf8Encode(carrier).length,carrierSha256:hash(carrier),working:JSON.parse(carrier)};
}
