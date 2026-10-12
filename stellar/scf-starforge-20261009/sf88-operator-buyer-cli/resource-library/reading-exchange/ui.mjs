// MIT — Complete reading handover controls in the original research desk.
const node=(tag,text,attributes={})=>{const out=document.createElement(tag);if(text!==undefined)out.textContent=text;for(const[k,v]of Object.entries(attributes))out.setAttribute(k,v);return out;};
const prettySize=n=>new Intl.NumberFormat().format(n)+' B';
export function wireReadingHandover({state,api,download,message,handle}){
  const panel=node('section',undefined,{id:'readingHandover','aria-label':'Editable reading handover'});
  panel.className='result';
  panel.append(node('h2','Prepare an editable reading handover'),node('p','Send the exact selected text, saved research question and complete original files to a reader. The reader can reorder passages, add notes and return a complete editable project.'));
  const fields=node('div');fields.className='queryOptions';
  const labelled=(label,input)=>{const block=node('label',label);block.append(input);return block;};
  const name=node('input',undefined,{maxlength:'160',placeholder:'Name this reading handover'});
  const intro=node('textarea',undefined,{rows:'3',maxlength:'32768',placeholder:'Introduce the selected sources to the reader'});
  const mode=node('select');for(const[value,label]of [['passage','Complete matching passages'],['excerpt','Exact displayed excerpts'],['selected','Only selected passages']]){const o=node('option',label,{value});mode.append(o);}
  const saved=node('select');saved.append(node('option','Current research question',{value:''}));
  fields.append(labelled('Reading handover name',name),labelled('Selection',mode),labelled('Saved search revision',saved));
  panel.append(fields,labelled('Reader introduction',intro));
  const tools=node('div');tools.className='actions';
  const preview=node('button','Review complete selection'),count=node('span','No passages selected');count.className='muted';
  const clear=node('button','Clear selected passages');
  tools.append(preview,clear,count);panel.append(tools);
  const details=node('div');panel.append(details);
  const collection=node('input',undefined,{placeholder:'reading-handover',pattern:'[A-Za-z0-9][A-Za-z0-9._-]{0,95}'});
  const revision=node('input',undefined,{type:'number',min:'0',step:'1',value:'0'});
  const prepare=node('button','Prepare complete ZIP');prepare.disabled=true;
  const prepareRow=node('div');prepareRow.className='actions';
  prepareRow.append(labelled('Collection identifier',collection),labelled('Current collection revision',revision),prepare);
  panel.append(prepareRow,node('p','The source library saves this explicit collection revision. Preparation needs Python 3.11 or newer. Keep the server open while the archive is prepared.'));
  const recovery=node('div');panel.append(recovery);
  const operations=node('div');panel.append(operations);
  const instructions=node('details');instructions.append(node('summary','Receive, edit and return the reading package'));
  const command=node('pre','python -m stellar_forge_buyer.reading_exchange_cli receive reading-handover.zip ./received --checkout /absolute/source-checkout\npython -m stellar_forge_buyer.reading_cli serve ./received/project');
  instructions.append(command,node('p','The first command receives the original collection through Node, then creates the existing Python reading project. The reading desk includes Complete reader return; the recipient can reopen that returned project with Python alone.'));
  panel.append(instructions);
  document.querySelector('.research').append(panel);
  const chosen=new Map();let activeKey='',capture=null,captureKey='',captureEpoch=0,workspaceKey=null,operationList=[],working=false,disposed=false,memoryPending=null;
  const signature=()=>JSON.stringify(state.query??{});
  const request=()=>({name:name.value,note:intro.value,query:{...state.query},selectionMode:mode.value==='selected'?'passage':mode.value,
    ...(saved.value?{savedQueryId:saved.value,savedQueryRevision:state.status.savedQueries.find(s=>s.id===saved.value)?.revision}:{}),
    ...(mode.value==='selected'?{items:[...chosen.values()]}:{})});
  function invalidate(){capture=null;captureKey='';captureEpoch++;prepare.disabled=true;details.replaceChildren();}
  function remember(value){memoryPending=value;if(!workspaceKey)return;try{if(value)localStorage.setItem(workspaceKey,JSON.stringify(value));else localStorage.removeItem(workspaceKey);}catch{message("Keep this tab open while preparation finishes; its stable operation also remains in the library.");}}
  function pending(){if(!workspaceKey)return memoryPending;try{return JSON.parse(localStorage.getItem(workspaceKey)||'null')??memoryPending;}catch{return memoryPending;}}
  function renderRecovery(){
    const value=pending();recovery.replaceChildren();if(!value)return;
    recovery.append(node('p','Saved preparation '+value.operationId+' is awaiting its final response.'));
    const retry=node('button','Resume the same preparation');retry.disabled=working;
    retry.onclick=handle(()=>runPrepare(value));recovery.append(retry);
    const fresh=node('button','Review a new preparation');fresh.disabled=working;
    fresh.onclick=handle(async()=>{
      let current;try{current=await api('/api/reading-exchange/operation?id='+encodeURIComponent(value.operationId));}
      catch(error){if(error.code!=='HANDOVER_OPERATION_NOT_FOUND')throw error;}
      if(current?.state==='PREPARING')throw new Error('Resume the saved original preparation to finish it first.');
      remember(null);invalidate();renderRecovery();message('Review the current question and source choices for a new preparation.');
    });recovery.append(fresh);
  }
  async function reloadOperations(){
    const current=await api('/api/reading-exchange/status');
    workspaceKey='starforge.reading-handover.pending.'+current.workspaceId;operationList=current.operations;
    operations.replaceChildren();operations.append(node('h3','Prepared handovers'));
    for(const item of operationList.slice(0,20)){
      const row=node('article');row.className='result';
      const captured=current.captures.find(c=>c.captureSha256===item.request.captureSha256);
      row.append(node('strong',captured?.name??item.result?.query?.q??item.request.collectionId),
        node('p',item.state==='COMPLETE'?prettySize(item.result.bytes)+' · '+item.result.selectedPassages+' exact selections · Collection revision '+item.result.collection.revision:
          item.state==='PREPARING'?'Preparing complete original files…':item.error?.replaceAll('_',' ')??'Preparation can resume.'));
      if(item.state==='COMPLETE'){
        const get=node('button','Download complete handover');get.onclick=handle(async()=>download(await api('/api/reading-exchange/download','POST',{operationId:item.id})));row.append(get);
      }else{
        const resume=node('button','Resume original preparation');resume.disabled=working;
        resume.onclick=handle(()=>runPrepare({...item.request,operationId:item.id}));row.append(resume);
      }
      operations.append(row);
    }
    if(!operationList.length)operations.append(node('p','Prepared packages remain here after reopening this library.'));
    renderRecovery();
  }
  async function runPrepare(value){
    if(working)throw new Error('The selected preparation is already running.');
    working=true;prepare.disabled=true;remember(value);renderRecovery();
    try{
      let result=await api('/api/reading-exchange/prepare','POST',value);
      while(result.state==='PREPARING'){
        if(disposed)return;
        message('Preparing the complete original collection and reading selection…');
        await new Promise(resolve=>setTimeout(resolve,750));
        result=await api('/api/reading-exchange/operation?id='+encodeURIComponent(value.operationId));
      }
      if(result.state!=='COMPLETE'){const error=new Error(result.error?.replaceAll('_',' ')??'The saved preparation can resume.');error.code=result.error;throw error;}
      remember(null);revision.value=String(result.result.collection.revision);
      download(await api('/api/reading-exchange/download','POST',{operationId:value.operationId}));
      message('Complete reading handover ready: '+result.result.selectedPassages+' selections and '+result.result.sourceFiles+' original files.');
      await reloadOperations();
    }finally{working=false;prepare.disabled=!capture;renderRecovery();}
  }
  preview.onclick=handle(async()=>{
    if(!state.query?.q)throw new Error('Run the original research question before preparing a handover.');
    const epoch=++captureEpoch,value=request(),key=JSON.stringify(value);
    if(!value.name.trim())throw new Error('Name the reading handover.');
    if(mode.value==='selected'&&!chosen.size)throw new Error('Select one or more matching passages.');
    capture=null;prepare.disabled=true;details.replaceChildren(node('p','Reading the complete selected result set…'));
    const result=await api('/api/reading-exchange/capture','POST',value);
    if(epoch!==captureEpoch||key!==JSON.stringify(request()))return;
    capture=result;captureKey=key;
    details.replaceChildren(node('p',result.selectedPassages+' exact selections from '+result.sourceFiles+' original files · '+prettySize(result.sourceBytes)),
      node('p','Captured question: '+result.query.q+' · '+(result.query.mode==='all'?'All words across each original file':'Any word across each original file')+
        (result.query.savedQuery?' · Saved search revision '+result.query.savedQuery.revision:'')));
    const list=node('ol');for(const item of result.sample)list.append(node('li',item.name+' · '+item.kind+' · Lines '+item.lineStart+'–'+item.lineEnd+' · Bytes '+item.byteStart+'–'+item.byteEnd));
    details.append(list);if(result.selectedPassages>result.sample.length)details.append(node('p','The complete package contains all '+result.selectedPassages+' selected passages.'));
    if(!collection.value)collection.value='reading-'+result.captureSha256.slice(0,16);
    prepare.disabled=working;message('The complete selection is retained. Prepare its original files when ready.');
  });
  prepare.onclick=handle(async()=>{
    if(!capture||captureKey!==JSON.stringify(request()))throw new Error('Review the current selection before preparing it.');
    const old=pending();if(old){renderRecovery();throw new Error('Resume the saved preparation before starting another.');}
    const value={captureSha256:capture.captureSha256,collectionId:collection.value,expectedRevision:Number(revision.value),operationId:crypto.randomUUID()};
    await runPrepare(value);
  });
  for(const field of [name,intro,mode,saved])field.addEventListener('input',invalidate);
  clear.onclick=()=>{chosen.clear();invalidate();decorate();count.textContent='No passages selected';};
  function decorate(){
    for(const article of document.querySelectorAll('#passages article')){
      const button=article.querySelector('[data-page]');if(!button||!state.selected||!state.query)continue;
      let area=article.querySelector('.readingChoice');if(!area){area=node('div');area.className='readingChoice actions';article.append(area);}
      area.replaceChildren();
      for(const kind of ['passage','excerpt']){
        const value={resourceId:state.selected.resource.id,ordinal:Number(button.dataset.page),kind};
        const key=value.resourceId+':'+value.ordinal+':'+kind;
        const check=node('input',undefined,{type:'checkbox'});check.checked=chosen.has(key);
        check.onchange=()=>{if(check.checked)chosen.set(key,value);else chosen.delete(key);count.textContent=chosen.size+' selected passages';invalidate();};
        const label=node('label',kind==='passage'?' Include complete passage':' Include displayed excerpt');label.prepend(check);area.append(label);
      }
    }
  }
  function refreshContext(){
    const current=signature();if(current!==activeKey){activeKey=current;chosen.clear();invalidate();count.textContent='No passages selected';}
    const prior=saved.value;const matches=(state.status?.savedQueries??[]).filter(s=>s.q===state.query?.q&&s.mode===state.query?.mode);
    saved.replaceChildren(node('option','Current research question',{value:''}));
    for(const record of matches)saved.append(node('option',record.name+' · Revision '+record.revision,{value:record.id}));
    if(matches.some(s=>s.id===prior))saved.value=prior;
    if(capture&&captureKey!==JSON.stringify(request()))invalidate();
    preview.disabled=!state.query?.q;
    decorate();
  }
  const observer=new MutationObserver(records=>{if(records.some(r=>r.target.id==='passages'))decorate();});
  observer.observe(document.getElementById('passages'),{childList:true});
  reloadOperations().catch(error=>message(error.message));refreshContext();
  window.addEventListener('pagehide',()=>{disposed=true;observer.disconnect();},{once:true});
  return {refreshContext};
}
