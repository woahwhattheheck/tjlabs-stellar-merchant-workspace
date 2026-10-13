/* Same original Event column editor, complete independent file receiving. */
(()=>{
  const $=id=>document.getElementById(id);
  let editor,ready=false,dirty=false,storageUnavailable=false;
  const LIMIT=128*1024*1024;
  function message(text,error=false){
    if(storageUnavailable&&!text.includes(CHOICE_STORAGE_WARNING))text+=' '+CHOICE_STORAGE_WARNING;
    $('editor-status').textContent=text;$('editor-status').dataset.error=String(error||storageUnavailable);
  }
  function safeJSON(value){return JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');}
  function file(raw,name,type){
    if(new TextEncoder().encode(raw).byteLength>LIMIT)throw Error('This complete editable file exceeds 128 MiB. Keep this window open; no work has been removed. Use the whole working review for complete receiving history; the separate original native proposal and legacy choices downloads retain their own 16 MiB allowance.');
    const url=URL.createObjectURL(new Blob([raw],{type})),a=document.createElement('a');
    a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  function state(){return {schema:'stellar-forge.event-workbook-editor.v1',choices:editor.snapshot(),view:editor.view()};}
  function save(working,view){
    const value=working?{schema:'stellar-forge.event-workbook-editor.v1',choices:reopen(working),view:view||editor.view()}:state(),copy=document.documentElement.cloneNode(true);
    copy.querySelector('#editor-data').textContent=safeJSON(value);
    copy.querySelector('#editor-root').replaceChildren();
    copy.querySelector('#editor-identity').replaceChildren();
    copy.querySelector('#editor-original').textContent='';
    copy.querySelector('#editor-status').textContent='Opening the complete saved worksheet…';
    const html='<!doctype html>\n'+copy.outerHTML+'\n';
    file(html,'event-workbook-editor-'+value.choices.original.proposal.operation_id+'.html','text/html;charset=utf-8');
    message('Requested the complete editable worksheet download. Open the downloaded file to continue these exact choices. This window retains its changed-work reminder.');
  }
  function run(fn){if(!ready)return;try{fn();}catch(error){message(error.message,true);}}
  $('save-editor').addEventListener('click',()=>run(save));
  $('save-choices').addEventListener('click',()=>run(()=>{
    const value=editor.snapshot();file(JSON.stringify(value,null,2)+'\n','event-workbook-review-'+value.original.proposal.operation_id+'.json','application/json');
    message('Requested the complete working review JSON with all original and returned sources, unfinished choices and receipts. Confirm the saved file before replacing this copy.');
  }));
  $('save-original').addEventListener('click',()=>run(()=>{
    const value=editor.snapshot().original;
    file(serializeNativeJSON(value.proposal),'event-workbook-proposal-'+value.proposal.operation_id+'.json','application/json');
    message('Requested the complete original native worksheet proposal download. Workspace and programme also remain in the full choice file.');
  }));
  addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  try{
    const value=JSON.parse($('editor-data').textContent);
    if(!value||value.schema!=='stellar-forge.event-workbook-editor.v1'||Object.keys(value).some(key=>!['schema','choices','view'].includes(key)))
      throw Error('Open a complete original Event worksheet editor.');
    const choices=reopen(value.choices),context=choices.original;
    $('editor-root').replaceChildren();$('editor-identity').replaceChildren();
    for(const [label,text]of [['Original workspace',context.workspace_id],['Customer programme',context.programme],
      ['Original operation',context.proposal.operation_id],['Accepted review',context.proposal.review_sha256],
      ['Unresolved worksheets',context.proposal.worksheets.length],['Complete retained column arrays',Object.keys(choices.columns).length]]){
      const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=String(text);$('editor-identity').append(dt,dd);
    }
    $('editor-original').textContent=JSON.stringify(context,null,2);
    editor=createEventWorkbookColumnReview($('editor-root'),{
      onChange:(_columns,retention)=>{if(typeof retention?.retained==='boolean')storageUnavailable=!retention.retained;if(ready){dirty=true;message('Unfinished choices changed. Save editable worksheet to retain this complete edition.');}},
      onMessage:message,onEditableDownload:save
    });
    editor.open(context,{working:choices});
    if(value.view!==undefined)editor.view(value.view);
    ready=true;document.querySelector('main').setAttribute('aria-busy','false');
    message('Complete original worksheet and review history opened. Edit columns or use assignments and returned reviews; save the full working file and continue its original Event programme.');
  }catch(error){message(error.message,true);document.querySelector('main').setAttribute('aria-busy','false');}
})();
