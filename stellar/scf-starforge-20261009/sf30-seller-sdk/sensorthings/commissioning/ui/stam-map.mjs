// MIT. Original pinned STAM map, with retained typed-ID/source inspection.
// Session credentials remain in this closure and never enter URL/configuration exports.
export const STAM_SOURCE='0e414f3441a8773619f242c797fe75e9af3fc04d';
const SCHEMA='stellar-forge.sensorthings-commissioning-map.v1';
let activeMap=null;
const assetLoads=new Map();
function need(ok,message){if(!ok)throw new Error(message);}
function element(tag,text='',className=''){
 const e=document.createElement(tag);if(text!==null&&text!==undefined)e.textContent=String(text);if(className)e.className=className;return e;
}
function datum(value){
 if(value===undefined||value===null)return'Not retained';
 if(typeof value!=='object')return String(value);
 if(value.state==='missing')return'Missing';
 if(value.state==='null')return'Explicit null';
 return String(value.text??value.value??JSON.stringify(value));
}
function button(label,action,onError,disabled=false){
 const e=element('button',label);e.type='button';e.disabled=disabled;e.addEventListener('click',async()=>{
  if(e.disabled)return;e.disabled=true;
  try{await action();}catch(error){onError(error);}finally{if(e.isConnected)e.disabled=disabled;}
 });return e;
}
function sameOriginAsset(value,label){
 need(typeof value==='string'&&value.length>0,'The complete original '+label+' asset is not configured.');
 const u=new URL(value,location.origin);need(u.origin===location.origin&&!u.username&&!u.password&&!u.search&&!u.hash&&
  !u.pathname.startsWith('/api/'),'Serve the original '+label+' from this application’s static asset manifest.');return u;
}
async function loadAssets(assets){
 need(assets&&typeof assets==='object','The pinned STAM and Leaflet asset closure is not yet configured.');
 const leaflet=sameOriginAsset(assets.leafletScript,'Leaflet'),style=sameOriginAsset(assets.leafletStyle,'Leaflet style'),stam=sameOriginAsset(assets.stamModule,'STAM');
 if(assets.stamSource!==undefined)need(assets.stamSource===STAM_SOURCE,'Use the selected original STAM source commit.');
 const key=[leaflet.href,style.href,stam.href].join('|');
 if(!assetLoads.has(key))assetLoads.set(key,(async()=>{
  if(![...document.querySelectorAll('link[rel="stylesheet"]')].some(e=>e.href===style.href)){
   await new Promise((resolve,reject)=>{const link=document.createElement('link');link.rel='stylesheet';link.href=style.href;
    link.onload=resolve;link.onerror=()=>{link.remove();reject(Error('The original Leaflet style could not be loaded.'));};document.head.append(link);});
  }
  if(!globalThis.L)await new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src=leaflet.href;script.async=true;
   if(assets.leafletIntegrity){script.integrity=assets.leafletIntegrity;script.crossOrigin='anonymous';}
   script.onload=resolve;script.onerror=()=>reject(Error('The original Leaflet script could not be loaded.'));document.head.append(script);
  });
  need(globalThis.L&&typeof globalThis.L.map==='function','The retained Leaflet asset did not expose its original L global.');
  if(assets.leafletVersion)need(globalThis.L.version===assets.leafletVersion,'The loaded Leaflet version differs from the selected asset closure.');
  const module=await import(stam.href);need(typeof module.STAM==='function','The retained STAM module must export its original STAM function.');
  return{L:globalThis.L,STAM:module.STAM};
 })().catch(error=>{assetLoads.delete(key);throw error;}));
 return assetLoads.get(key);
}
function identityOf(value){
 return{jobId:value.jobId,planId:value.planId,verificationId:value.verificationId,snapshotSha256:value.snapshotSha256,
  kind:value.kind,idJson:value.idJson,viewId:value.viewId,stepIds:value.stepIds??[],responseFiles:value.responseFiles??[],sourceIdentity:value.sourceIdentity};
}
function selectionQuery(snapshot,values={}){
 return new URLSearchParams({snapshot,...Object.fromEntries(Object.entries(values).filter(([,v])=>v!==undefined&&v!==null).map(([k,v])=>[k,String(v)]))});
}

/**
 * Mount inside the original commissioning view, after createDeskClient.open().
 * assets={leafletScript,leafletStyle,stamModule,stamSource?,leafletVersion?,leafletIntegrity?,licence?}.
 * onInspect receives native kind/idJson and retained response identities; viewId is never a write ID.
 */
export async function mountCommissioningMap({container,client,sessionToken,jobId,assets,onInspect=()=>{},onError=()=>{}}={}){
 need(container instanceof HTMLElement,'Select the existing map view container.');
 need(client&&typeof client.request==='function'&&client.info?.workspaceId,'Open the original SensorThings Desk before mounting its map.');
 need(typeof sessionToken==='string'&&/^[A-Za-z0-9_-]{32,200}$/.test(sessionToken),'Use this Desk’s existing private session.');
 need(typeof jobId==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(jobId),'Select one original native job.');
 const workspaceId=client.info.workspaceId,base='/api/commissioning/map/'+encodeURIComponent(jobId);
 let closed=false,generation=0,mapGeneration=0,manifestValue=null,map=null,layer=null,mapAbort=null,resizeObserver=null,entityKind=null;
 const root=element('section','','commissioning-map'),notice=element('div','','commissioning-map-notice');
 container.replaceChildren(root);root.append(notice);
 function error(error){
  if(closed)return;notice.replaceChildren(element('p',(error.code?error.code+': ':'')+error.message,'error'));
  onError(error);
 }
 function current(token){return!closed&&token===generation&&root.isConnected;}
 function stopMap(){
  mapGeneration++;
  mapAbort?.abort();mapAbort=null;resizeObserver?.disconnect();resizeObserver=null;
  if(layer&&map){map.removeLayer(layer);layer=null;}if(map){map.remove();map=null;}
  if(activeMap?.owner===root)activeMap=null;
 }
 async function inspect(value){need(value.snapshotSha256===manifestValue.snapshotSha256,'Reopen the currently selected target-read snapshot.');await onInspect(identityOf(value));}
 function checked(value){
  need(value?.schema===SCHEMA&&value.jobId===jobId&&value.snapshotSha256===manifestValue.snapshotSha256,'The returned map rows belong to another native snapshot.');
  return value;
 }
 function popup(feature){
  const native=feature?.properties?.['commissioning@source'];
  const host=element('section','','commissioning-map-popup');
  host.append(element('h3',feature?.properties?.name??'Retained target feature'));
  if(!native||native.snapshotSha256!==manifestValue?.snapshotSha256){
   host.append(element('p','The feature no longer belongs to the selected native snapshot. Reload the map.'));return host;
  }
  host.append(element('p',native.kind+' · native ID '+native.idJson),element('p','View '+native.viewId+' is a map display identity only.','muted'));
  host.append(button('Inspect original native result',()=>inspect(native),error));
  const rows=element('div');host.append(rows);const token=generation;let popupRead=0;
  async function load(offset=0){
   const read=++popupRead;
   rows.replaceChildren(element('p','Reading retained observations…'));
   try{
    const response=await client.request(base+'/entities/'+native.viewId+'?'+selectionQuery(native.snapshotSha256,{offset,limit:10}));
    if(!current(token)||!host.isConnected||read!==popupRead)return;const value=checked(response);
    rows.replaceChildren(element('p',value.observations.total+' retained observations. Results and original units are shown without conversion.'));
    if(!value.observations.rows.length){rows.append(element('p','No observation read is retained for this feature. This does not establish target availability or a zero result.'));return;}
    const table=element('table'),head=element('thead'),tr=element('tr');
    for(const label of ['Original time','Result','Type','Unit','Native result'])tr.append(element('th',label));head.append(tr);table.append(head);
    const body=element('tbody');
    for(const row of value.observations.rows){
     const line=element('tr');
     line.append(element('td',datum(row.phenomenonTime)),element('td',datum(row.result)),element('td',row.result.type),
      element('td',row.streams.length?row.streams.map(s=>datum(s.unit)).join(' | '):'No retained stream unit'));
     const action=element('td');action.append(button('Inspect',()=>inspect(row),error));line.append(action);body.append(line);
    }
    table.append(body);const scroll=element('div','','table-scroll');scroll.append(table);rows.append(scroll);
    const page=value.observations,pager=element('div','','commissioning-map-pager');
    pager.append(button('Previous observations',()=>load(Math.max(0,page.offset-page.limit)),error,page.offset===0),
     element('span',(page.offset+1)+'–'+(page.offset+page.rows.length)+' of '+page.total),
     button('Next observations',()=>load(page.nextOffset),error,page.nextOffset===null));rows.append(pager);
   }catch(e){if(current(token)&&host.isConnected&&read===popupRead)rows.replaceChildren(element('p',(e.code?e.code+': ':'')+e.message,'error'));}
  }
  // STAM opens the returned HTMLElement after this callback. The microtask starts
  // reading only the original local sidecar; provider names never enter innerHTML.
  queueMicrotask(()=>load());return host;
 }
 async function drawMap(host,status,token){
  stopMap();const drawing=mapGeneration;host.replaceChildren();
  if(!manifestValue.bounds){status.textContent='No unambiguous retained geometry is currently available. Review the native entities and missing-read report below.';return;}
  const eligible=entityKind==='Things'?manifestValue.counts.mappedThings:manifestValue.counts.mappedFeaturesOfInterest;
  if(!eligible){status.textContent='This retained entity family has no supported map geometry. Select another family or inspect its original source.';return;}
  status.textContent='Loading original STAM and Leaflet assets…';
  let vendor;try{vendor=await loadAssets(assets);}catch(e){if(current(token)&&drawing===mapGeneration)status.textContent=e.message;return;}
  if(!current(token)||drawing!==mapGeneration)return;
  // The pinned Leaflet adapter uses module-level layer references. Keep one actual
  // STAM map active, and close its original layers/listeners before switching jobs.
  if(activeMap&&activeMap.owner!==root)activeMap.close();
  const L=vendor.L;mapAbort=new AbortController();
  const view=element('div','','commissioning-map-view');view.setAttribute('aria-label','Retained native SensorThings map');view.setAttribute('role','region');host.append(view);
  map=L.map(view,{worldCopyJump:false,minZoom:1,maxZoom:20,maxBounds:[[-85.0511287798066,-180],[85.0511287798066,180]],maxBoundsViscosity:1,attributionControl:true});
  map.fitBounds(manifestValue.bounds,{padding:[24,24],maxZoom:17});
  const service=new URL(manifestValue.links.service,location.origin);
  need(service.origin===location.origin&&service.pathname===base+'/v1.1'&&!service.search&&!service.hash,'Keep STAM on the original authenticated local map facade.');
  layer=vendor.STAM({baseUrl:service.href,queryObject:{entityType:entityKind},
   queryParameters:new Map([['snapshot',manifestValue.snapshotSha256]]),pageSize:500,maxEntities:50000,maxMarkersPerTile:50000,
   maxConcurrentRequests:4,requestDelay:100,debounceDuration:200,mqtt:false,cluster:true,clusterMin:5,
   markerStyle:'#444444',polygonStyle:{color:'#444444',weight:2,opacity:0.9,fillColor:'#a3a3a3',fillOpacity:0.18},
   markerClick:popup,
   fetchOptions:{headers:{Authorization:'Bearer '+sessionToken,'X-SensorThings-Workspace':workspaceId},credentials:'same-origin',
    redirect:'error',cache:'no-store',signal:mapAbort.signal}});
  layer.addTo(map);activeMap={owner:root,close:stopMap};
  if(globalThis.ResizeObserver){resizeObserver=new ResizeObserver(()=>map?.invalidateSize({pan:false}));resizeObserver.observe(view);}
  map.attributionControl?.setPrefix(false);map.attributionControl?.addAttribution('Retained target reads · STAM');
  status.textContent=eligible+' retained '+entityKind+' features are available in this snapshot. Tile clusters count retained features, not observations or target uptime. No external basemap or target requests are sent.';
 }
 function nativeDetails(value){
  const details=element('details'),summary=element('summary','Retained map identity and coverage');
  details.append(summary,element('pre',JSON.stringify({jobId:value.jobId,planId:value.planId,verificationId:value.verificationId,
   snapshotSha256:value.snapshotSha256,sourceIdentity:value.sourceIdentity,coverage:value.coverage,idProjection:value.idProjection,
   families:value.families},null,2)));
  return details;
 }
 async function populate(token){
  notice.replaceChildren(element('p','Reading the original native target map…'));
  const value=await client.request(base+'/manifest');if(!current(token))return;
  need(value?.schema===SCHEMA&&value.jobId===jobId&&value.stamSource===STAM_SOURCE&&/^[a-f0-9]{64}$/.test(value.snapshotSha256??''),
   'The map manifest differs from the selected original native job and STAM source.');
  manifestValue=value;
  entityKind=entityKind??(value.counts.mappedThings?'Things':'FeaturesOfInterest');
  root.replaceChildren(notice);notice.replaceChildren();
  root.append(element('h2','Retained target map'),element('p','Inspect actual native target reads, their exact typed identifiers and complete source history.'));
  const controls=element('div','','commissioning-map-controls'),label=element('label','Map entity family'),select=element('select');
  select.setAttribute('aria-label','Map entity family');
  for(const kind of ['Things','FeaturesOfInterest']){const option=element('option',kind);option.value=kind;option.selected=kind===entityKind;select.append(option);}
  label.append(select);controls.append(label,button('Reload current target-read map',refresh,error));root.append(controls,nativeDetails(value));
  const status=element('p','','commissioning-map-status'),mapHost=element('div','','commissioning-map-host');
  root.append(status,mapHost);
  select.addEventListener('change',()=>{entityKind=select.value;drawMap(mapHost,status,token).catch(error);});
  const sourceSection=element('section'),sourceTitle=element('h3','Complete retained target entities'),entityControls=element('div','','commissioning-map-controls'),
   kindLabel=element('label','Entity kind'),kindSelect=element('select'),entities=element('div');
  kindSelect.setAttribute('aria-label','Retained entity kind');const all=element('option','All native entity kinds');all.value='';kindSelect.append(all);
  for(const item of value.families){const o=element('option',item.kind+' ('+item.total+')');o.value=item.kind;kindSelect.append(o);}
  kindLabel.append(kindSelect);entityControls.append(kindLabel);sourceSection.append(sourceTitle,entityControls,entities);root.append(sourceSection);
  let entityRead=0;
  async function loadEntities(offset=0){
   const read=++entityRead;
   entities.replaceChildren(element('p','Reading original native identities…'));
   const response=await client.request(base+'/entities?'+selectionQuery(value.snapshotSha256,{offset,limit:25,kind:kindSelect.value||undefined}));
   if(!current(token)||read!==entityRead)return;const page=checked(response);entities.replaceChildren();
   const table=element('table'),head=element('thead'),line=element('tr');
   for(const title of ['Kind','Exact native ID','Name','Map state','Original result'])line.append(element('th',title));head.append(line);table.append(head);
   const tbody=element('tbody');for(const row of page.rows){
    const tr=element('tr');tr.append(element('td',row.kind),element('td',row.idJson),element('td',datum(row.name)),
     element('td',row.mapEligible?'Available':row.geometryState));
    const cell=element('td');cell.append(button('Inspect native result',()=>inspect(row),error));tr.append(cell);tbody.append(tr);
   }
   table.append(tbody);const scroll=element('div','','table-scroll');scroll.append(table);entities.append(scroll);
   const pager=element('div','','commissioning-map-pager');pager.append(
    button('Previous entities',()=>loadEntities(Math.max(0,page.offset-page.limit)),error,page.offset===0),
    element('span',page.total?(page.offset+1)+'–'+(page.offset+page.rows.length)+' of '+page.total:'0 entities'),
    button('Next entities',()=>loadEntities(page.nextOffset),error,page.nextOffset===null));entities.append(pager);
  }
  kindSelect.addEventListener('change',()=>loadEntities().catch(error));
  const issueSection=element('section'),issueTitle=element('h3','Missing reads and map limitations'),issues=element('div');
  issueSection.append(issueTitle,issues);root.append(issueSection);
  let issueRead=0;
  async function loadIssues(offset=0){
   const read=++issueRead,response=await client.request(base+'/issues?'+selectionQuery(value.snapshotSha256,{offset,limit:25}));
   if(!current(token)||read!==issueRead)return;const page=checked(response);issues.replaceChildren();
   if(!page.total){issues.append(element('p','No additional map issue is recorded for these retained reads. The original native verification scope still applies.'));return;}
   for(const item of page.rows){const detail=element('details');detail.append(element('summary',item.code+(item.kind?' · '+item.kind+' '+item.idJson:'')),element('pre',JSON.stringify(item,null,2)));issues.append(detail);}
   const pager=element('div','','commissioning-map-pager');pager.append(
    button('Previous issues',()=>loadIssues(Math.max(0,page.offset-page.limit)),error,page.offset===0),
    element('span',(page.offset+1)+'–'+(page.offset+page.rows.length)+' of '+page.total),
    button('Next issues',()=>loadIssues(page.nextOffset),error,page.nextOffset===null));issues.append(pager);
  }
  await Promise.all([loadEntities(),loadIssues(),drawMap(mapHost,status,token)]);
 }
 async function refresh(){if(closed)return;stopMap();const token=++generation;try{await populate(token);}catch(e){if(current(token))error(e);}}
 function close(){if(closed)return;closed=true;++generation;stopMap();root.remove();}
 await refresh();
 return{close,refresh,get manifest(){return manifestValue;}};
}
