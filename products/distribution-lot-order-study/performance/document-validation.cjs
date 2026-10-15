'use strict';
// Compare complete retained document bytes. Caller supplies the preceding Core
// module, current full source bank and actual retained authored fixture.
module.exports=function measure(bank,beforeCoreSource,fixture,encode){
 const loader=function bankLoader(bank,overrides={}){const cache={};function norm(p){const a=[];for(const x of p.split('/'))if(x==='..')a.pop();else if(x&&x!=='.')a.push(x);return a.join('/');}function get(p){p=norm(p);if(p in overrides)return overrides[p];if(cache[p])return cache[p].exports;if(!(p in bank))throw Error('Missing '+p);if(p.endsWith('.json'))return JSON.parse(bank[p]);const m={exports:{}};cache[p]=m;const base=p.split('/').slice(0,-1).join('/');Function('require','module','exports',bank[p].replace(/^#![^\n]*\n/,''))(q=>q.startsWith('.')?get(base+'/'+q):q in overrides?overrides[q]:(()=>{throw Error('Unavailable '+q)})(),m,m.exports);return m.exports;}return get;};
 const before=loader({...bank,'core.cjs':beforeCoreSource}),after=loader(bank),Core=before('core.cjs'),SHA=before('sha256.cjs'),Binary=before('binary.cjs'),study=Core.empty('Complete original validation measurement');
 study.documents=fixture.documents.map(d=>{const bytes=encode(d.text);return{id:d.id,name:d.id+'.txt',media_type:'text/plain',notes:'Actual retained authored original',captured_at:d.available_at,available_at:d.available_at,bytes:bytes.length,sha256:SHA.sha256Bytes(bytes).sha256,base64:Binary.encode(bytes)};});
 function run(core){const times=[];for(let i=0;i<3;i++){const x=JSON.parse(JSON.stringify(study)),t=Date.now(),out=core.validate(x);times.push(Date.now()-t);if(JSON.stringify(out)!==JSON.stringify(study))throw Error('Validation changed the study');}return times;}
 const result={documents:study.documents.length,original_bytes:study.documents.reduce((n,d)=>n+d.bytes,0),before_ms:run(Core),after_ms:run(after('core.cjs')),all_returned_study_bytes_exact:true,changed_source_checks:[]};
 for(const [label,change]of [['changed bytes',d=>{d.base64=Binary.encode(encode('Changed original'));}],['changed claimed digest',d=>{d.sha256='0'.repeat(64);}],['changed claimed length',d=>{d.bytes++;}],['malformed encoding',d=>{d.base64='bad';}],['metadata still validates',d=>{d.available_at='bad';}]]){
  const x=JSON.parse(JSON.stringify(study));change(x.documents[0]);let rejected=false;try{after('core.cjs').validate(x)}catch{rejected=true;}if(!rejected)throw Error(label);result.changed_source_checks.push(label);
 }
 return result;
};
