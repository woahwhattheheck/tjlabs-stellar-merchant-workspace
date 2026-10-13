// MIT. Render a complete, offline colleague working copy from local source templates.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const here=new URL('./',import.meta.url);
const safeJSON=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const hash=value=>createHash('sha256').update(value,'utf8').digest('base64');
function insert(source,marker,value){
 const at=source.indexOf(marker);
 if(at<0||source.indexOf(marker,at+marker.length)>=0)throw new Error('Colleague template marker is missing or repeated: '+marker);
 return source.slice(0,at)+value+source.slice(at+marker.length);
}
/**
 * The caller supplies the complete verified return/working envelope. Its
 * package and originals are checked again by the offline browser before edits.
 * No external assets, credentials, live source reads or publication are added.
 */
export async function renderColleagueReview(work){
 if(!work||work.schema!=='stellar-forge.odk-form-colleague-return.v1'||work.package?.schema!=='stellar-forge.odk-form-colleague-package.v1')
  throw new TypeError('Supply the complete colleague return/working envelope.');
 const [template,css,script]=await Promise.all(['colleague-offline.html','colleague-offline.css','colleague-offline.js'].map(name=>readFile(new URL(name,here),'utf8')));
 if(/<\/style/i.test(css)||/<\/script/i.test(script))throw new Error('Offline source contains an unsafe closing element.');
 const policy="default-src 'none'; script-src 'sha256-"+hash(script)+"'; style-src 'sha256-"+hash(css)+"'; img-src blob: data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'";
 let html=insert(template,'<!--COLLEAGUE_CSP-->','<meta http-equiv="Content-Security-Policy" content="'+policy+'">');
 html=insert(html,'/*COLLEAGUE_STYLE*/',css);
 html=insert(html,'__COLLEAGUE_WORK__',safeJSON(work));
 // The template newline following the program marker belongs to the script
 // node, so replace it together with the marker to preserve the CSP hash.
 html=insert(html,'//COLLEAGUE_SCRIPT\n',script);
 return html;
}
