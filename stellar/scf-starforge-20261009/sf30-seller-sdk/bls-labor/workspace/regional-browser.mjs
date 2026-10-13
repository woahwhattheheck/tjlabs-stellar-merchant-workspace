// Complete saved regional analysis in the original BLS workspace.
import {createRegionalCharts,isRegionalChartRow} from './regional-chart.mjs';
const $=id=>document.getElementById(id);
const text=(tag,value)=>{const node=document.createElement(tag);if(value!==undefined)node.textContent=String(value??'');return node;};
const pretty=value=>JSON.stringify(value,null,2);
const bytes=value=>new TextEncoder().encode(value).length;
const values=field=>String(field??'').split(/[,\s]+/).map(value=>value.trim()).filter(Boolean);
const integerList=(field,label)=>{const items=values(field);if(!items.length||items.some(x=>!/^\d+$/.test(x)))throw new Error('Enter the original '+label+' as separate integers.');return items.map(Number);};
export function mountRegionalAnalysis({api,query,mutate,download,run,notice,saveLocal,readLocal,getPages}){
  const form=$('regional-form');
  let initialized=false,applying=false,selectedReport=null,readSequence=0,readerController=null,tableOffset=0,nextOffset=null;
  const field=name=>form.elements.namedItem(name);
  const event=(id,action)=>$(id).addEventListener('click',()=>run(action));
  function raw(){
    const out={};
    for(const name of ['edition_id','title','region_name','narrative','years','chart_counties','seasonal','ownership_code','industry_code','size_code','quarters','previous_report_id'])out[name]=String(field(name).value??'');
    out.counties=[...form.querySelectorAll('[name=counties]:checked')].map(box=>box.value);
    out.period_kinds=[...form.querySelectorAll('[name=period_kinds]:checked')].map(box=>box.value);
    out.laus=field('laus').checked;out.qcew=field('qcew').checked;return out;
  }
  function current(){
    const value=raw();
    if(!value.edition_id)throw new Error('Receive a complete source edition before preparing a regional analysis.');
    if(!value.title.trim()||!value.region_name.trim())throw new Error('Name the customer analysis and selected region.');
    if(!value.counties.length)throw new Error('Select the complete county membership of this region.');
    if(!value.laus&&!value.qcew)throw new Error('Choose resident labor, workplace observations or both.');
    if(value.laus&&!value.period_kinds.length)throw new Error('Choose monthly resident observations, annual averages or both.');
    return {edition_id:value.edition_id,title:value.title,region_name:value.region_name,narrative:value.narrative,
      counties:value.counties,years:integerList(value.years,'years'),chart_counties:values(value.chart_counties),
      previous_report_id:value.previous_report_id||null,
      laus:value.laus?{seasonal:value.seasonal,period_kinds:value.period_kinds}:null,
      qcew:value.qcew?{ownership_code:value.ownership_code,industry_code:value.industry_code,size_code:value.size_code,
        quarters:integerList(value.quarters,'quarters')}:null};
  }
  function enabled(){
    $('regional-laus-fields').disabled=!field('laus').checked;
    $('regional-qcew-fields').disabled=!field('qcew').checked;
    $('regional-parent').textContent=field('previous_report_id').value?'Next revision of saved analysis '+field('previous_report_id').value+'.':'First saved analysis in this customer series.';
  }
  function countyOptions(selected,available){
    const target=$('regional-counties');target.replaceChildren();
    const all=[...new Set([...(available||[]),...(selected||[])])].sort();
    for(const code of all){const label=text('label'),box=document.createElement('input');label.className='check';box.type='checkbox';box.name='counties';box.value=code;box.checked=selected?.includes(code)??false;label.append(box,text('span',code));target.append(label);}
    if(!all.length)target.append(text('p','Receive an original source edition to select its county membership.'));
  }
  function selectedEdition(){return getPages().editions.find(row=>row.id===field('edition_id').value);}
  function setSourceDefaults(preserve=false){
    const edition=selectedEdition();if(!edition)return;
    const selected=edition.selection,old=raw(),counties=preserve?old.counties.filter(x=>selected.counties.includes(x)):selected.counties;
    countyOptions(counties,selected.counties);
    if(!preserve){
      field('years').value=[...new Set([...(selected.laus?.years||[]),...(selected.qcew?.periods||[]).map(x=>x.year)])].sort().join(', ');
      field('chart_counties').value=selected.counties.slice(0,8).join(', ');
      field('seasonal').value=selected.laus?.seasonal?.[0]||'U';
      field('ownership_code').value=selected.qcew?.ownership_codes?.[0]||'0';
      field('industry_code').value=selected.qcew?.industry_codes?.[0]||'10';
      field('size_code').value=selected.qcew?.size_codes?.[0]||'0';
      field('quarters').value=[...new Set((selected.qcew?.periods||[]).map(x=>x.quarter))].sort().join(', ')||'1, 2, 3, 4';
    }
    $('regional-source-info').textContent=edition.title+' · '+edition.counts.laus+' resident observations and '+edition.counts.qcew+' workplace observations in the retained edition.';
  }
  function applyRaw(value){
    applying=true;
    try{
      for(const name of ['edition_id','title','region_name','narrative','years','chart_counties','seasonal','ownership_code','industry_code','size_code','quarters','previous_report_id']){
        if(value[name]!==undefined){
          if(name==='edition_id'&&value[name]&&![...field(name).options].some(option=>option.value===value[name])){
            const option=text('option',value[name]+' · retained draft selection');option.value=value[name];field(name).append(option);
          }
          field(name).value=String(value[name]);
        }
      }
      field('laus').checked=Boolean(value.laus);field('qcew').checked=Boolean(value.qcew);
      for(const box of form.querySelectorAll('[name=period_kinds]'))box.checked=value.period_kinds?.includes(box.value)??false;
      countyOptions(value.counties||[],selectedEdition()?.selection.counties||value.counties||[]);
      enabled();setSourceDefaults(true);
    }finally{applying=false;}
  }
  function applyInput(input){
    applyRaw({edition_id:input.edition_id,title:input.title,region_name:input.region_name,narrative:input.narrative,
      years:input.years.join(', '),chart_counties:(input.chart_counties||[]).join(', '),counties:input.counties,
      previous_report_id:input.previous_report_id||'',laus:input.laus!==null,qcew:input.qcew!==null,
      seasonal:input.laus?.seasonal||'U',period_kinds:input.laus?.period_kinds||[],
      ownership_code:input.qcew?.ownership_code||'0',industry_code:input.qcew?.industry_code||'10',
      size_code:input.qcew?.size_code||'0',quarters:input.qcew?.quarters.join(', ')||'1, 2, 3, 4'});
    saveLocal('regional-draft',raw());
  }
  function remember(){if(initialized&&!applying){saveLocal('regional-draft',raw());enabled();}}
  form.addEventListener('input',()=>run(async()=>remember()));
  form.addEventListener('change',()=>run(async()=>remember()));
  field('edition_id').addEventListener('change',()=>run(async()=>{setSourceDefaults(true);remember();}));
  form.addEventListener('submit',event=>{event.preventDefault();run(async()=>{
    const input=current(),snapshot=JSON.stringify(raw());saveLocal('regional-draft',raw());
    const operation=await mutate('regional',input);
    if(operation?.state==='complete'){
      if(JSON.stringify(raw())===snapshot){applyInput({...input,previous_report_id:operation.id});notice('Saved the complete regional analysis. The form now prepares its next revision.');}
      else notice('Saved the original regional selection. Your later form edits remain in the working draft.');
    }
  });});
  function update(){
    const editions=getPages().editions,currentEdition=field('edition_id').value,options=editions.map(row=>{const option=text('option',row.title+' · '+row.id);option.value=row.id;return option;});
    if(currentEdition&&!editions.some(row=>row.id===currentEdition)){const option=text('option',currentEdition+' · retained selection');option.value=currentEdition;options.push(option);}
    field('edition_id').replaceChildren(...options);
    if(currentEdition)field('edition_id').value=currentEdition;
    if(!initialized){
      initialized=true;let retained;
      try{retained=readLocal('regional-draft');}catch(issue){notice('The regional browser draft could not be read: '+issue.message,true);}
      if(retained)applyRaw(retained);else setSourceDefaults(false);
      enabled();
    }else if(!currentEdition&&editions.length){setSourceDefaults(false);enabled();}
    const reports=getPages().reports.filter(row=>row.kind==='regional'),list=$('regional-saved');
    list.replaceChildren();
    if(!reports.length)list.append(text('p','Save a complete regional analysis to keep its charts, original inputs, customer files and subsequent revisions.'));
    for(const report of reports){
      const row=text('div');row.className='regional-saved-row';row.append(text('strong',report.title),text('span',report.row_count+' values · '+report.edition+' · '+report.created));
      for(const[label,action]of [['Open analysis',()=>show(report.id)],['Revise this analysis',()=>revise(report.id)],['Download complete analysis ZIP',()=>download('report',report.id,'analysis.zip')]]){
        const button=text('button',label);button.type='button';button.addEventListener('click',()=>run(action));row.append(button);
      }
      list.append(row);
    }
  }
  async function revise(id){
    const definition=await api(query('/api/regional-definition',{id}));
    const received=await api('/api/regional-definition/receive',{method:'POST',body:definition});
    applyInput(received.input);$('regional-analysis').scrollIntoView();field('title').focus();
    notice('Opened the complete definition from '+id+'. Edit its customer commentary, region or source selection, then save a new analysis revision.');
  }
  async function receiveFile(){
    const file=$('regional-definition-file').files[0];if(!file)throw new Error('Choose the original regional-definition.json.');
    if(file.size<=0||file.size>8*1024*1024)throw new Error('Choose a complete analysis definition up to 8 MiB.');
    let document;try{document=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer()));}catch{throw new Error('The complete definition must be UTF-8 JSON.');}
    if(bytes(JSON.stringify(document))>8*1024*1024)throw new Error('The encoded definition exceeds the original API limit.');
    const received=await api('/api/regional-definition/receive',{method:'POST',body:document});
    applyInput(received.input);notice('Received the original analysis definition and opened its next editable revision.');
  }
  function rowTable(rows,offset,total){
    const table=$('regional-values');table.replaceChildren();
    for(const row of rows){
      const tr=text('tr'),source=text('td'),details=text('details');details.append(text('summary','Formula and complete source membership'),text('pre',pretty(row)));source.append(details);
      const annual=row.annual_change||{};
      for(const value of [row.area_name,row.measure_name,row.year+' '+row.period,row.value_decimal??'Unavailable',row.unit,
        annual.value_decimal===null||annual.value_decimal===undefined?annual.status:annual.value_decimal+' '+String(annual.unit??row.unit).replaceAll('_',' '),row.calculation_status])tr.append(text('td',value));
      tr.append(source);table.append(tr);
    }
    $('regional-table-count').textContent='Showing '+(rows.length?offset+1:0)+'–'+(offset+rows.length)+' of '+total+' complete analysis values.';
    tableOffset=offset;nextOffset=offset+rows.length<total?offset+rows.length:null;
    $('regional-values-previous').disabled=offset===0;$('regional-values-next').disabled=nextOffset===null;
  }
  async function tablePage(offset){
    if(!selectedReport)return;
    const selected=selectedReport,received=await api(query('/api/report',{id:selected.id,offset,limit:200}));
    if(selectedReport?.id!==selected.id)return;
    rowTable(received.rows,offset,received.total);
  }
  async function show(id){
    readerController?.abort();const controller=new AbortController();readerController=controller;
    const sequence=++readSequence;
    let reader;
    try{
    const result=await api(query('/api/report',{id,offset:0,limit:200}),{signal:controller.signal});
    if(sequence!==readSequence)return;
    const metadata=result.metadata;
    if(metadata.schema!=='stellar-forge.bls-regional-analysis.v1'||metadata.kind!=='regional')throw new Error('Choose an original complete regional analysis.');
    selectedReport={id,metadata};$('regional-view').hidden=false;$('regional-view-title').textContent=metadata.title;
    $('regional-view-summary').textContent='Revision '+metadata.analysis_revision+' · '+metadata.row_count+' values · '+metadata.original_observation_count+' original observations · '+metadata.edition_id;
    $('regional-view-commentary').textContent=metadata.request.narrative;
    $('regional-methods').replaceChildren(...metadata.methodology.map(item=>{const p=text('p',item.meaning+' '),a=text('a','Original BLS definition');const url=new URL(item.url);if(url.protocol==='https:'&&url.hostname==='www.bls.gov'){a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';p.append(a);}return p;}));
    $('regional-view-history').textContent=metadata.previous_report_id?'Continues '+metadata.previous_report_id+' · '+pretty(metadata.revision_changes):'First saved analysis in this customer series.';
    rowTable(result.rows,0,result.total);
    $('regional-view-files').replaceChildren();
    for(const name of ['analysis.zip','report.html','report.csv','report.json','original-observations.jsonl','regional-definition.json','regional-changes.json']){
      const button=text('button',name);button.type='button';button.addEventListener('click',()=>run(()=>download('report',id,name)));$('regional-view-files').append(button);
    }
    const reviseButton=text('button','Revise this saved analysis');reviseButton.type='button';reviseButton.addEventListener('click',()=>run(()=>revise(id)));$('regional-view-files').append(reviseButton);
    $('regional-charts').replaceChildren();$('regional-chart-status').textContent='Reading the complete saved series…';$('regional-cancel-read').hidden=false;
    const original=await api(query('/api/file',{kind:'report',id,name:'rows.jsonl'}),{raw:true,signal:controller.signal});
    if(!original.body)throw new Error('The complete regional value stream is unavailable.');
    reader=original.body.getReader();
    const decoder=new TextDecoder('utf-8',{fatal:true}),chartRows=[];
    let buffer='',count=0;
    const selected=new Set(['region',...metadata.request.chart_counties]);
    const accept=line=>{
      if(!line.trim())return;
      const row=JSON.parse(line);count++;
      if(count>metadata.row_count)throw new Error('The complete saved value stream differs from its analysis.');
      if(selected.has(row.area_key)&&isRegionalChartRow(row))chartRows.push(row);
    };
      for(;;){
        const {done,value}=await reader.read();if(done)break;
        if(sequence!==readSequence){await reader.cancel();return;}
        buffer+=decoder.decode(value,{stream:true});
        let end;while((end=buffer.indexOf('\n'))>=0){accept(buffer.slice(0,end));buffer=buffer.slice(end+1);}
        if(buffer.length>2*1024*1024)throw new Error('An original regional statistic row exceeds its complete value limit.');
        $('regional-chart-status').textContent='Read '+count.toLocaleString()+' of '+metadata.row_count.toLocaleString()+' saved analysis values.';
      }
      buffer+=decoder.decode();if(buffer.trim())accept(buffer);
      if(count!==metadata.row_count)throw new Error('The regional stream ended before all saved values were received.');
      if(sequence!==readSequence)return;
      $('regional-charts').append(createRegionalCharts(chartRows));
      $('regional-chart-status').textContent='Complete saved series received. Charts show this region and '+metadata.request.chart_counties.length+' selected counties; the full tables and downloads retain every selected county.';
      $('regional-view').scrollIntoView();
    }catch(issue){
      if(controller.signal.aborted){if(sequence===readSequence)$('regional-chart-status').textContent='Chart reading stopped. The saved complete analysis and downloads remain available.';}
      else throw issue;
    }finally{
      if(reader){await reader.cancel().catch(()=>{});reader.releaseLock();}
      if(sequence===readSequence)$('regional-cancel-read').hidden=true;
      if(readerController===controller)readerController=null;
    }
  }
  event('regional-use-edition',async()=>{setSourceDefaults(false);remember();notice('Loaded the original source selection into this analysis.');});
  event('regional-new',async()=>{field('previous_report_id').value='';field('title').value='Regional labor analysis';field('narrative').value='';setSourceDefaults(false);remember();notice('Prepared a new regional analysis using the complete selected source.');});
  event('regional-import-definition',receiveFile);
  event('regional-values-previous',()=>tablePage(Math.max(0,tableOffset-200)));
  event('regional-values-next',()=>tablePage(nextOffset??0));
  event('regional-cancel-read',async()=>readerController?.abort());
  return Object.freeze({update,show,revise});
}
