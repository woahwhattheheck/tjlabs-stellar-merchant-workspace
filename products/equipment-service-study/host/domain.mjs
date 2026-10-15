// MIT. Exact original rows, identities, report bytes and reviews from one saved edition.
import {applyDomain,originalSessions,workspaceHead} from '../runtime.mjs';
export function inspectEquipmentServiceStudy(core,state,args){
 const s=state.carrier.session,w=s.workspace.study,offset=args.offset??0,limit=args.limit??25;
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>50)throw Error('Choose an exact page from 1 to 50 rows');
 const context={editionSha256:state.sha256,head:workspaceHead(s.workspace),studySha256:core.digest(w),collection:args.collection},page=(rows,extra={})=>({...context,offset,total:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null,rows:rows.slice(offset,offset+limit),...extra});
 const arrays={originals:w.originals,extracts:w.extracts,crosswalks:w.crosswalks,reviews:w.reviews,documents:w.documents,documentLinks:w.document_links,backups:s.workspace.backups,history:s.workspace.history};
 if(Object.hasOwn(arrays,args.collection))return page(arrays[args.collection]);
 if(args.collection==='draft')return {...context,drafts:s.workspace.drafts,view:s.workspace.view,selection:s.workspace.selection,actor:s.draft.actor,emergency:s.emergency,retainedEmergency:s.retainedEmergency};
 if(args.collection==='requests')return page([...state.receipts.map(x=>({...x,outcome:'COMMITTED'})),...state.rejections.map(x=>({...x,outcome:'REJECTED_NOT_COMMITTED'}))]);
 if(args.collection==='availability')return page(core.availability(w).tables);
 if(args.collection==='rows'){if(!core.KINDS.includes(args.kind)||!['source','returned'].includes(args.side))throw Error('Choose an exact record kind and side');const e=core.selected(w,args.kind,args.side);return page(core.rows(w,args.kind,args.side),{kind:args.kind,side:args.side,extract:e||null,fields:core.FIELDS[args.kind],idField:core.ID_FIELDS[args.kind]});}
 if(args.collection==='original'||args.collection==='document'||args.collection==='extract'){const rows=args.collection==='original'?w.originals:args.collection==='document'?w.documents:w.extracts,item=rows.find(x=>x.id===args.id);if(!item)throw Error('Choose a retained exact original identifier');return {...context,[args.collection]:item};}
 if(args.collection==='plan')return {...context,plan:w.config.service,sourceSelection:w.config.selection.source,returnedSelection:w.config.selection.returned};
 const a=core.analyze(w),result=a.service;
 if(args.collection==='findings')return page(a.findings);
 if(args.collection==='documentComparisons')return page(a.document_comparisons);
 if(args.collection==='assessment')return {...context,result:a};
 if(args.collection==='serviceResult'){
  const path=args.resultPath??[];if(!Array.isArray(path)||path.length>16)throw Error('Choose a result path of at most sixteen own fields');
  let value=result;for(const key of path){if(!((typeof key==='string'&&key.length>0&&key.length<=120)||(Number.isSafeInteger(key)&&key>=0))||value===null||typeof value!=='object'||!Object.hasOwn(value,key))throw Error('The exact selected result path is absent');value=value[key];}
  const describe=(value,path)=>value!==null&&typeof value==='object'?{type:Array.isArray(value)?'array':'object',path,count:Array.isArray(value)?value.length:Object.keys(value).length}:{type:'value',path,value};
  if(Array.isArray(value))return page(value,{resultPath:path,type:'array'});
  if(value!==null&&typeof value==='object')return page(Object.entries(value).map(([name,v])=>({name,...describe(v,[...path,name])})),{resultPath:path,type:'object'});
  return {...context,resultPath:path,type:'value',value};
 }
 throw Error('Choose a declared equipment service study collection');
}
export function previewEquipmentServiceStudy(core,workspace,kind,input){
 originalSessions.validate(workspace);if(kind==='assessment')return core.analyze(workspace.study);
 if(kind==='command'){const next=applyDomain(workspace,input).workspace;return {head:workspaceHead(next),assessment:core.analyze(next.study)};}
 throw Error('Choose a declared equipment service study preview');
}
