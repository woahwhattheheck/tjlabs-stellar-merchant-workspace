// MIT. Recurring original-source commissioning in the existing private operator.
export function createSourceHistoryPanel({getState,perform,handle,saveEditor,changedSource,notice,intakeMapper}){
  const $=id=>document.getElementById(id),node=(tag,value)=>{const e=document.createElement(tag);if(value!==undefined)e.textContent=typeof value==='object'?JSON.stringify(value,null,2):String(value??'—');return e;};
  const detail=(title,value)=>{const e=node('details');e.append(node('summary',title),node('pre',value));return e;};
  const button=(label,key,value)=>{const e=node('button',label);e.type='button';e.dataset[key]=value;return e;};
  let historyPage=null,historyOffset=0,selected=null,comparison=null,offset=0,reuseOffset=0,criteria={status:'',search:''},selectedReuse=new Set(),choices={};
  function captureChoice(){
    if(selected?.comparison)choices[selected.intake.sha256]={comparisonSha256:selected.comparison.sha256,
      queryIds:[...selectedReuse],allEligible:$('reuse-all').checked};
  }
  function controls(busy=false){
    const state=getState();$('stage-form').querySelector('button[type=submit]').disabled=busy||!state?.intake||!state.editions.length;
    $('history-prev').disabled=busy||historyOffset===0;$('history-next').disabled=busy||!historyPage||historyOffset+25>=historyPage.total;
    $('comparison-prev').disabled=busy||!comparison||offset===0;$('comparison-next').disabled=busy||!comparison||offset+25>=comparison.total;
    $('reuse-prev').disabled=busy||!comparison||reuseOffset===0;$('reuse-next').disabled=busy||!comparison||reuseOffset+25>=comparison.reusableTotal;
    $('activate-source').disabled=busy||!selected||selected.active;
    $('reuse-all').disabled=busy||!selected||Boolean(selected.activatedAt);
    $('comparison-filter').querySelector('button').disabled=busy||!selected?.comparison;
  }
  function render(busy=false){
    const state=getState();if(!state)return;
    const select=$('stage-baseline'),saved=select.value;select.replaceChildren();
    for(const edition of [...state.editions].reverse()){const o=node('option',edition.name+' · '+edition.id);o.value=edition.id;select.append(o);}
    if(state.editions.some(e=>e.id===saved))select.value=saved;else if(state.activeEditionId)select.value=state.activeEditionId;
    if(selected)selected={...selected,active:selected.intake.sha256===state.intake?.sha256};
    controls(busy);
  }
  async function history(page=historyOffset){
    const result=await perform('source.history',{offset:page,limit:25});historyPage=result;historyOffset=page;
    $('history-list').replaceChildren(node('p','Sources '+(result.total?page+1:0)+'–'+Math.min(page+25,result.total)+' of '+result.total));
    for(const source of result.sources){
      const card=node('article');card.className='card';
      card.append(node('h3',source.source.name),node('p',(source.active?'Active editor source · ':source.activatedAt?'Retained source · ':'Staged, not active · ')+source.summary.rows+' rows'),
        node('p','Intake '+source.intake.sha256),node('p','Baseline '+(source.baselineEditionId??'First original source')),
        button(source.comparison?'Review changes and choose source':'Choose original source','source-select',source.intake.sha256));
      $('history-list').append(card);
    }
    controls();
  }
  function renderSelected(){
    $('comparison-selection').replaceChildren();
    if(!selected)return;
    $('comparison-source').value=selected.intake.sha256;
    $('comparison-selection').append(node('h3',selected.source.name),detail('Original source and selected comparison',selected));
    $('comparison-heading').textContent=selected.comparison?'Changes from the frozen baseline':'First original source';
  }
  function renderComparison(){
    const area=$('comparison-rows'),reuse=$('reuse-rows');area.replaceChildren();reuse.replaceChildren();
    if(!comparison){area.append(node('p','This first source has no earlier edition. Its original rows and review remain in Source and Review addresses.'));controls();return;}
    area.append(node('p','Applied filter: '+(criteria.status||'all change types')+'; search: '+(criteria.search||'none')+'.'),
      node('p','Showing '+(comparison.total?offset+1:0)+'–'+Math.min(offset+25,comparison.total)+' of '+comparison.total+' matching original changes.'),
      detail('Baseline, source identity and complete summary',comparison.comparison));
    for(const row of comparison.rows){
      const card=node('article');card.className='card';card.append(node('h3',row.status+' · '+(row.identity??'No business identity')),
        node('p','Original row '+(row.beforeOrdinal??'—')+' → following row '+(row.afterOrdinal??'—')),
        node('p','Changed fields: '+(row.changedFields.join(', ')||'none')),detail('Both complete original records',row));
      area.append(card);
    }
    reuse.append(node('p',comparison.reusableTotal+' exact-query baseline decisions are available. Selected explicitly: '+selectedReuse.size+'. Candidate reuse never marks a new query as approved.'));
    for(const row of comparison.reusableQueries){
      const card=node('article');card.className='card';const label=node('label'),check=node('input');check.type='checkbox';check.dataset.reuse=row.queryId;
      check.checked=selectedReuse.has(row.queryId);check.disabled=Boolean(selected.activatedAt);label.append(check,node('span',Object.values(row.params).join(', ')));
      card.append(label,node('p',row.baselineDecision.action+' · '+row.coordinateChoice+' · '+row.sourceOrdinals.length+' following source rows'),
        detail('Original retained decision and response',row));reuse.append(card);
    }
    controls();
  }
  async function inspect(sha,{page=0,reusePage=0,filter=criteria,newSelection=false}={}){
    if(newSelection)captureChoice();
    let entry=selected;
    if(newSelection||!entry||entry.intake.sha256!==sha){
      let found=historyPage?.sources.find(e=>e.intake.sha256===sha);
      if(!found){let pos=0;do{const r=await perform('source.history',{offset:pos,limit:250});found=r.sources.find(e=>e.intake.sha256===sha);pos+=250;if(found||pos>=r.total)break;}while(true);}
      if(!found)throw new Error('Choose a retained source from this workspace history.');entry=found;
    }
    const result=entry.comparison?await perform('source.compare',{sourceSha256:sha,offset:page,limit:25,reuseOffset:reusePage,reuseLimit:25,...filter}):null;
    // Do not replace displayed selections or offsets until the complete read succeeds.
    selected=result?.source??entry;comparison=result;offset=page;reuseOffset=reusePage;criteria={...filter};
    if(newSelection){
      const choice=choices[sha],valid=choice?.comparisonSha256===selected.comparison?.sha256;
      selectedReuse=new Set(valid&&Array.isArray(choice.queryIds)?choice.queryIds:[]);$('reuse-all').checked=Boolean(valid&&choice.allEligible);
    }
    renderSelected();renderComparison();
  }
  $('stage-form').onsubmit=event=>{event.preventDefault();void handle(async()=>{
    const input=await intakeMapper.payload();
    const result=await perform('source.stage',{...input,baselineEditionId:$('stage-baseline').value});
    $('stage-file').value='';await history();await inspect(result.source.intake.sha256,{newSelection:true});
    notice('Following source retained for review. The current editor source and selected customer edition remain unchanged.');
  });};
  $('history-load').onclick=()=>void handle(()=>history(0));
  $('history-prev').onclick=()=>void handle(()=>history(Math.max(0,historyOffset-25)));
  $('history-next').onclick=()=>void handle(()=>history(historyOffset+25));
  $('history-list').onclick=event=>{const e=event.target.closest('[data-source-select]');if(e)void handle(()=>inspect(e.dataset.sourceSelect,{newSelection:true}));};
  $('reopen-comparison').onclick=()=>void handle(()=>inspect($('comparison-source').value.trim(),{newSelection:true}));
  $('comparison-filter').onsubmit=event=>{event.preventDefault();void handle(()=>inspect(selected.intake.sha256,{page:0,reusePage:reuseOffset,
    filter:{status:$('comparison-status').value,search:$('comparison-search').value}}));};
  $('comparison-prev').onclick=()=>void handle(()=>inspect(selected.intake.sha256,{page:Math.max(0,offset-25),reusePage:reuseOffset}));
  $('comparison-next').onclick=()=>void handle(()=>inspect(selected.intake.sha256,{page:offset+25,reusePage:reuseOffset}));
  $('reuse-prev').onclick=()=>void handle(()=>inspect(selected.intake.sha256,{page:offset,reusePage:Math.max(0,reuseOffset-25)}));
  $('reuse-next').onclick=()=>void handle(()=>inspect(selected.intake.sha256,{page:offset,reusePage:reuseOffset+25}));
  $('reuse-rows').onchange=event=>{const e=event.target.closest('[data-reuse]');if(e){if(e.checked)selectedReuse.add(e.dataset.reuse);else selectedReuse.delete(e.dataset.reuse);}};
  $('activate-source').onclick=()=>void handle(async()=>{
    if(!selected)throw new Error('Choose the exact retained source first.');
    if([...document.querySelectorAll('input[type=file]')].some(e=>e.files?.length))throw new Error('Retain or explicitly clear selected files before switching source.');
    const sha=selected.intake.sha256,first=!selected.activatedAt,all=first&&$('reuse-all').checked,ids=first?[...selectedReuse]:[];
    const payload={sourceSha256:sha,...(first?{expectedComparisonSha256:selected.comparison.sha256,...(all?{reuseAllEligible:true}:{reuseQueryIds:ids})}:{})};
    if(all||ids.length){payload.reviewer=$('reuse-reviewer').value;payload.note=$('reuse-note').value;}
    await saveEditor();await perform('source.activate',payload);await changedSource();await history();await inspect(sha,{newSelection:true});
    notice('Source selected; its saved forms are restored. The selected frozen customer edition is unchanged. Review addresses and build the next edition when ready.');
  });
  return {render,controls,
    capture(){captureChoice();return {choices:structuredClone(choices),selectedSourceSha256:selected?.intake.sha256??$('comparison-source').value};},
    restore(value){choices=value&&typeof value.choices==='object'&&value.choices?structuredClone(value.choices):{};
      if(typeof value?.selectedSourceSha256==='string')$('comparison-source').value=value.selectedSourceSha256;},
    clear(){historyPage=null;selected=null;comparison=null;selectedReuse=new Set();choices={};historyOffset=offset=reuseOffset=0;$('history-list').replaceChildren();$('comparison-rows').replaceChildren();$('reuse-rows').replaceChildren();$('comparison-selection').replaceChildren();$('comparison-source').value='';}};
}
