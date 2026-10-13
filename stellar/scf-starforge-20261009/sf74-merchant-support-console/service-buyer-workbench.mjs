// MIT. Source-linked navigation for the original Service/buyer case materials.
// Rendering never prepares, retains or executes a financial operation.
export function buyerWorkflowGroups(view,selection={}){
  const groups=view?.workflow?.groups??[];
  return groups.filter(group=>(!selection.captureOutcomeId||group.capture.id===selection.captureOutcomeId)&&
    (!selection.buyerWorkspace||group.buyer.alias===selection.buyerWorkspace)&&
    (!selection.workspaceId||group.buyer.workspaceId===selection.workspaceId));
}
export function buyerWorkflowActions(view,selection={}){
  return buyerWorkflowGroups(view,selection).flatMap(group=>group.actions.map(action=>({...action,groupId:group.id,
    capture:group.capture,buyer:group.buyer})));
}
const labels={receipt:'Receive and review',coding:'Purchase and credit coding',period:'Review and close period',
  delivery:'Complete buyer delivery',accountant:'Accountant handoff and return',other:'Other saved work'};
const actionName=value=>value.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
export function createBuyerWorkbench(root,{run,selectGroup,readRecord,useReferences,downloadFile,downloadRecord}){
  const node=id=>root.querySelector('[data-workbench="'+id+'"]');
  let current={view:null,selection:{}},offset=0;
  const pageSize=20;
  const button=(label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;
    b.addEventListener('click',()=>run(fn));return b;};
  function render(view,selection={},keepPage=false){
    current={view,selection};if(!keepPage)offset=0;
    const groups=buyerWorkflowGroups(view,selection),actions=buyerWorkflowActions(view,selection);
    const picker=node('group'),selected=picker.value;picker.replaceChildren(new Option('Choose a saved buyer workflow',''));
    for(const group of view?.workflow?.groups??[]){
      const label=group.buyer.alias+' · '+group.buyer.workspaceId.slice(0,12)+' · capture '+group.capture.id.slice(0,8)+' · '+group.actions.length+' saved actions';
      picker.append(new Option(label,group.id));
    }
    if([...picker.options].some(option=>option.value===selected))picker.value=selected;
    if(groups.length===1)picker.value=groups[0].id;
    node('scope').textContent=selection.captureOutcomeId&&selection.buyerWorkspace?
      'Showing capture '+selection.captureOutcomeId+' in '+selection.buyerWorkspace+
      (selection.workspaceId?' · original workspace '+selection.workspaceId:'. Read the buyer to confirm its current workspace identity.') :
      'Select the capture and configured buyer, or reopen one of the saved workflows.';
    node('stages').replaceChildren();
    for(const [id,label] of Object.entries(labels)){
      const rows=actions.filter(row=>row.stage===id);if(!rows.length)continue;
      const p=document.createElement('p');p.textContent=label+': '+rows.filter(row=>row.outcome).length+
        ' saved outcomes · '+rows.filter(row=>!row.outcome).length+' actions without a case outcome.';node('stages').append(p);
    }
    const target=node('actions');target.replaceChildren();
    if(!actions.length){const p=document.createElement('p');p.textContent='No saved buyer actions for this selection.';target.append(p);}
    else{
      const table=document.createElement('table'),head=document.createElement('thead'),hr=document.createElement('tr');
      for(const label of ['Saved','Operation','Original references','Case status','Open']){const th=document.createElement('th');th.textContent=label;hr.append(th);}
      head.append(hr);table.append(head);const body=document.createElement('tbody');
      const sorted=[...actions].reverse();
      if(offset>=sorted.length)offset=Math.max(0,Math.floor((sorted.length-1)/pageSize)*pageSize);
      for(const row of sorted.slice(offset,offset+pageSize)){
        const tr=document.createElement('tr');
        const refs=Object.entries(row.reference).filter(([,v])=>v).map(([k,v])=>k.replace(/Id$/,'')+': '+v).join('\n');
        for(const text of [row.outcome?.createdAt??row.preparedAt,actionName(row.action),refs||row.id,
          row.outcome?'Outcome saved':'Action saved; recover original request to establish outcome']){
          const td=document.createElement('td');td.textContent=text;tr.append(td);
        }
        const td=document.createElement('td'),controls=document.createElement('div');controls.className='actions';
        controls.append(button('Use references',()=>useReferences(row)),
          button('Prepared action',()=>showRecord('intents',row.id)));
        if(row.outcome)controls.append(button('Original outcome',()=>showRecord('outcomes',row.outcome.id)));
        for(const file of row.outcome?.files??[])controls.append(button(file.name,()=>downloadFile(row.outcome.id,file.name)));
        td.append(controls);tr.append(td);body.append(tr);
      }
      table.append(body);target.append(table);
    }
    node('page').textContent=actions.length?String(offset+1)+'–'+Math.min(offset+pageSize,actions.length)+' of '+actions.length:'0 saved actions';
    node('previous').hidden=offset===0;node('next').hidden=offset+pageSize>=actions.length;
  }
  async function showRecord(section,id){
    const record=await readRecord(section,id),target=node('record');target.replaceChildren();
    const header=document.createElement('h3');header.textContent=section==='intents'?'Complete original prepared action':'Complete original outcome';
    const p=document.createElement('p');p.textContent=id;
    const pre=document.createElement('pre');pre.textContent=JSON.stringify(record,(key,value)=>/base64/i.test(key)&&typeof value==='string'?'['+value.length+' encoded characters; included in the complete JSON download]':value,2);
    target.append(header,p,button('Download complete original JSON',()=>downloadRecord(section,id,record)),pre);target.hidden=false;target.closest('details').open=true;target.scrollIntoView({behavior:'smooth',block:'start'});
  }
  node('open').addEventListener('click',()=>run(async()=>{
    const selected=(current.view?.workflow?.groups??[]).find(group=>group.id===node('group').value);
    if(!selected)throw new Error('Choose a saved buyer workflow.');
    await selectGroup(selected);
  }));
  node('previous').addEventListener('click',()=>{offset=Math.max(0,offset-pageSize);render(current.view,current.selection,true);});
  node('next').addEventListener('click',()=>{offset+=pageSize;render(current.view,current.selection,true);});
  return {render,clearRecord(){node('record').replaceChildren();node('record').hidden=true;}};
}
