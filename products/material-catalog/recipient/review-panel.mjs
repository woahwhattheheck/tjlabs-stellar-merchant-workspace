// MIT. Local named review and explicit author comparison over the original recipient.
import {createRecipientReview,saveRecipientProposal,exportRecipientReview,openRecipientReview,recipientView,compareRecipientReview,selectRecipientAdoption,exportRecipientWorking,openRecipientWorking,MAX_REVIEW_BYTES,MAX_WORKING_BYTES} from './review.mjs';
export function createRecipientReviewPanel(document,host){
 let review=null,draft={},returned=null,comparison=null,choices={},receiving={},epoch=0,busy=false,message='',error='',dirty=false,savedReview=null;
 const node=(tag,value,attrs={})=>{const n=document.createElement(tag);if(value!==null)n.textContent=String(value??'');for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
 const button=(label,fn,disabled=false)=>{const b=node('button',label,{type:'button'});b.disabled=disabled||busy;b.addEventListener('click',()=>{try{fn();}catch(e){error=e.message;host.render();}});return b;};
 const field=(label,name,values,{kind='input',max=3000,options}={})=>{
  const l=node('label',null),caption=node('span',label),f=node(kind,null,{name,'aria-label':label});f.disabled=busy;
  if(options)for(const[value,title]of options){const o=node('option',title,{value});f.append(o);}
  else if(kind!=='select')f.setAttribute('maxlength',max);
  f.value=values[name]??'';f.addEventListener('input',()=>{values[name]=f.value;dirty=true;});
  l.append(caption,f);return l;
 };
 const section=(title,...children)=>{const s=node('section',null);s.append(node('h2',title),...children);return s;};
 const toolbar=(...children)=>{const d=node('div',null,{class:'toolbar'});d.append(...children);return d;};
 const jsonDownload=(name,value)=>host.download(name,JSON.stringify(value,null,2)+'\n','application/json;charset=utf-8');
 const current=()=>host.bundle();
 const capture=()=>({epoch,bundle:current()});
 const same=c=>c.epoch===epoch&&c.bundle===current();
 const acknowledge=()=>{error='';message='';};
 function authorSnapshot(){return returned&&comparison?{returned,comparisonSha256:comparison.sha256,choices,receiving}:null;}
 function snapshot(){return {review,draft,author:authorSnapshot()};}
 function reset(value={}){
  epoch++;review=value.review??null;draft=value.draft??{};returned=value.author?.returned??null;comparison=returned?compareRecipientReview(recipientView(current()),returned):null;choices=value.author?.choices??{};receiving=value.author?.receiving??{};busy=false;error='';message='';dirty=false;savedReview=review;
 }
 function invalidate(){epoch++;returned=null;comparison=null;choices={};receiving={};}
 function setBusy(value){busy=value;}
 function hasUnsaved(){return dirty||review!==savedReview||busy;}
 function markSaved(){savedReview=review;dirty=false;}
 function workingText(){return exportRecipientWorking(current(),review,draft,authorSnapshot());}
 async function restore(file){
  if(!file||busy)return;
  if(hasUnsaved()&&!document.defaultView.confirm('Cancel to save the complete current working review first. Choose OK only after preserving it.'))return;
  const c=capture();busy=true;acknowledge();host.render();
  try{
   if(file.size>MAX_WORKING_BYTES)throw Error('Choose a complete working copy of at most 400 MiB.');
   const source=await file.text();if(!same(c))return;
   const opened=openRecipientWorking(source);if(!same(c))return;
   host.replace(opened.bundle,opened);message='The complete original bundle, saved review and unfinished form are restored.';
  }catch(e){if(same(c)){error=e.message;host.render();}}
  finally{if(same(c)){busy=false;host.render();}}
 }
 async function readReturn(file){
  if(!file||busy)return;
  if(returned&&hasUnsaved()&&!document.defaultView.confirm('Cancel to save the complete current author review and receiving choices first. Choose OK only after preserving them.'))return;
  const c=capture();busy=true;acknowledge();host.render();
  try{
   if(file.size>MAX_REVIEW_BYTES)throw Error('Choose a complete named return of at most 4 MiB.');
   const source=await file.text();if(!same(c))return;
   const selected=openRecipientReview(source),checked=compareRecipientReview(recipientView(current()),selected);if(!same(c))return;
   returned=selected;comparison=checked;choices={};receiving={};dirty=true;message='Review every returned context, then download the explicit receiving request. This browser does not change the author database.';
  }catch(e){if(same(c))error=e.message;}
  finally{if(same(c)){busy=false;host.render();}}
 }
 function picker(label,accept,fn){
  const p=node('input',null,{type:'file',accept,'aria-label':label});p.disabled=busy;p.addEventListener('change',e=>fn(e.target.files[0]));
  const l=node('label',null);l.append(node('span',label),p);return l;
 }
 function render(){
  const b=current();if(!b)return section('Named recipient review',node('p','Open the complete original catalogue first.'));
  const s=section('Named recipient review',node('p','Propose customer matches against this exact catalogue. Original materials, author decisions and supplier history remain unchanged. The author reviews the return before any decision is adopted.'));
  if(error)s.append(node('p',error,{role:'alert',class:'error'}));
  if(message)s.append(node('p',message,{role:'status'}));
  if(busy)s.append(node('p','Reading the complete saved file…',{role:'status'}));
  s.append(toolbar(picker('Restore complete working review','.json',restore),
   button('Save complete working review',()=>{host.download('Material_Review_Working.json',workingText(),'application/json;charset=utf-8');markSaved();host.render();}),
   button('Save complete working HTML',()=>{host.downloadReader();markSaved();host.render();},document.documentElement.dataset.standalone!=='true')));
  if(!review){
   s.append(field('Named reviewer','reviewer',draft,{max:160}),button('Start named review',()=>{
    acknowledge();review=createRecipientReview(b,{id:crypto.randomUUID(),reviewer:draft.reviewer,at:new Date().toISOString()});dirty=true;host.render();
   },!b.catalog.activeEditionId));
  }else{
   s.append(node('h3',review.reviewer+' · '+review.entries.length+' proposed contexts'),node('p','Review '+review.id+' · '+review.history.length+' complete saved revisions',{class:'mono'}));
   const allMaterials=[...(b.materials.get(review.base.edition.id)??new Map()).values()],term=(draft.materialSearch??'').toLocaleLowerCase('en-US');
   const matching=allMaterials.filter(x=>!term||(x.materialId+' '+x.title).toLocaleLowerCase('en-US').includes(term));let materials=matching.slice(0,100);
   const chosen=allMaterials.find(x=>x.key===draft.materialKey);if(chosen&&!materials.some(x=>x.key===chosen.key))materials=[chosen,...materials];
   s.append(toolbar(field('Material ID or text','materialSearch',draft,{max:200}),button('Find materials',()=>host.render())),node('p','Showing '+Math.min(100,matching.length)+' of '+matching.length+' matching materials. Refine the search to choose another retained record.'));
   s.append(field('Customer identifier','customerId',draft,{max:256}),field('Original customer description','description',draft,{kind:'textarea',max:2000}),
    field('Proposed material','materialKey',draft,{kind:'select',options:[['','Choose the exact original material'],...materials.map(x=>[x.key,x.materialId+' · '+x.title])]}),
    field('Proposed decision','status',draft,{kind:'select',options:[['','Choose explicitly'],['APPROVED','Approve this match'],['REJECTED','Reject this match']]}),
    field('Review reason','note',draft,{kind:'textarea',max:3000}),
    toolbar(button('Save proposed decision',()=>{acknowledge();review=saveRecipientProposal(review,b,draft,{at:new Date().toISOString()});dirty=true;message='Proposal saved locally with its complete earlier revisions.';host.render();}),
     button('Download complete review return',()=>{host.download('Material_Review_'+review.id+'.json',exportRecipientReview(review),'application/json;charset=utf-8');savedReview=review;host.render();},!review.entries.length)));
   for(const p of review.entries){
    const item=node('article',null,{class:'source'});item.append(node('h3',p.customerId+' · '+p.description),
     node('p',p.status+' · '+p.material.materialId+' · revision '+p.revision),node('p',p.note),
     button('Edit proposal',()=>{draft={...draft,customerId:p.customerId,description:p.description,materialKey:p.material.key,status:p.status,note:p.note};host.render();}),
     button('Download full proposal history',()=>jsonDownload('Proposal_'+p.id+'.json',review.history.filter(x=>x.proposal.id===p.id))));s.append(item);
   }
  }
  const a=section('Author: compare a returned review',node('p','First open the author’s current complete bundle, then choose the colleague’s complete return. Any newer decision is shown explicitly; changed materials cannot be adopted from an older review.'));
  a.append(picker('Open named recipient return','.json',readReturn));
  if(comparison){
   a.append(node('p',comparison.reviewer+' · comparison '+comparison.sha256,{class:'mono'}));
   for(const r of comparison.rows){
    const item=node('article',null,{class:'source','data-recipient-context':r.id});
    item.append(node('h3',r.proposal.customerId+' · '+r.proposal.description),node('p',r.reason),
     node('h4','Current author decision'),node('p',r.current?r.current.status+' · '+r.current.materialId+' · revision '+r.current.revision:'No current author decision'),node('p',r.current?.note??''),
     node('h4','Returned proposal'),node('p',r.proposal.status+' · '+r.proposal.material.materialId),node('p',r.proposal.note));
    const vals={choice:choices[r.id]??''};
    const control=field('Choice for '+r.proposal.customerId+' / '+r.proposal.description,'choice',vals,{kind:'select',options:[['','Choose explicitly'],['keep','Keep current'],...(r.eligible&&!r.unchanged?[['adopt','Adopt returned proposal']]:[])]});
    control.querySelector('select').addEventListener('change',e=>{choices[r.id]=e.target.value;});item.append(control);a.append(item);
   }
   a.append(field('Receiving operator','actor',receiving,{max:160}),field('Reason for these receiving choices','reason',receiving,{kind:'textarea',max:3000}),
    button('Download reviewed receiving request',()=>{
     acknowledge();const fresh=compareRecipientReview(recipientView(b),returned);if(fresh.sha256!==comparison.sha256)throw Error('The selected author state changed. Open and compare the return again.');
     const signature=JSON.stringify({comparison:comparison.sha256,actor:receiving.actor,reason:receiving.reason,choices:comparison.rows.map(r=>({id:r.id,choice:choices[r.id]}))});
     if(receiving.requestSignature!==signature){receiving.requestId=crypto.randomUUID();receiving.requestSignature=signature;}
     const request=selectRecipientAdoption(returned,comparison,{requestId:receiving.requestId,actor:receiving.actor,reason:receiving.reason,choices:comparison.rows.map(r=>({id:r.id,choice:choices[r.id]}))});
     jsonDownload('Material_Review_Receive_'+request.requestId+'.json',request);
     message='Run this unchanged request with catalog-receive-review in the original author workspace. Exact replay reuses its original Journal result.';host.render();
    }));
  }
  s.append(a);return s;
 }
 return {render,reset,invalidate,setBusy,hasUnsaved,snapshot,workingText,markSaved,restore,readReturn};
}
