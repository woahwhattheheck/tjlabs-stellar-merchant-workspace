'use strict';
// Execute the existing product's actual assembled-browser boot and controller.
// loader(bank) returns its CommonJS source resolver. Names bind the product's
// existing public controller and original complete-working download control.
module.exports=async function memoryFallbackCourse(bank,loader,notify,{deskProperty,downloadName}){
 if(typeof deskProperty!=='string'||typeof downloadName!=='string')throw Error('Bind the original product desk and working filename');
 const original=bank['receiving/portable-course.cjs'],cut=original.indexOf('const a=await boot(),checks=[]');
 if(cut<0)throw Error('Existing portable course boot boundary changed');
 const exposed=original.slice(0,cut)+'return {B,boot};\n};',get=loader(bank),m={exports:{}};
 Function('module','exports','require',exposed)(m,m.exports,p=>get(p.startsWith('./')?'receiving/'+p.slice(2):p));
 const {B,boot}=await m.exports(bank),checks=[],check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);notify({check:name});};
 let opens=0;const denied={open(){opens++;throw Error('Authored browser storage denied');},idle:async()=>{}};
 const a=await boot(null,denied),desk=a.window[deskProperty];
 check(a.nodes['save-state'].textContent==='Memory only: Authored browser storage denied','Actual assembled controller opens in memory with the original storage-denial reason');
 a.nodes['installed-actor'].value='Operator after storage denial';a.nodes['installed-actor'].oninput();await a.settle();
 await a.emit('input',{target:{id:'study-notes',value:'Original unfinished note survives storage denial'}});
 await a.click({view:'recovery'});
 check(desk.getSession().drafts['study-notes'].text==='Original unfinished note survives storage denial'&&desk.getInstalled().draft.actor==='Operator after storage denial'&&a.nodes['save-state'].textContent==='Memory only: Authored browser storage denied','Actor, unfinished note and later navigation retain complete working edits and original guidance');
 await a.click({action:'open-saved'});await a.click({action:'adopt-local'});
 check(opens===1&&a.nodes['save-state'].textContent==='Memory only: Authored browser storage denied'&&desk.getSession().drafts['study-notes'].text==='Original unfinished note survives storage denial','Explicit saved-copy operations retain working state without a null database transaction');
 await a.click({action:'installed-working'});const download=a.downloads.at(-1);
 const text=download.blob.parts.map(p=>typeof p==='string'?p:B.C.utf8Decode(p)).join(''),carrier=JSON.parse(text),received=B.sessions.receive(carrier);
 check(download.name===downloadName,'Working recovery control produces its complete download');
 check(received.workspace.drafts['study-notes'].text==='Original unfinished note survives storage denial'&&received.draft.actor==='Operator after storage denial','Downloaded original carrier reopens with exact actor and unfinished note');
 const b=await boot(carrier);
 await b.emit('input',{target:{id:'study-notes',value:'Continued note in saved storage'}});
 check(b.nodes['save-state'].textContent==='Saved in this browser'&&b.window[deskProperty].getSession().drafts['study-notes'].text==='Continued note in saved storage','The same generated source continues complete recovery in the ordinary atomic storage path');
 return {schema:'commons.installed-browser-memory-fallback-course.v1',surface:'Actual assembled production HTML/controllers with supplied browser DOM and atomic IndexedDB adapters',checks,deniedOpenCalls:opens,download:{name:download.name,bytes:B.C.utf8Encode(text).length,sha256:B.C.hashText(text)},preservedDraftActor:true};
};
