// MIT. Whole original source, current session, selected report and all managed history.
import {readFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {codec,core,sessions} from '../runtime.mjs';
import {buildHardwareDesk} from '../operator/build.mjs';
import zip from '../operator/connected_zip.cjs';
import {reportHTML,reportMarkdown,comparisonHTML,comparisonMarkdown,reconciliationCSV} from '../hardware/report.mjs';
import {recordCSV} from '../operator/view.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function moduleSources(){
 const raw=await readFile(join(root,'source-manifest.json'),'utf8'),manifest=JSON.parse(raw),files={};
 for(const e of manifest.files){
  if(typeof e.path!=='string'||e.path.startsWith('/')||e.path.split('/').some(x=>!x||x==='.'||x==='..')||e.path.includes('\\'))throw Error('Unsafe source path');
  let path=root;for(const part of e.path.split('/')){path=join(path,part);if((await lstat(path)).isSymbolicLink())throw Error('Source link is not an original file');}
  const b=await readFile(path);if(b.length!==e.bytes||codec.sha256Bytes(b)!==e.sha256)throw Error('Complete application source differs: '+e.path);
  const t=codec.utf8Decode(b);if(codec.toBase64(codec.utf8Encode(t))!==codec.toBase64(b))throw Error('Source is not exact UTF-8');files[e.path]=t;
 }files['source-manifest.json']=raw;return files;
}
export function buildExport(files,state,records=[],editions=[]){
 const session=sessions.receive(JSON.stringify(state.carrier)),w=session.workspace,d=session.draft;
 const entries=Object.entries(files).map(([name,t])=>({name:'source/'+name,data:codec.utf8Encode(t)}));
 const add=(name,v)=>entries.push({name,data:codec.utf8Encode(typeof v==='string'?v:JSON.stringify(v,null,2)+'\n')});
 add('working/Hardware_Working.json',state.carrier);add('working/Managed_Edition.json',state);
 add('working/Hardware_Editable.html',buildHardwareDesk(files,codec,state.carrier).html);
 add('working/Hardware_Workspace.json',core.exportWorkspace(w).content);
 for(const original of w.sources)entries.push({name:'originals/'+original.id+'/name-'+encodeURIComponent(original.name).replaceAll('*','%2A'),data:codec.fromBase64(original.content_base64)});
 for(const proposal of w.proposals){const p='proposals/'+proposal.id+'/';add(p+'Handoff.json',core.handoff(w,proposal.id));add(p+'Comparison.html',comparisonHTML(proposal.comparison));add(p+'Comparison.md',comparisonMarkdown(proposal.comparison));add(p+'Comparison.csv',recordCSV(proposal.comparison));}
 for(const e of w.editions){const p='reports/'+e.id+'/';add(p+'Edition.json',e);add(p+'Report.html',reportHTML(e.report));add(p+'Report.md',reportMarkdown(e.report));add(p+'Reconciliation.csv',reconciliationCSV(e.report));add(p+'Report.csv',recordCSV(e.report));}
 if(w.editions.some(e=>e.id===d.leftEditionId)&&w.editions.some(e=>e.id===d.rightEditionId))add('reports/Selected_Comparison.json',core.compare(w,d.leftEditionId,d.rightEditionId));
 add('reports/Selected_Review.json',{selectedEditionId:d.selectedEditionId,selectedProposalId:d.selectedProposalId,proposalStatuses:w.proposals.map(p=>core.proposalStatus(w,p.id)),leftEditionId:d.leftEditionId,rightEditionId:d.rightEditionId,reviews:w.reviews});
 add('managed/RETAINED_HISTORY_INDEX.json',{schema:'stellar-forge.hardware-retained-history.v1',currentStateSha256:state.sha256,requests:records.map(row=>({sha256:row.id,requestId:row.value.request?.id,selection:state.receipts.some(x=>x.recordSha256===row.id)?'COMMITTED':state.rejections.some(x=>x.recordSha256===row.id)?'REJECTED_NOT_COMMITTED':'UNSELECTED_PREPARED_RECORD'})),editions:editions.map(row=>({sha256:row.id,sequence:row.value.sequence,selection:row.id===state.sha256?'CURRENT_EDITION':'RETAINED_EDITION'}))});
 for(const row of records)add('managed/requests/'+row.id+'.json',row.value);
 for(const row of editions)add('managed/editions/'+row.id+'.json',row.value);
 const manifest={schema:'stellar-forge.hardware-export.v1',installationId:state.installationId,editionSha256:state.sha256,sessionSha256:state.carrier.sha256,sequence:state.sequence,files:entries.map(e=>({path:e.name,bytes:e.data.length,sha256:codec.sha256Bytes(e.data)}))};
 add('EXPORT_MANIFEST.json',manifest);
 return zip.packStoredZip(entries,{timestamp:'2026-10-15T00:00:00Z',maxBytes:256*1024*1024,maxEntries:10000});
}
