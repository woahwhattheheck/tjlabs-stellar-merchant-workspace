// MIT. Following-edition choices inside the original offline recipient.
import {beginRecipientRenewal,openRecipientRenewal,editRecipientRenewal,saveRecipientRenewalChoice,completeRecipientRenewal,exportRecipientRenewal,recipientRenewalWorking,recipientRenewalReport,MAX_RENEWAL_BYTES} from './renewal.mjs';
import {exportRecipientReview} from './review.mjs';
export function createRecipientRenewalPanel(document,host){
 let model=null,saved=null,epoch=0,busy=false,error='',message='',query='',page=0;
 const node=(tag,value,attrs={})=>{const n=document.createElement(tag);if(value!==null)n.textContent=String(value??'');for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
 const button=(label,fn,disabled=false)=>{const b=node('button',label,{type:'button'});b.disabled=busy||disabled;b.addEventListener('click',()=>{try{fn();}catch(e){error=e.message;host.render();}});return b;};
 const section=(title,...children)=>{const n=node('section',null,{'data-recipient-renewal':'true'});n.append(node('h2',title),...children);return n;};
 const toolbar=(...children)=>{const n=node('div',null,{class:'toolbar'});n.append(...children);return n;};
 const details=(title,value)=>{const d=node('details',null);d.append(node('summary',title),node('pre',JSON.stringify(value,null,2)));return d;};
 const field=(label,name,values,{options,max=3000,area=false}={})=>{
  const l=node('label',null),f=node(options?'select':area?'textarea':'input',null,{'aria-label':label,name});
  if(options)for(const[value,title]of options)f.append(node('option',title,{value}));
  else f.setAttribute('maxlength',max);
  f.value=values[name]??'';f.disabled=busy;f.addEventListener('input',()=>{values[name]=f.value;host.changed();});
  l.append(node('span',label),f);return l;
 };
 // Small form drafts are kept separately until capture; typing never rehashes the source files.
 let forms={};
 const capture=()=>{if(model)for(const[id,value]of Object.entries(forms))if(JSON.stringify(value)!==JSON.stringify(model.value.drafts[id]??{}))model=editRecipientRenewal(model,id,value);return model;};
 const reset=value=>{epoch++;model=typeof value==='string'?openRecipientRenewal(value):value??null;forms=model?JSON.parse(JSON.stringify(model.value.drafts)):{};saved=model;busy=false;error='';message='';query='';page=0;};
 const text=()=>exportRecipientRenewal(capture());
 const dirty=()=>busy||model!==saved||(model&&Object.entries(forms).some(([id,v])=>JSON.stringify(v)!==JSON.stringify(model.value.drafts[id]??{})));
 const markSaved=()=>{capture();saved=model;};
 const download=(name,value,type='application/json;charset=utf-8')=>host.download(name,value,type);
 async function following(file){
  if(!file||busy)return;
  const context=host.capture(),generation=++epoch,original=host.workingText(),review=host.review();
  busy=true;host.busy(true);error='';message='';host.render();
  try{
   if(file.size>256*1024*1024)throw Error('Choose the complete following catalogue bundle, at most 256 MiB.');
   const bytes=new Uint8Array(await file.arrayBuffer()),source=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
   await new Promise(resolve=>setTimeout(resolve,20));if(generation!==epoch||!host.same(context))return;
   const next=beginRecipientRenewal(original,source,{id:crypto.randomUUID(),reviewer:review.reviewer,at:new Date().toISOString(),name:file.name});
   if(generation!==epoch||!host.same(context))return;
   model=next;forms={};saved=null;host.changed();message='Both complete catalogues and the prior working review are retained. Choose explicitly for each context; no author decision has changed.';
  }catch(e){if(generation===epoch&&host.same(context))error=e.message;}
  finally{if(generation===epoch&&host.same(context)){busy=false;host.busy(false);host.render();}}
 }
 function render(){
  if(!model){
   const s=section('Review a following catalogue edition',node('p','Keep the current named review, then select the author’s complete following catalogue. Original proposals and unfinished work remain retained alongside the new source.'));
   const file=node('input',null,{type:'file',accept:'.jsonl,.ndjson','aria-label':'Open following catalogue for re-review'});file.disabled=busy||!host.review()?.entries.length;file.addEventListener('change',e=>following(e.target.files[0]));
   s.append(file);if(error)s.append(node('p',error,{role:'alert',class:'error'}));return s;
  }
  const s=section('Following-edition re-review',node('p','Prior review: '+model.previous.review.reviewer+' · '+model.previous.review.id),node('p','Original edition '+model.previous.review.base.edition.id+' → selected following edition '+model.next.catalog.activeEditionId,{class:'mono'}));
  if(error)s.append(node('p',error,{role:'alert',class:'error'}));if(message)s.append(node('p',message,{role:'status'}));
  s.append(node('p','Carry keeps the exact prior material, proposed status and reason only when that material is unchanged. Revise requires an explicit current material, decision and reason. Leave out retains the complete prior proposal here and makes no new proposal; it does not reject or delete an author decision.'));
  s.append(toolbar(button('Download prior complete working review',()=>download('Material_Previous_Working.json',model.value.previous.text)),
   button('Download following original catalogue',()=>download(model.next.name,model.value.following.text,'application/x-ndjson;charset=utf-8')),
   button('Download complete re-review report',()=>download('Material_ReReview_Report.json',JSON.stringify(recipientRenewalReport(capture()),null,2)+'\n')),
   button('Return to prior working review',()=>{if(dirty()&&!document.defaultView.confirm('Cancel to save the complete re-review with both catalogues and unfinished choices. Continue only after preserving it.'))return;const previous=model.previous;reset(null);host.restorePrevious(previous);})
  ));
  const search=node('input',null,{type:'search','aria-label':'Search re-review contexts',maxlength:'400'});search.value=query;
  s.append(toolbar(search,button('Search re-review',()=>{query=search.value;page=0;host.render();})));
  const rows=model.comparison.rows.filter(r=>!query||JSON.stringify(r).toLocaleLowerCase('en-US').includes(query.toLocaleLowerCase('en-US')));
  const pages=Math.max(1,Math.ceil(rows.length/20));page=Math.min(page,pages-1);
  s.append(toolbar(node('span',rows.length+' contexts · page '+(page+1)+' of '+pages),button('Previous contexts',()=>{page--;host.render();},page===0),button('Next contexts',()=>{page++;host.render();},page+1>=pages)));
  for(const row of rows.slice(page*20,page*20+20)){
   const p=row.proposal,v=forms[row.id]??={...model.value.drafts[row.id]??model.value.choices[row.id]??{}};
   const card=node('article',null,{class:'source','data-renewal-context':row.id});card.append(node('h3',p.customerId+' · '+p.description),node('p',row.reason));
   const cols=node('div',null,{class:'renewal-comparison'});
   for(const[title,value]of [['Prior proposal',p],['Following material',row.currentMaterial],['Following author decision',row.current]]){
    const column=node('div',null);column.append(node('h4',title),value?node('p',(value.materialId??value.material?.materialId??'')+' · '+(value.status??value.title??'')):node('p','Absent in this selected source'),details('Complete '+title.toLowerCase(),value));cols.append(column);
   }card.append(cols);
   card.append(field('Re-review choice for '+p.customerId,'disposition',v,{options:[['','Choose explicitly'],...(row.eligible?[['carry','Carry unchanged proposal']]:[]),['revise','Revise against current material'],['omit','Leave out of new return']]}));
   const all=[...(model.next.materials.get(model.next.catalog.activeEditionId)??new Map()).values()],term=(v.search??'').toLocaleLowerCase('en-US'),matched=all.filter(x=>!term||(x.materialId+' '+x.title).toLocaleLowerCase('en-US').includes(term));
   let shown=matched.slice(0,100);const selected=all.find(x=>x.key===v.materialKey);if(selected&&!shown.some(x=>x.key===selected.key))shown=[selected,...shown];
   card.append(toolbar(field('Find current material for '+p.customerId,'search',v,{max:200}),button('Find current materials for '+p.customerId,()=>host.render())),node('p','Showing '+Math.min(100,matched.length)+' of '+matched.length+' current materials. Revise uses the explicitly selected record below.'));
   card.append(field('Current material for '+p.customerId,'materialKey',v,{options:[['','Choose for revised proposal'],...shown.map(x=>[x.key,x.materialId+' · '+x.title])]}),
    field('New proposed decision for '+p.customerId,'status',v,{options:[['','Choose for revised proposal'],['APPROVED','Approve this match'],['REJECTED','Reject this match']]}),
    field('New proposal reason for '+p.customerId,'note',v,{area:true}),
    field('Reason for re-review choice for '+p.customerId,'reason',v,{area:true}),
    button('Save re-review choice for '+p.customerId,()=>{capture();model=saveRecipientRenewalChoice(model,row.id,v,{at:new Date().toISOString()});host.changed();error='';message='The complete choice and its preceding revisions are retained.';host.render();}));
   if(model.value.choices[row.id])card.append(node('p','Saved: '+model.value.choices[row.id].disposition+' · '+model.value.choices[row.id].reason));
   s.append(card);
  }
  s.append(node('p',Object.keys(model.value.choices).length+' of '+model.comparison.rows.length+' contexts have saved choices; '+model.value.history.length+' full choice revisions retained.'));
  s.append(button('Complete new review return',()=>{capture();model=completeRecipientRenewal(model,{id:crypto.randomUUID(),at:new Date().toISOString()});host.changed();error='';message='The new review is complete and still requires the original author’s explicit receiving process.';host.render();}));
  for(const result of model.value.completions){
   const card=node('article',null,{class:'source','data-renewal-completion':result.id});
   card.append(node('h3','Complete return · '+result.at),node('p',result.review.entries.length+' proposed contexts · choice revision '+result.sequence),node('p',result.review.sha256,{class:'mono'}),
    toolbar(button('Download new return '+result.id,()=>download('Material_Review_'+result.id+'.json',exportRecipientReview(result.review))),
     button('Download new working review '+result.id,()=>download('Material_Working_'+result.id+'.json',recipientRenewalWorking(model,model.value.completions.indexOf(result))))),
    details('Complete retained result and original choices',result));
   s.append(card);
  }
  return s;
 }
 return{render,reset,text,model:()=>model,dirty,markSaved,busy:()=>busy};
}
