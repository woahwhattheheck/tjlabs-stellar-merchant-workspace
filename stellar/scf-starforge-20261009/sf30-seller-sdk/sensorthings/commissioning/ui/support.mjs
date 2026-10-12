// MIT. Commissioning view helpers over the existing authenticated Desk client.
import {h,button,detail,note,field,form,table,row,busy,number,json,optional} from '/desk/ui.mjs';
import {sha256,ApiError} from '/desk/api.mjs';
export {h,button,detail,note,field,form,table,row,busy,number,json,optional};
export const entityKinds=['Things','Locations','HistoricalLocations','Datastreams','MultiDatastreams','Sensors','ObservedProperties','Observations','FeaturesOfInterest'];
export const sections=[['sources','Sources'],['mapping','Mapping and target'],['plans','Plan review'],['jobs','Native operation'],['receiving','Receiving and history']];
export const recordId=r=>typeof r==='string'?r:r?.id??r?.project?.id??null;
export const list=value=>Array.isArray(value)?value:[];
export const label=r=>r?.label??r?.profile?.label??r?.project?.label??r?.name??recordId(r)??'Record';
export const enc=encodeURIComponent;
export function choices(items,{empty='Select a record'}={}) {return[{value:'',label:empty},...list(items).map(r=>({value:recordId(r),label:label(r)}))];}
export function select(labelText,name,items,value='',options={}) {return field(labelText,name,{type:'select',options:choices(items),value,...options});}
export function panel(title,...children) {return h('section',{class:'panel'},h('h2',{},title),...children);}
export function exact(title,value,{open=false}={}) {return detail(title,value,open);}
export function textBody(title,body) {return h('details',{},h('summary',{},title),h('pre',{},typeof body==='string'?body:JSON.stringify(body,null,2)));}
export function badge(value) {return h('span',{class:'comm-status'},String(value??'—'));}
export function stats(items) {return h('div',{class:'metrics'},...items.map(([name,value])=>h('div',{class:'metric'},h('strong',{},String(value??0)),h('span',{},name))));}
export function actionButtons(ctx,...items){return row(...items.map(([title,fn,props={}])=>button(title,busy(fn,ctx.error),props)));}
export function pager(page,onPage) {
  const offset=page.offset??0,rows=list(page.rows??page.steps),total=page.total??rows.length,next=page.nextOffset??null;
  return h('div',{class:'pagination'},h('span',{},total?String(offset+1)+'–'+Math.min(total,offset+rows.length)+' of '+total:'0 records'),button('Previous',()=>onPage(Math.max(0,offset-100)),{disabled:offset===0}),button('Next',()=>onPage(next),{disabled:next===null}));
}
export function scopedForm(ctx,key,title,controls,submit,options={}) {
  const scope=ctx.state.projectId??'workspace',draftKey=scope+'|'+key;
  const readDraft=element=>{const data={};for(const e of element.elements){if(!e.name||['file','password','submit','button'].includes(e.type))continue;data[e.name]=e.type==='checkbox'?e.checked:e.type==='select-multiple'?[...e.selectedOptions].map(x=>x.value):e.value;}return data;};
  const node=form(title,controls,async(values,element)=>{
    const submitted=JSON.stringify(readDraft(element)),result=await submit(values,element),currentDraft=ctx.state.drafts[draftKey];
    if(options.clearOnSuccess&&JSON.stringify(readDraft(element))===submitted&&(currentDraft===undefined||JSON.stringify(currentDraft)===submitted)){
      delete ctx.state.drafts[draftKey];ctx.save();ctx.render();
    }
    return result;
  },options);
  const element=node.matches('form')?node:node.querySelector('form');
  if(!element)return node;
  const saved=ctx.state.drafts[draftKey];
  if(saved)for(const e of element.elements){if(!e.name||['file','password','submit','button'].includes(e.type)||!(e.name in saved))continue;if(e.type==='checkbox')e.checked=Boolean(saved[e.name]);else if(e.type==='select-multiple'){for(const o of e.options)o.selected=list(saved[e.name]).includes(o.value);}else e.value=saved[e.name];}
  const retain=()=>{ctx.state.drafts[draftKey]=readDraft(element);ctx.save();};
  element.addEventListener('input',retain);element.addEventListener('change',retain);
  return node;
}
export function sourceDescription(source) {return exact('Source identity and provenance',source);}
export function fileReferences(value) {
  const found=new Map(),seen=new Set();
  function walk(x,depth,name='Retained file'){if(!x||typeof x!=='object'||depth>12||seen.has(x))return;seen.add(x);
    if(typeof x.sha256==='string'&&/^[a-f0-9]{64}$/.test(x.sha256)&&Number.isSafeInteger(x.bytes)&&x.bytes>=0){
      const id=typeof x.fileId==='string'?x.fileId:x.sha256;
      const item={...x,id,name:x.name??x.filename??x.path??name};
      if(!found.has(id)||x.name||x.filename)found.set(id,item);
    }
    if(Array.isArray(x)){for(const item of x)walk(item,depth+1,name);}else for(const[k,item]of Object.entries(x)){if(k!=='bodyText'&&k!=='sourceJson'&&k!=='configuration')walk(item,depth+1,k);}
  }walk(value,0);return[...found.values()];
}

export function files(ctx,value) {
  const items=fileReferences(value);if(!items.length)return note('Open the selected record to inspect its retained file references.');
  return table([{label:'File',render:r=>r.name},{label:'Bytes',key:'bytes'},{label:'SHA-256',render:r=>h('code',{},r.sha256)},{label:'Open',render:r=>actionButtons(ctx,['Download',()=>ctx.download(r.id)],...((r.bytes<=1024*1024)?[['Preview text',()=>ctx.preview(r.id)]]:[]))}],items);
}
export async function fileMetadata(client,id) {return client.request('/api/commissioning/files/'+enc(id)+'?metadata=1');}
export async function downloadCommissioningFile(client,id,{preview=false}={}) {
  const file=await fileMetadata(client,id),url='/api/commissioning/files/'+enc(id)+'?expectedSha256='+enc(file.sha256);
  if(file.id!==id||!Number.isSafeInteger(file.bytes)||file.bytes<0||!/^[a-f0-9]{64}$/.test(file.sha256))throw new ApiError('The selected file metadata is incomplete.',{code:'FILE_IDENTITY'});
  if(preview&&file.bytes>1024*1024)throw new ApiError('Download the complete file to inspect this larger source.',{code:'FILE_PREVIEW_SIZE'});
  let destination=null;
  if(!preview&&file.bytes>128*1024*1024){
    if(!window.showSaveFilePicker)throw new ApiError('Use the installed retained-file receiver for this file above128MiB.',{code:'FILE_MEMORY'});
    destination=await window.showSaveFilePicker({suggestedName:file.name});
  }
  const response=await client.request(url,{raw:true});
  if(response.headers.get('X-Content-SHA256')!==file.sha256||Number(response.headers.get('Content-Length'))!==file.bytes){await response.body?.cancel();throw new ApiError('The selected download response identity changed.',{code:'FILE_CHANGED'});}
  if(destination){
    const writer=await destination.createWritable();let count=0;
    try{const reader=response.body.getReader();for(;;){const{done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>file.bytes)throw new ApiError('The response exceeds its retained length.',{code:'FILE_LENGTH'});await writer.write(value);}if(count!==file.bytes)throw new ApiError('The response ended before its retained length.',{code:'FILE_LENGTH'});await writer.close();}
    catch(error){await writer.abort().catch(()=>{});throw error;}return{...file,saved:true,verification:'Original server held descriptor and SHA; complete streamed byte count.'};
  }
  const bytes=await response.arrayBuffer();if(bytes.byteLength!==file.bytes||await sha256(bytes)!==file.sha256)throw new ApiError('The complete selected file differs from its retained byte/hash identity.',{code:'FILE_CHANGED'});
  if(preview)return{...file,text:new TextDecoder('utf-8',{fatal:true}).decode(bytes)};
  const objectUrl=URL.createObjectURL(new Blob([bytes],{type:file.type??'application/octet-stream'})),a=h('a',{href:objectUrl,download:file.name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);return{...file,saved:true,verification:'Complete browser SHA-256 and byte count.'};
}
export function parseObject(value,name){const r=exactInputJSON(value,name);if(!r||Array.isArray(r)||typeof r!=='object')throw new Error(name+' must be a JSON object.');return r;}
export function parseArray(value,name){const r=exactInputJSON(value,name);if(!Array.isArray(r))throw new Error(name+' must be a JSON array.');return r;}
export function parseLines(value){return String(value??'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);}
export function optionalText(value){return typeof value==='string'&&value.trim()?value:undefined;}
export function requireProject(ctx){if(!ctx.state.projectId)throw new Error('Select a commissioning project.');return ctx.state.projectId;}

// Authored configuration uses the original JSON action envelope. Reject any
// numeric literal that this browser would change before retaining that action.
export function exactInputJSON(text,name='JSON') {
  const input=String(text),numberToken=/-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  function decimal(s){let sign='';if(s[0]==='-'){sign='-';s=s.slice(1);}let[m,e='0']=s.toLowerCase().split('e');const fraction=(m.split('.')[1]??'').length;let digits=m.replace('.','').replace(/^0+/,'');if(!digits)return'0';let power=Number(e)-fraction;if(!Number.isSafeInteger(power)||Math.abs(power)>10000)throw new Error(name+' contains a numeric exponent outside this editor.');while(digits.endsWith('0')){digits=digits.slice(0,-1);power++;}return sign+digits+'e'+power;}
  for(let i=0;i<input.length;){if(input[i]==='"'){i++;while(i<input.length){if(input[i]==='\\'){i+=2;continue;}if(input[i++]==='"')break;}continue;}
    if(input[i]==='-'||/[0-9]/.test(input[i])){numberToken.lastIndex=i;const m=numberToken.exec(input);if(m){const n=Number(m[0]);if(!Number.isFinite(n)||Number.isInteger(n)&&!Number.isSafeInteger(n)||decimal(m[0])!==decimal(JSON.stringify(n)))throw new Error(name+' contains a numeric literal that the browser would change. Keep native identifiers as exact targetIdJson strings and import precise source results from their original file.');i=numberToken.lastIndex;continue;}}i++;}
  try{return JSON.parse(input);}catch{throw new Error('Use complete valid '+name+'.');}
}

export function parseNullableObject(value,name){const r=exactInputJSON(value,name);if(r!==null&&(!r||Array.isArray(r)||typeof r!=='object'))throw new Error(name+' must be a JSON object or null.');return r;}
