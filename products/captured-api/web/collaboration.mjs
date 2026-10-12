// MIT. Collaboration over the original immutable captured handover drafts.
import { reviewCapturedDraftMerge, readCapturedWorkingEdit } from './draft-reconciliation.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const canonical=value=>JSON.stringify(value,(_,row)=>row&&typeof row==='object'&&!Array.isArray(row)
  ?Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]])):row);
const element=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=String(text);if(cls)node.className=cls;return node;};
const signature=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',
  typeof value==='string'?new TextEncoder().encode(value):value))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
const conflictBinding=row=>canonical({id:row.id,field:row.field,key:row.key,reason:row.reason,
  base:row.base,current:row.current,working:row.working});
const definitive=row=>!row.error?.outcomeUnknown&&(
  row.path==='draft/receiving-save'&&row.error?.status>=400&&row.error.status<500||
  row.error?.status===409&&['CAPTURED_DESK_DRAFT_CHANGED','CAPTURED_DESK_REVIEW_CHANGED','CAPTURED_DESK_MERGE_CONFLICTS'].includes(row.error?.code));
const SAVE_PATHS=['draft/save','draft/merge-save','draft/receiving-save'];

/** The host keeps its existing editor, pending requests, busy state and saved history. */
export function createCapturedDraftCollaboration(hooks) {
  const {root,api,act,retain,local,forget,pendingRows,notice,context,onSaved}=hooks;
  const tab=context().tab,prefix='collaboration:'+tab+':',indexKey=prefix+'index';
  let index=local(indexKey)??{selected:null,rows:[]},candidate=null,review=null,conflictOffset=0,changeOffset=0;
  if(index.selected)candidate=local(prefix+index.selected);
  const heading=element('div',undefined,'heading'),title=element('div');
  title.append(element('p','COLLABORATIVE DRAFT','eyebrow'),element('h2','Combine saved and working edits'));
  heading.append(title);root.append(heading);
  const intro=element('p','Review another saved edition or an original working-edit file. Independent changes combine; conflicting selections stay explicit.','muted');
  const actions=element('div',undefined,'actions'),fileLabel=element('label','Original working edit JSON file');
  const file=document.createElement('input');file.type='file';file.accept='.json,application/json';fileLabel.append(file);
  const retainedLabel=element('label','Retained collaboration review'),retainedSelect=document.createElement('select');retainedLabel.append(retainedSelect);
  const fields=element('div',undefined,'fields');fields.append(fileLabel,retainedLabel);
  const summary=element('div',undefined,'callout'),content=element('div'),footer=element('div',undefined,'actions');
  root.append(intro,actions,fields,summary,content,footer);
  function button(label,work,locked=false) {
    const node=element('button',label);node.type='button';node.dataset.locked=String(locked);
    node.disabled=context().busy||locked;node.addEventListener('click',()=>act(work));return node;
  }
  function details(label,value) {
    const node=element('details'),summary=element('summary',label);node.append(summary);
    node.addEventListener('toggle',()=>{if(node.open&&node.childElementCount===1)node.append(element('pre',JSON.stringify(value,null,2)));});
    return node;
  }
  function persist() {
    if(candidate) {
      local(prefix+candidate.id,candidate);
      const row={id:candidate.id,draftId:candidate.draftId,baseRevision:candidate.baseRevision,
        label:candidate.working.label,source:candidate.source,saved:Boolean(candidate.saved)};
      index.rows=index.rows.filter(value=>value.id!==row.id);index.rows.unshift(row);index.selected=row.id;
    }
    local(indexKey,index);
  }
  function choose(value) {candidate=value;review=null;conflictOffset=0;changeOffset=0;persist();render();}
  function fork() {
    if(!candidate?.requestId)return;
    const {requestId,requestEditorSha256,saved,reviewMeta,...copy}=clone(candidate);
    choose({...copy,id:crypto.randomUUID(),fromReview:candidate.id});
  }
  const sameInput=()=>review&&candidate&&review.id===candidate.draftId&&review.baseRevision===candidate.baseRevision&&
    canonical(review.working)===canonical(candidate.working)&&canonical(review.resolutions)===canonical(candidate.resolutions);
  const editorFingerprint=()=> {
    const selected=context();return canonical(selected.editor?{id:selected.editor.id,revision:selected.editor.revision,
      mode:selected.editorMode,form:selected.form}:null);
  };
  function saveRows(draftId) {
    return pendingRows().filter(row=>SAVE_PATHS.includes(row.path)&&JSON.parse(row.bodyText).id===draftId);
  }
  function retireFailedSaves(draftId,requestId) {
    for(const row of saveRows(draftId)) {
      if(JSON.parse(row.bodyText).requestId===requestId)continue;
      if(!definitive(row))throw new Error('Continue the retained original save for this draft before sending another edition.');
      local('rejected:'+row.key,{...row,releasedAt:new Date().toISOString()});forget(row.key);
    }
  }
  async function inspect({fresh=false}={}) {
    if(!candidate)throw new Error('Choose a working form or its original edit file.');
    if(fresh)fork();
    const requested={id:candidate.draftId,baseRevision:candidate.baseRevision,working:clone(candidate.working),
      resolutions:fresh?{}:clone(candidate.resolutions),
      ...(!fresh&&candidate.currentRevision?{expectedCurrentRevision:candidate.currentRevision}:{})};
    let native=await api('draft/merge-review',requested);
    if(fresh) {
      const carried={};
      for(const conflict of native.merge.conflicts) {
        const choice=candidate.resolutions[conflict.id];
        if(choice&&candidate.resolutionBindings?.[conflict.id]===await signature(conflictBinding(conflict)))
          carried[conflict.id]=choice;
      }
      candidate.resolutions=carried;
      if(Object.keys(carried).length)native=await api('draft/merge-review',{
        ...requested,expectedCurrentRevision:native.currentRevision,resolutions:carried,
      });
    }
    review=native;candidate.currentRevision=native.currentRevision;
    candidate.working=clone(native.working);candidate.resolutions=clone(native.resolutions);
    candidate.reviewMeta={currentRevision:native.currentRevision,reviewSha256:native.reviewSha256,status:native.merge.status};
    persist();render();
    notice(native.merge.status==='READY'?'The complete reconciliation is ready. Review its changes and save the resulting edition.':
      'Choose current or working for each conflict, then review those choices.');
  }
  async function reviewWorking() {
    const selected=context();
    if(!selected.editor||selected.editorMode!=='WORKING')throw new Error('Open the retained working form to compare its saved base.');
    choose({id:crypto.randomUUID(),draftId:selected.editor.id,kind:selected.editor.kind,
      baseRevision:selected.editor.revision,working:clone(selected.form),source:'WORKING',
      resolutions:{},resolutionBindings:{}});
    await inspect();
  }
  async function selectChoice(conflict,value,displayed) {
    if(!candidate||!review)return;
    const snapshot=review;fork();review=snapshot;
    // A member choice can change the retained collection and its ordering
    // conflicts. Review that new order explicitly instead of carrying a choice
    // whose conflict disappeared. Conflict ids remain opaque to this host.
    if(['packages','sources'].includes(conflict.field)) {
      for(const previous of displayed.conflicts)if(previous.field===conflict.field+'.order') {
        delete candidate.resolutions[previous.id];delete candidate.resolutionBindings[previous.id];
      }
    }
    if(value) {
      candidate.resolutions[conflict.id]=value;
      candidate.resolutionBindings[conflict.id]=await signature(conflictBinding(conflict));
    } else {
      delete candidate.resolutions[conflict.id];delete candidate.resolutionBindings[conflict.id];
    }
    persist();render();
  }
  async function acceptSaved(saved,request,{foreground=false}={}) {
    const row=index.rows.map(row=>local(prefix+row.id)).find(value=>value?.requestId===request.requestId);
    const selected=context();
    const keepWorking=row?.requestEditorSha256!==undefined
      ?row.requestEditorSha256!==await signature(editorFingerprint())
      :selected.editor?.id===saved.id&&selected.editorMode==='WORKING'&&
        canonical(selected.form)!==canonical(selected.editor.edition.form);
    if(row) {
      row.saved={revision:saved.revision,requestId:request.requestId,sequence:saved.edition.sequence};
      local(prefix+row.id,row);
      const listed=index.rows.find(value=>value.id===row.id);if(listed)listed.saved=true;
      if(candidate?.id===row.id)candidate=row;
      local(indexKey,index);
    }
    await onSaved(saved,{keepWorking,foreground});
    render();
  }
  async function save() {
    if(!sameInput()||review.merge.status!=='READY')throw new Error('Review the exact complete conflict choices before saving.');
    const requestId=candidate.requestId??crypto.randomUUID();
    retireFailedSaves(candidate.draftId,requestId);
    if(!candidate.requestId) {
      candidate.requestId=requestId;candidate.requestEditorSha256=await signature(editorFingerprint());persist();
    }
    const body={id:candidate.draftId,requestId,baseRevision:candidate.baseRevision,
      expectedRevision:review.currentRevision,working:clone(candidate.working),
      resolutions:clone(candidate.resolutions),reviewSha256:review.reviewSha256};
    await retain('draft/merge-save',body,(saved,request)=>acceptSaved(saved,request,{foreground:true}));
    notice('The reconciled edition is saved. Continue with the original collection preparation or receiving review.');
  }
  async function exportWorking() {
    const selected=context();
    if(!selected.editor)throw new Error('Choose an original saved draft and its working form.');
    const input={id:selected.editor.id,baseRevision:selected.editor.revision,working:clone(selected.form)};
    const native=await api('draft/working-export',input);
    const bytes=new TextEncoder().encode(native.content);
    if(native.productId!==selected.info.productId||native.id!==input.id||native.baseRevision!==input.baseRevision||
      bytes.length!==native.bytes||await signature(bytes)!==native.sha256)
      throw new Error('Reopen the complete original working edit export.');
    readCapturedWorkingEdit(JSON.parse(native.content));
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/json'})),link=document.createElement('a');
    link.href=url;link.download=native.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    notice('Complete working edit downloaded. SHA-256 '+native.sha256);
  }
  async function importWorking() {
    const selected=file.files[0];
    if(!selected||selected.size<1||selected.size>4*1024*1024)throw new Error('Choose a complete working edit JSON file of at most 4 MiB.');
    const bytes=await selected.arrayBuffer(),sha256=await signature(bytes);
    const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
    readCapturedWorkingEdit(JSON.parse(text.charCodeAt(0)===0xfeff?text.slice(1):text));
    const native=await api('draft/working-import',{content:text,expectedSha256:sha256});
    if(native.sha256!==sha256||native.bytes!==bytes.byteLength||native.productId!==context().info.productId)
      throw new Error('The original working edit file reply changed. Read the same complete file again.');
    choose({id:crypto.randomUUID(),draftId:native.id,kind:native.kind,baseRevision:native.baseRevision,
      working:clone(native.working),source:'FILE',sourceName:selected.name,sourceSha256:sha256,
      sourceBytes:bytes.byteLength,resolutions:{},resolutionBindings:{}});
    await inspect();
  }
  async function removeReview() {
    if(!candidate)return;
    if(candidate.requestId&&saveRows(candidate.draftId).some(row=>JSON.parse(row.bodyText).requestId===candidate.requestId))
      throw new Error('Continue or retire this original pending request before removing its review.');
    forget(prefix+candidate.id);index.rows=index.rows.filter(row=>row.id!==candidate.id);index.selected=null;
    candidate=null;review=null;local(indexKey,index);render();
  }
  function pager(target,offset,total,change) {
    if(total<=20)return;
    target.append(element('span',(offset+1)+'–'+Math.min(offset+20,total)+' of '+total,'small'));
    if(offset>0)target.append(button('Previous',()=>{change(Math.max(0,offset-20));render();}));
    if(offset+20<total)target.append(button('Next',()=>{change(offset+20);render();}));
  }
  function render() {
    const selected=context();
    actions.replaceChildren(button('Compare and combine current draft',reviewWorking,!selected.editor||selected.editorMode!=='WORKING'),
      button('Export working edit',exportWorking,!selected.editor),
      button('Review selected working file',importWorking,!file.files[0]));
    retainedSelect.replaceChildren();
    const empty=element('option','Choose a retained review');empty.value='';retainedSelect.append(empty);
    for(const row of index.rows) {
      const option=element('option',row.label+' · '+row.source+(row.saved?' · SAVED':'')+' · '+row.baseRevision.slice(0,12));
      option.value=row.id;option.selected=row.id===candidate?.id;retainedSelect.append(option);
    }
    summary.hidden=!candidate;content.replaceChildren();footer.replaceChildren();
    if(!candidate) {hooks.controls?.();return;}
    summary.replaceChildren(element('strong',candidate.working.label),
      element('p','Draft '+candidate.draftId+' · original base '+candidate.baseRevision,'small wrap'),
      element('p',candidate.source==='FILE'?'Working file: '+candidate.sourceName+' · SHA-256 '+candidate.sourceSha256:
        'Retained working form from the original editor.','small wrap'));
    if(candidate.saved) {
      summary.append(element('p','Saved as edition '+candidate.saved.sequence+' · '+candidate.saved.revision,'small wrap'));
      footer.append(button('Open saved reconciled edition',async()=>{
        const saved=await api('draft?'+new URLSearchParams({id:candidate.draftId,revision:candidate.saved.revision}));
        await onSaved(saved,{keepWorking:false,foreground:true});
      }));
    } else if(!review) {
      content.append(element('p','This review retains its complete working form and conflict choices. Reopen the original current edition to continue.'));
      footer.append(button('Continue retained review',()=>inspect()),
        button('Review the latest saved edition',()=>inspect({fresh:true})));
    } else {
      const merge=reviewCapturedDraftMerge({kind:review.kind,base:review.base,current:review.current,
        working:candidate.working,resolutions:candidate.resolutions});
      const unresolved=merge.conflicts.filter(row=>!row.choice).length;
      summary.append(element('p','Saved editions '+review.baseSequence+' → '+review.currentSequence+
        ' · '+merge.changes.length+' combined changes · '+unresolved+' unresolved conflicts.'));
      if(!sameInput())summary.append(element('p','Choices changed. Review the resolved choices to bind the complete result.'));
      if(merge.conflicts.length) {
        content.append(element('h3','Choose the conflicting values'));
        const table=element('table'),head=element('thead'),header=element('tr'),body=element('tbody');
        for(const value of ['Field','Original base','Current saved','Working edit','Use'])header.append(element('th',value));
        head.append(header);table.append(head,body);
        for(const conflict of merge.conflicts.slice(conflictOffset,conflictOffset+20)) {
          const row=element('tr'),name=element('td');
          name.append(element('strong',conflict.field+(conflict.key===undefined?'':' / '+conflict.key)),
            element('p',conflict.reason,'small'));row.append(name);
          for(const key of ['base','current','working']) {
            const cell=element('td'),value=conflict[key];
            cell.append(value.present?details('View complete value',value.value):element('span','Removed / absent','muted'));row.append(cell);
          }
          const cell=element('td'),choice=document.createElement('select');
          choice.setAttribute('aria-label','Value for '+conflict.field+(conflict.key===undefined?'':' '+conflict.key));
          for(const [value,label] of [['','Choose a value'],['CURRENT','Current saved'],['WORKING','Working edit']]) {
            const option=element('option',label);option.value=value;option.selected=value===(candidate.resolutions[conflict.id]??'');choice.append(option);
          }
          choice.addEventListener('change',()=>act(()=>selectChoice(conflict,choice.value,merge)));cell.append(choice);row.append(cell);body.append(row);
        }
        const wrap=element('div',undefined,'table-wrap');wrap.append(table);content.append(wrap);
        const navigation=element('div',undefined,'pager');pager(navigation,conflictOffset,merge.conflicts.length,value=>{conflictOffset=value;});content.append(navigation);
      }
      if(merge.changes.length) {
        content.append(element('h3','Combined changes'));
        const table=element('table'),head=element('thead'),header=element('tr'),body=element('tbody');
        for(const value of ['Field','Member','Action','Edited by'])header.append(element('th',value));
        head.append(header);table.append(head,body);
        for(const change of merge.changes.slice(changeOffset,changeOffset+20)) {
          const row=element('tr');for(const value of [change.field,change.key??'—',change.action,change.side])row.append(element('td',value));body.append(row);
        }
        const wrap=element('div',undefined,'table-wrap');wrap.append(table);content.append(wrap);
        const navigation=element('div',undefined,'pager');pager(navigation,changeOffset,merge.changes.length,value=>{changeOffset=value;});content.append(navigation);
      }
      content.append(details('Complete resulting draft form',merge.form));
      const unchanged=canonical(merge.form)===canonical(review.current);
      if(unchanged&&merge.status==='READY')content.append(element('p','The result already matches the current saved edition.'));
      footer.append(button('Review resolved choices',()=>inspect(),sameInput()),
        button('Save reconciled edition',save,!sameInput()||merge.status!=='READY'||unchanged),
        button('Review the latest saved edition',()=>inspect({fresh:true})));
    }
    footer.append(button('Remove retained review',removeReview));
    hooks.controls?.();
  }
  file.addEventListener('change',render);
  retainedSelect.addEventListener('change',()=>act(()=>{
    if(!retainedSelect.value){candidate=null;review=null;index.selected=null;local(indexKey,index);render();return;}
    const retained=local(prefix+retainedSelect.value);
    if(!retained)throw new Error('Reopen the original retained collaboration review.');
    choose(retained);
  }));
  render();
  return {refresh:render,reviewWorking,acceptSaved};
}
