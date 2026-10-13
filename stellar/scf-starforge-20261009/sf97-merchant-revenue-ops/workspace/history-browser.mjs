// MIT. Browse original commercial records without changing the working draft.
export function createCommercialHistory({api,run,lock,renderReview,renderDecision,pinComparison}) {
  const $=id=>document.getElementById(id);
  let current=null,request=null,previous=[],opened=false;
  const text=(tag,value)=>{const node=document.createElement(tag);node.textContent=value;return node;};
  function query() {
    return {text:$('archive-text').value,from:$('archive-from').value||null,to:$('archive-to').value||null,
      observationKind:$('archive-kind').value==='reviews'?$('archive-observation').value||null:null,
      sourceVersion:$('archive-kind').value==='decisions'?$('archive-source').value.trim()||null:null};
  }
  function controls() {
    lock($('archive-previous'),!current||!previous.length);
    lock($('archive-next'),!current?.nextCursor);
    lock($('archive-observation'),$('archive-kind').value!=='reviews');
    lock($('archive-source'),$('archive-kind').value!=='decisions');
  }
  function render() {
    const results=$('archive-results');results.replaceChildren();
    const kind=current.selection.kind==='reviews'?'pricing reviews':'prepared price decisions';
    $('archive-caption').textContent=current.matchedRecords?
      current.range.from+'–'+current.range.to+' of '+current.matchedRecords+' matching '+kind+
      ' · '+current.totalRecords+' original records at this selection':
      'No matching '+kind+' · '+current.totalRecords+' original records at this selection';
    $('archive-applied').textContent='Applied filters: '+[
      current.query.text?'text “'+current.query.text+'”':null,
      current.query.from?'saved from '+current.query.from:null,
      current.query.to?'saved through '+current.query.to:null,
      current.query.observationKind,
      current.query.sourceVersion?'source review '+current.query.sourceVersion:null
    ].filter(Boolean).join(' · ') || 'All original records';
    if(!Object.values(current.query).some(Boolean)) $('archive-applied').textContent='Applied filters: all original records';
    $('archive-revision').textContent=current.selection.revision??'Empty original history';
    $('archive-new').textContent=current.newRecords?
      current.newRecords+' newer record'+(current.newRecords===1?'':'s')+' available. Include latest saves to browse them.':
      'Browsing a fixed original history. New saves leave these pages unchanged.';
    for(const item of current.rows) {
      const row=current.selection.kind==='reviews'?renderReview(item):renderDecision(item);
      if(current.selection.kind==='reviews') {
        const actions=document.createElement('div');actions.className='button-row archive-compare';
        for(const [side,label] of [['left','Use as first comparison'],['right','Use as second comparison']]) {
          const button=text('button',label);button.type='button';
          button.addEventListener('click',()=>{pinComparison(side,item);$('comparison-title').scrollIntoView({block:'start'});});
          actions.append(button);
        }
        row.append(actions);
      } else {
        const source=document.createElement('div');source.className='history-files';
        const show=text('button','Find original pricing review');show.type='button';
        show.addEventListener('click',()=>run(async()=>{
          $('archive-kind').value='reviews';$('archive-text').value=item.sourceVersion;
          $('archive-from').value='';$('archive-to').value='';$('archive-observation').value='';$('archive-source').value='';
          await load({kind:'reviews',query:query(),limit:Number($('archive-size').value)},[]);
        }));
        source.append(show);row.append(source);
      }
      results.append(row);
    }
    controls();
  }
  async function load(next,stack=previous) {
    const report=await api('/api/commercial-history',next);
    if(report.schema!=='stellar-forge.merchant-commercial-history.v1'||!Array.isArray(report.rows))
      throw new Error('The workspace did not return its original commercial history.');
    current=report;request={kind:report.selection.kind,selection:report.selection,query:report.query,
      limit:report.limit,cursor:next.cursor??null};previous=stack;opened=true;render();
  }
  $('archive-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
    const kind=$('archive-kind').value;
    await load({kind,query:query(),limit:Number($('archive-size').value),
      ...(current?.selection.kind===kind?{selection:current.selection}:{})},[]);
  });});
  $('archive-kind').addEventListener('change',controls);
  $('archive-latest').addEventListener('click',()=>run(async()=>{
    await load({kind:$('archive-kind').value,query:query(),limit:Number($('archive-size').value)},[]);
  }));
  $('archive-previous').addEventListener('click',()=>run(async()=>{
    if(!previous.length)return;const stack=previous.slice(0,-1);
    await load({...request,cursor:previous.at(-1)},stack);
  }));
  $('archive-next').addEventListener('click',()=>run(async()=>{
    if(!current?.nextCursor)return;
    await load({...request,cursor:current.nextCursor},[...previous,request.cursor??null]);
  }));
  $('commercial-archive').addEventListener('toggle',()=>{
    if($('commercial-archive').open&&!opened)run(()=>load({kind:'reviews',limit:25},[]));
  });
  function notifyHeads(state) {
    if(!current)return;
    const head=current.selection.kind==='reviews'?state.revision:state.repricing?.revision;
    if(head!==undefined&&head!==current.selection.revision)
      $('archive-new').textContent='The working history has newer saves. These pages retain their selected original revision. Choose Include latest saves to refresh.';
  }
  return {controls,notifyHeads,reload:()=>request?load(request):Promise.resolve()};
}
