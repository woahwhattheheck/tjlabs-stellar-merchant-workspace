// MIT. Source-bound returned customer review over the original SeaTable draft.
import {identity, fault, object} from '../../postgres/publisher/files.mjs';
const clone=value=>structuredClone(value);
const same=(a,b)=>identity(a)===identity(b);
const absent=()=>({present:false});
const present=value=>({present:true,value:clone(value)});
const slot=(value,key)=>Object.hasOwn(value,key)?present(value[key]):absent();
const escape=key=>key.replace(/~/g,'~0').replace(/\//g,'~1');
const plain=value=>object(value)&&!Array.isArray(value);
const orderedKeys=(value,path='',rows=[])=>{if(Array.isArray(value)){value.forEach((v,i)=>orderedKeys(v,path+'/'+i,rows));}else if(plain(value)){const keys=Object.keys(value);rows.push({path,keys});for(const key of keys)orderedKeys(value[key],path+'/'+escape(key),rows);}return rows;};
export const seaTableDraftIdentity=draft=>identity({value:draft,order:orderedKeys(draft)});
const equalSlot=(a,b)=>a.present===b.present&&(!a.present||seaTableDraftIdentity(a.value)===seaTableDraftIdentity(b.value));
export function seaTableDraftRecord({kind,requestId,draftRevision,draft,source}){
  const original={kind,requestId,draft:clone(draft),order:orderedKeys(draft),source:clone(source)};
  return {id:identity(original),...original,draftRevision};
}
export function seaTableReturnSnapshot({workspace,source,state,history}){
  const unique=new Map();
  for(const row of history){if(!row?.draft||!row.source||!row.id)throw fault('SEATABLE_RETURN_HISTORY_INVALID');
    const checked=seaTableDraftRecord(row);if(checked.id!==row.id)throw fault('SEATABLE_RETURN_HISTORY_CHANGED');
    const old=unique.get(row.id);if(old&&!same(old,row))throw fault('SEATABLE_RETURN_HISTORY_CHANGED');
    unique.set(row.id,clone(row));
  }
  const content={schema:'stellar-forge.seatable-return-snapshot.v1',workspace,source:clone(source),
    state:clone(state),draftOrder:orderedKeys(state.draft),history:[...unique.values()]};
  return {...content,sha256:identity(content)};
}
export function verifySeaTableReturnSnapshot(value){
  if(value?.schema!=='stellar-forge.seatable-return-snapshot.v1')throw fault('SEATABLE_RETURN_SNAPSHOT_INVALID');
  const {sha256,...body}=value;if(identity(body)!==sha256)throw fault('SEATABLE_RETURN_SNAPSHOT_CHANGED');
  const checked=seaTableReturnSnapshot(body);if(checked.sha256!==sha256)throw fault('SEATABLE_RETURN_SNAPSHOT_CHANGED');return checked;
}
export function seaTableReturnBasis(local,incoming){
  local=verifySeaTableReturnSnapshot(local);incoming=verifySeaTableReturnSnapshot(incoming);
  const issues=[];
  if(local.workspace!==incoming.workspace)issues.push({code:'SEATABLE_RETURN_WORKSPACE_CHANGED',message:'Receive the original shared workspace branch.'});
  if(!same(local.source,incoming.source))issues.push({code:'SEATABLE_RETURN_SOURCE_CHANGED',message:'Both drafts must use the same complete frozen capture and source selection.'});
  const incomingIds=new Set(incoming.history.map(r=>r.id));
  const candidates=local.history.filter(r=>incomingIds.has(r.id)&&same(r.source,local.source));
  const base=candidates.at(-1)??null;
  if(!base)issues.push({code:'SEATABLE_RETURN_ANCESTRY_MISSING',message:'No identical original saved draft record exists in both histories.'});
  const actual={workspace:local.workspace,source:local.source,base:base?{...clone(base),draftSha256:seaTableDraftIdentity(base.draft)}:null,
    local:{draftRevision:local.state.draftRevision,draftSha256:seaTableDraftIdentity(local.state.draft),snapshotSha256:local.sha256},
    returned:{draftRevision:incoming.state.draftRevision,draftSha256:seaTableDraftIdentity(incoming.state.draft),snapshotSha256:incoming.sha256}};
  return{...actual,issues};
}
export function compareSeaTableReturn({record,local}){
  const incoming=record.incoming,basis=seaTableReturnBasis(local,incoming),rows=[],choices=record.choices??{};
  const resolve=(path,base,l,r)=>{
    let status,selected;
    if(equalSlot(l,r)){status='same';selected=l;}
    else if(equalSlot(l,base)){status='returned';selected=r;}
    else if(equalSlot(r,base)){status='local';selected=l;}
    else {status='conflict';selected=l;}
    const changed=!equalSlot(base,l)||!equalSlot(base,r);
    if(changed){const choice=Object.hasOwn(choices,path)?choices[path]:null;
      if(choice!==null&&!['local','returned','base'].includes(choice))throw fault('SEATABLE_RETURN_CHOICE_INVALID');
      if(choice)selected=choice==='local'?l:choice==='returned'?r:base;
      rows.push({path,base:clone(base),local:clone(l),returned:clone(r),status,choice});
    }
    return clone(selected);
  };
  const merge=(path,b,l,r)=>{
    if(l.present&&r.present&&plain(l.value)&&plain(r.value)&&(!b.present||plain(b.value))){
      const base=b.present?b.value:{},left=l.value,right=r.value,keys=[...new Set([...Object.keys(left),...Object.keys(right),...Object.keys(base)])];
      if(keys.some(k=>['__proto__','prototype','constructor','@order'].includes(k)))throw fault('SEATABLE_RETURN_FIELD_INVALID');
      const result={};for(const key of keys){const chosen=merge(path+'/'+escape(key),slot(base,key),slot(left,key),slot(right,key));if(chosen.present)result[key]=chosen.value;}
      const live=Object.keys(result),order=value=>[...Object.keys(value).filter(k=>live.includes(k)),...live.filter(k=>!Object.hasOwn(value,k))];
      const chosen=resolve(path+'/@order',present(order(base)),present(order(left)),present(order(right))).value;
      return present(Object.fromEntries(chosen.map(k=>[k,result[k]])));
    }
    return resolve(path,b,l,r);
  };
  const merged=basis.base?merge('',present(basis.base.draft),present(local.state.draft),present(incoming.state.draft)).value:clone(local.state.draft);
  const unknown=Object.keys(choices).filter(path=>!rows.some(row=>row.path===path));
  if(unknown.length)basis.issues.push({code:'SEATABLE_RETURN_CHOICES_STALE',message:'Retained choices no longer name the current comparison.',paths:unknown});
  const unresolved=rows.filter(r=>r.status==='conflict'&&!r.choice).length;
  const reviewed=record.review?.basisSha256===identity({local:local.sha256,incoming:incoming.sha256,base:basis.base?.id??null,choices});
  const result={schema:'stellar-forge.seatable-return-preview.v1',reviewId:record.id,reviewRevision:record.revision,
    ...basis,rows,total:rows.length,unresolved,reviewed:Boolean(reviewed),merged};
  return{...result,previewSha256:identity(result),canApply:record.status!=='applied'&&!basis.issues.length&&!unresolved&&Boolean(reviewed)};
}
export function seaTableReturnSummary(record){
  const {incoming,localAtCapture,versions,review,applied,...rest}=record;
  return {...rest,source:incoming.source,local:localAtCapture?{draftRevision:localAtCapture.state.draftRevision,draftSha256:seaTableDraftIdentity(localAtCapture.state.draft),snapshotSha256:localAtCapture.sha256}:null,returned:{draftRevision:incoming.state.draftRevision,draftSha256:seaTableDraftIdentity(incoming.state.draft),snapshotSha256:incoming.sha256},
    review:review?{basisSha256:review.basisSha256,localDraftRevision:review.local.state.draftRevision,createdAt:review.createdAt}:null,
    applied:applied?{requestId:applied.requestId,draftRevision:applied.draftRevision,draftSha256:seaTableDraftIdentity(applied.draft),createdAt:applied.createdAt}:null};
}
