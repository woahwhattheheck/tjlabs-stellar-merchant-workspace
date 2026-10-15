'use strict';
module.exports=async function adoptionCourse(bundle){
 const files=Object.fromEntries(bundle.map(x=>[x.path,x.content])),cache={};
 function req(p){if(cache[p])return cache[p];const m={exports:{}};const dir=p.split('/').slice(0,-1);Function('module','exports','require',files[p])(m,m.exports,n=>{const a=[];for(const v of [...dir,...n.split('/')])if(v==='..')a.pop();else if(v&&v!=='.')a.push(v);return req(a.join('/'));});return cache[p]=m.exports;}
 const C=req('core.cjs'),CSV=req('csv.cjs');let study=JSON.parse(files['examples/complete.study.json']);
 for(const side of ['source','returned']){const current=C.rows(study,'profiles',side)[0].values,prior={...current,id:'profile-prior',revision:'1',supersedes_id:'',diet:'strict_vegan',recorded_at:'2026-10-15T07:58:00Z',available_at:'2026-10-15T07:58:00Z',approved_at:'2026-10-15T07:57:00Z'},latest={...current,revision:'2',supersedes_id:'profile-prior'};
 study=C.importExtract(study,{kind:'profiles',side,name:'authored-newest-first-profiles.csv',content:CSV.csv([C.FIELDS.profiles,...[latest,prior].map(x=>C.FIELDS.profiles.map(k=>x[k]))]),mapping:Object.fromEntries(C.FIELDS.profiles.map(k=>[k,k])),available_at:'2026-10-15T08:00:00Z',at:'2026-10-15T14:00:00Z'});}
 return req('operator/browser-course.cjs')(bundle,{study,adoption_only:true});
};
