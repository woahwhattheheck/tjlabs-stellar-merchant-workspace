// MIT. Original Desk session and operation custody, with complete commissioning navigation.
import {createDeskClient} from '/desk/api.mjs';
import {h,button,detail,note,field,form,busy,sections,choices,recordId,label,list,select,panel,stats,files,downloadCommissioningFile} from './support.mjs';
import {renderView} from './views.mjs';
import {mountCommissioningMap} from './stam-map.mjs';
const main=document.querySelector('#main'),notice=document.querySelector('#notice'),pendingHost=document.querySelector('#pending'),nav=document.querySelector('#navigation'),identity=document.querySelector('#identity'),session=document.querySelector('#session'),refreshButton=document.querySelector('#refresh'),deskButton=document.querySelector('#open-desk'),dialog=document.querySelector('#record-dialog'),dialogBody=document.querySelector('#record-body');
const endedStates=new Set(['complete','failed','cancelled']);
let current=null;
document.querySelector('#record-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
function errorNode(error){return note((error.code?error.code+': ':'')+error.message+(error.currentRevision!==undefined?' · current revision '+error.currentRevision:''),'error');}
function initialState(){return{tab:'sources',projectId:null,sourceId:null,targetId:null,mappingId:null,planId:null,jobId:null,reviewId:null,sourceOffset:0,planOffset:0,jobOffset:0,actor:'',drafts:{},inboxFile:null};}
function recoverState(key){try{const saved=JSON.parse(sessionStorage.getItem(key)??'null');if(!saved||typeof saved!=='object')return initialState();const result=initialState();for(const name of Object.keys(result)){if(name in saved)result[name]=saved[name];}if(!sections.some(([name])=>name===result.tab))result.tab='sources';if(!result.drafts||typeof result.drafts!=='object'||Array.isArray(result.drafts))result.drafts={};return result;}catch{return initialState();}}
function describeAction(action){return action.split('.').slice(1).join(' ');}
async function connect(token){
  session.replaceChildren();notice.replaceChildren(note('Opening the original commissioning workspace…'));
  try{
    const client=createDeskClient(token),opened=await client.open(),stateKey='sensorthings-commissioning|'+location.origin+'|'+opened.view.workspaceId;
    let generation=0,detailEpoch=0,closed=false,saveWarning=false,refreshing=null,pollTimer=null,pollBusy=false;
    const maps=new Set();
    const ctx={client,state:recoverState(stateKey),overview:null,project:null,schema:null,selectedMapping:null};
    current?.close();
    ctx.error=error=>notice.replaceChildren(errorNode(error));
    ctx.showNode=(title,node)=>{detailEpoch++;document.querySelector('#record-title').textContent=title;dialogBody.replaceChildren(node);if(!dialog.open)dialog.showModal();};
    ctx.show=(title,value)=>ctx.showNode(title,detail(title,value,true));
    ctx.run=async fn=>{try{return await fn();}catch(error){ctx.error(error);return null;}};
    ctx.save=()=>{try{sessionStorage.setItem(stateKey,JSON.stringify(ctx.state));}catch(error){if(!saveWarning){saveWarning=true;notice.replaceChildren(note('This browser could not retain the editing draft. The original saved-operation custody is unchanged. '+error.message,'error'));}}};
    ctx.api=async(path,query={})=>{const q=new URLSearchParams(Object.entries(query).filter(([,v])=>v!==null&&v!==undefined).map(([k,v])=>[k,String(v)]));return client.request('/api/commissioning/'+path+(q.size?'?'+q:''));};
    ctx.download=async id=>{const r=await downloadCommissioningFile(client,id);ctx.show('Downloaded complete file',r);return r;};
    ctx.preview=async id=>{const r=await downloadCommissioningFile(client,id,{preview:true});ctx.showNode(r.name,h('div',{},detail('Complete file identity',{id:r.id,bytes:r.bytes,sha256:r.sha256},true),h('pre',{class:'comm-wire'},r.text)));return r;};
    function stopPage(){generation++;if(pollTimer)clearTimeout(pollTimer);pollTimer=null;for(const map of maps)map.close();maps.clear();}
    ctx.render=()=>{
      if(closed||!ctx.overview)return;stopPage();
      for(const b of nav.querySelectorAll('button')){if(b.dataset.tab===ctx.state.tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
      const projectSelect=select('Commissioning project','projectId',list(ctx.overview.projects),ctx.state.projectId,{required:false});projectSelect.classList.add('comm-project');
      projectSelect.querySelector('select').addEventListener('change',event=>void ctx.run(()=>ctx.select('projectId',event.target.value||null)));
      const header=h('div',{class:'comm-header'},h('div',{},h('p',{class:'comm-subtitle'},'Original workspace '+opened.view.workspaceId),h('p',{class:'comm-provenance'},ctx.project?label(ctx.project):'Choose a complete retained project')),projectSelect);
      main.replaceChildren(header,renderView(ctx));
    };
    ctx.readInto=(host,load,title)=>{const selectedGeneration=generation;Promise.resolve().then(load).then(value=>{if(!closed&&generation===selectedGeneration&&host.isConnected)host.replaceChildren(h('h2',{},title),value);}).catch(error=>{if(!closed&&generation===selectedGeneration&&host.isConnected)host.replaceChildren(h('h2',{},title),errorNode(error),button('Retry original read',()=>ctx.render()));});};
    ctx.navigate=tab=>{ctx.state.tab=tab;ctx.save();ctx.render();};
    ctx.select=async(key,id,tab=ctx.state.tab)=>{
      if(key==='projectId'&&id!==ctx.state.projectId){for(const k of['sourceId','targetId','mappingId','planId','reviewId','jobId'])ctx.state[k]=null;ctx.selectedMapping=null;}
      ctx.state[key]=id;ctx.state.tab=tab;for(const k of['sourceOffset','planOffset','jobOffset'])ctx.state[k]=0;ctx.save();await ctx.refresh();
    };
    ctx.useMapping=async record=>{
      ctx.selectedMapping=record;ctx.state.mappingId=recordId(record);ctx.state.sourceId=record.sourceId;ctx.state.targetId=record.targetId;
      delete ctx.state.drafts[(ctx.state.projectId??'workspace')+'|mapping-editor'];ctx.save();ctx.render();
    };
    ctx.refresh=async()=>{
      if(refreshing)return refreshing;
      refreshing=(async()=>{await client.refresh();ctx.overview=await ctx.api('view');ctx.project=ctx.state.projectId?await ctx.api('projects/'+encodeURIComponent(ctx.state.projectId)):null;
        if(ctx.state.mappingId&&ctx.project){ctx.selectedMapping=list(ctx.project.mappings).find(r=>recordId(r)===ctx.state.mappingId)??ctx.selectedMapping;}
        ctx.render();return ctx.overview;
      })();try{return await refreshing;}finally{refreshing=null;}
    };
    ctx.act=async(action,payload,{selectResult=null,tab=null}={})=>{
      const allowed=opened.schema.actions??{};
      if(!Object.prototype.hasOwnProperty.call(allowed,action))throw new Error('The original host does not advertise '+action+'. Open its current commissioning source.');
      const result=await client.act(action,payload),output=result.result;
      if(selectResult&&output&&typeof output==='object'){
        const id=output[selectResult]??output.id;
        if(typeof id==='string'){if(selectResult==='projectId'&&ctx.state.projectId!==id){for(const key of['sourceId','targetId','mappingId','planId','reviewId','jobId'])ctx.state[key]=null;}ctx.state[selectResult]=id;}
      }
      if(tab)ctx.state.tab=tab;ctx.save();
      notice.replaceChildren(note('Saved '+describeAction(action)+' · '+result.operationId,'success'),button('Open original result',()=>ctx.show(action,result)));
      await ctx.refresh();return result;
    };
    ctx.watchJob=(jobId,host,original)=>{
      const selectedGeneration=generation;
      const paint=page=>{const status=page.state??page.status??'Retained';host.replaceChildren(...stats([['State',status],['Completed',page.progress?.completed??page.completedSteps??'See job'],['Total',page.progress?.total??page.total??'See job']]).childNodes);host.setAttribute('aria-label','Retained job progress');};
      const poll=async()=>{
        if(closed||selectedGeneration!==generation||!host.isConnected)return;
        if(document.hidden||pollBusy){pollTimer=setTimeout(poll,5000);return;}
        pollBusy=true;
        try{const page=await ctx.api('jobs/'+encodeURIComponent(jobId),{offset:0,limit:1});if(closed||selectedGeneration!==generation)return;paint(page);const state=String(page.state??page.status??'').toLowerCase();if(!endedStates.has(state))pollTimer=setTimeout(poll,5000);}
        catch(error){if(host.isConnected&&selectedGeneration===generation)host.setAttribute('aria-label','Progress read unavailable; refresh the saved job. '+error.message);pollTimer=setTimeout(poll,10000);}
        finally{pollBusy=false;}
      };
      if(!endedStates.has(String(original.state??original.status??'').toLowerCase()))pollTimer=setTimeout(poll,5000);
    };
    ctx.inspectMapSelection=async(selection,{offset=0}={})=>{
      const title='Native '+selection.kind+' · '+selection.idJson;
      ctx.showNode(title,h('div',{},detail('Exact selected native identity',selection,true),note('Reading its complete retained fields and observations…')));
      const epoch=detailEpoch,page=await ctx.api('map/'+encodeURIComponent(selection.jobId)+'/entities/'+encodeURIComponent(selection.viewId),{snapshot:selection.snapshotSha256,offset,limit:25});
      if(closed||epoch!==detailEpoch||!dialog.open)return;
      const observations=page.observations??{},refs=[...list(page.responseFiles),...list(selection.responseFiles)],ids=new Set(refs.map(r=>typeof r==='string'?r:r.responseFileId??r.fileId??r.id).filter(x=>typeof x==='string'));
      const fileControls=h('div',{class:'row'},...Array.from(ids,id=>button('Open original response '+id,busy(()=>ctx.preview(id),ctx.error))),...Array.from(ids,id=>button('Download '+id,busy(()=>ctx.download(id),ctx.error))));
      const paging=h('div',{class:'pagination'},h('span',{},'Observation offset '+(observations.offset??offset)+' · '+(observations.total??0)+' total'),button('Previous',busy(()=>ctx.inspectMapSelection(selection,{offset:Math.max(0,offset-25)}),ctx.error),{disabled:offset===0}),button('Next',busy(()=>ctx.inspectMapSelection(selection,{offset:observations.nextOffset}),ctx.error),{disabled:observations.nextOffset===null||observations.nextOffset===undefined}));
      ctx.showNode(title,h('div',{},detail('Original typed identity and map provenance',selection,true),detail('Complete native entity, relationships and observation page',page,true),files(ctx,page),fileControls,paging));
    };
    ctx.mountMap=(host,jobId)=>{
      const selectedGeneration=generation;
      Promise.resolve().then(async()=>{
        const manifest=await ctx.api('map/'+encodeURIComponent(jobId)+'/manifest');
        if(closed||generation!==selectedGeneration||!host.isConnected)return;
        const container=h('div',{class:'comm-map-container'}),toolbar=h('div',{class:'row'});
        host.replaceChildren(h('h2',{},'Retained target map and observation view'),h('p',{class:'comm-map-caption'},'Original DataCove STAM · plan '+(manifest.planId??'—')+' · verification '+(manifest.verificationId??'—')),container,toolbar);
        const assets=ctx.schema.map?.assets??ctx.schema.stam?.assets??ctx.schema.assets;
        const mounted=await mountCommissioningMap({container,client,sessionToken:token,jobId,assets,onInspect:selection=>void ctx.run(()=>ctx.inspectMapSelection(selection)),onError:ctx.error});
        if(closed||generation!==selectedGeneration){mounted.close();return;}maps.add(mounted);
        toolbar.append(button('Refresh retained map',busy(()=>mounted.refresh(),ctx.error)),button('Map provenance and coverage',()=>ctx.show('Original map manifest',mounted.manifest)),button('Current native result',busy(async()=>ctx.show('Complete retained job',await ctx.api('jobs/'+encodeURIComponent(jobId),{offset:0,limit:100})),ctx.error)));
      }).catch(error=>{if(!closed&&generation===selectedGeneration&&host.isConnected)host.replaceChildren(h('h2',{},'Retained target map and observation view'),errorNode(error));});
    };
    function renderPending(){
      const p=client.pending;if(!p){pendingHost.replaceChildren();return;}
      const resultHost=h('div'),operate=async fn=>{const result=await fn();resultHost.replaceChildren(detail('Original operation result',result,true));await ctx.refresh();return result;};
      pendingHost.replaceChildren(h('h2',{},'Saved request · '+p.body.action),note('Operation '+p.body.operationId+' · submitted revision '+p.body.expectedRevision+' · '+p.state+'. Reopen the original outcome before creating another mutation.'),p.lastError?errorNode(p.lastError):h('span',{hidden:true}),h('div',{class:'row'},
        button('Inspect original outcome',busy(()=>operate(()=>client.reconcile()),ctx.error)),
        button('Replay exact request',busy(()=>operate(()=>client.replay()),ctx.error)),
        button('Review latest revision and replay',busy(async()=>{if(!confirm('Rebind this still-unobserved original action and payload to the current workspace revision?'))return;return operate(()=>client.replay({reviewLatestRevision:true}));},ctx.error)),
        button('Keep ended request in history',busy(async()=>{await client.dismissFailed();await ctx.refresh();},ctx.error)),
        button('Review original payload',()=>ctx.show('Exact saved request',p))),resultHost);
    }
    const unsubscribe=client.subscribe(({view})=>{if(view)identity.textContent='Workspace '+view.workspaceId+' · revision '+view.revision;renderPending();});
    ctx.close=()=>{closed=true;stopPage();unsubscribe?.();};
    current=ctx;
    ctx.schema=await ctx.api('schema');
    nav.replaceChildren(...sections.map(([id,text])=>{const b=button(text,()=>ctx.navigate(id));b.dataset.tab=id;return b;}));
    const openDestination=path=>{const url=new URL(path,location.origin);url.hash=token;window.open(url.href,'_blank','noopener,noreferrer');};
    if(opened.schema.analysis)nav.append(button('Observation analysis',()=>openDestination('/analysis/')));
    deskButton.disabled=false;deskButton.onclick=()=>openDestination('/desk/');
    refreshButton.disabled=false;refreshButton.onclick=busy(async()=>{await ctx.refresh();notice.replaceChildren(note('Original commissioning workspace refreshed.','success'));},ctx.error);
    identity.textContent='Workspace '+opened.view.workspaceId+' · revision '+opened.view.revision;
    await ctx.refresh();renderPending();notice.replaceChildren();
  }catch(error){notice.replaceChildren(errorNode(error));login();}
}
function login(){session.replaceChildren(form('Open private commissioning',[field('Private session token','token',{type:'password',required:true,help:'Use the selected installed host’s original session token.'})],async x=>connect(x.token),{label:'Open commissioning'}));}
const token=location.hash.slice(1);
if(token){history.replaceState(null,'',location.pathname+location.search);void connect(token);}else login();
window.addEventListener('pagehide',()=>current?.close());
