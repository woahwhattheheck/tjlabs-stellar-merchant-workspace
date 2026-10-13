// SPDX-License-Identifier: MIT
// Establish the managed local session before loading the unchanged original application.
const storageKey='stellar-forge.transport-planning.private-console.'+location.origin;
const pattern=/^[A-Za-z0-9_-]{43}$/;
const fragment=location.hash.slice(1);
let token=null;
if(fragment){
  if(pattern.test(fragment))token=fragment;
  history.replaceState(null,'',location.pathname+location.search);
  if(token){try{sessionStorage.setItem(storageKey,token);}catch{}}

}
if(!token){try{token=sessionStorage.getItem(storageKey);}catch{}}
async function openOriginal(){
  if(pattern.test(token??'')){
    const response=await fetch('/_merchant/session',{method:'POST',credentials:'same-origin',redirect:'error',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:'{}'});
    if(!response.ok)throw new Error('Open the current private console URL from Applications.');
    const value=await response.json();
    if(value.ready!==true)throw new Error('The managed console session did not open.');
  }else{
    const response=await fetch('/_merchant/info',{credentials:'same-origin',redirect:'error'});
    if(!response.ok)throw new Error('Open the current private console URL from Applications.');
  }
  await new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='/app.js';
    script.onload=resolve;script.onerror=()=>reject(new Error('The original application script did not load.'));
    document.body.append(script);
  });
}
try{await openOriginal();}
catch(error){
  const box=document.createElement('section');box.setAttribute('role','alert');
  const title=document.createElement('h2');title.textContent='Open the private transport workbench';
  const message=document.createElement('p');message.textContent=error.message;
  const retry=document.createElement('button');retry.type='button';retry.textContent='Try current connection';
  retry.addEventListener('click',()=>location.reload());
  box.append(title,message,retry);document.body.prepend(box);
}
