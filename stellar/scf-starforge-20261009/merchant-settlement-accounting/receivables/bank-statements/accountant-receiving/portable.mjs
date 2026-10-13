// SPDX-License-Identifier: MIT
import {need,json,digest} from './core.mjs';
import {validateSource,receiveWorking,SOURCE_NAMES,MAX_WORKING_BYTES} from './working.mjs';
export const MAX_HTML_BYTES=530_000_000;
export function encodeBase64(value){let out='';for(let i=0;i<value.length;i+=24576)out+=btoa(String.fromCharCode(...value.subarray(i,i+24576)));return out;}
export function decodeBase64(text){need(typeof text==='string'&&text.length<=Math.ceil(MAX_WORKING_BYTES/3)*4&&text.length%4===0,'WORKING_BASE64','Choose the complete embedded working review.');const out=new Uint8Array(text.length/4*3-(text.endsWith('==')?2:text.endsWith('=')?1:0));let offset=0;for(let i=0;i<text.length;i+=32768){const part=text.slice(i,i+32768);need(/^[A-Za-z0-9+/]*={0,2}$/.test(part)&&(!part.includes('=')||i+part.length===text.length),'WORKING_BASE64','The complete embedded working bytes are invalid.');const decoded=atob(part);for(let j=0;j<decoded.length;j++)out[offset++]=decoded.charCodeAt(j);}need(offset===out.length&&encodeBase64(out)===text,'WORKING_BASE64','Keep canonical complete working bytes.');return out;}
function inert(value){return JSON.stringify(value).replaceAll('<','\\u003c').replaceAll('&','\\u0026').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');}
function scriptSafe(value){return value.replaceAll(/<\/script/gi,'<\\/script');}
function exportsOf(source){return [...source.matchAll(/^export (?:async )?(?:function|const) ([A-Za-z_][A-Za-z0-9_]*)/mg)].map(m=>m[1]);}
function moduleBody(source,map){return source.replace(/^import \{([^}]+)\} from '([^']+)';$/mg,(_,names,path)=>{need(map[path],'WORKING_SOURCE_IMPORT','The selected running source has an unsupported module import.');return 'const {'+names+'}='+map[path]+';';}).replace(/^export /mg,'');}
export async function standaloneWorking(source,raw=null){
 await validateSource(source);if(raw)await receiveWorking(raw);
 const f=Object.fromEntries(source.files.map(x=>[x.path,x.content])),maps={'./core.mjs':'Core','./storage.mjs':'Storage','./working.mjs':'Working','./portable.mjs':'Portable'};
 let script='';for(const [name,key] of [['core.mjs','Core'],['storage.mjs','Storage'],['working.mjs','Working'],['portable.mjs','Portable']])script+='const '+key+'=(()=>{'+moduleBody(f[name],maps)+'\nreturn {'+exportsOf(f[name]).join(',')+'};})();\n';
 script+='{'+moduleBody(f['app.mjs'],maps)+'\n}';
 const style='<link rel="stylesheet" href="./style.css">',app='<script type="module" src="./app.mjs"></script>';
 const values=new Map([[style,'<style>'+f['style.css'].replaceAll(/<\/style/gi,'<\\/style')+'</style>'],[app,'<script id="accountant-running-source" type="application/json">'+inert(source)+'</script><script id="accountant-embedded-working" type="application/json">'+inert(raw?{bytes:raw.length,sha256:await digest(raw),base64:encodeBase64(raw)}:null)+'</script><script type="module">'+scriptSafe(script)+'</script>']]);
 for(const key of values.keys())need(f['index.html'].split(key).length===2,'WORKING_TEMPLATE','Keep the exact single original HTML mount.');
 const pattern=new RegExp([...values.keys()].map(x=>x.replace(/[.*+?^\x24{}()|[\]\\]/g,'\\$&')).join('|'),'g');
 const html=f['index.html'].replace(pattern,key=>values.get(key));need(new TextEncoder().encode(html).length<=MAX_HTML_BYTES,'WORKING_HTML_SIZE','The complete HTML exceeds its supported limit. Download the full working TAR and use the installed reader.');return html;
}
