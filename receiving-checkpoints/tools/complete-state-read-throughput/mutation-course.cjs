'use strict';
const runtime=require('./runtime.cjs'),restore=require('./restore-checkpoint.cjs');

function workspaceHashes(before,after,workspace){
 const value=JSON.parse(JSON.stringify(workspace)),results=[];
 value.drafts['cache:pending']={content:'Complete mutable workspace draft A',notes:'Exact content must invalidate'};
 const a=before.M.hash(value),b=after.M.hash(value);if(a!==b)throw Error('First complete workspace hash differs');
 value.drafts['cache:pending'].content='Complete mutable workspace draft B';
 const c=before.M.hash(value),d=after.M.hash(value);if(c!==d||c===a)throw Error('Same-object workspace mutation was not hashed exactly');
 return {name:'Successive edits to the same complete workspace produce distinct original-equivalent hashes',first:a,second:c};
}

module.exports=function mutationCourse(product,beforeFiles,afterFiles,checkpoint,progress=()=>{}){
 const input=restore(checkpoint),view=input.state,slug={fleet:'fleet-availability',water:'water-operations',distribution:'distribution-lot-order',procurement:'procurement-savings'}[product];
 if(!slug)throw Error('Unknown installed product');
 const copy=x=>JSON.parse(JSON.stringify(x)),raw={schema:'stellar-forge.'+slug+'-state.v1',installationId:view.installationId,sequence:view.sequence,carrier:copy(view.carrier),receipts:copy(view.receipts),rejections:copy(view.rejections)},before=runtime(beforeFiles),after=runtime(afterFiles),checks=[];
 const assert=(value,name,details={})=>{if(!value)throw Error(name);checks.push({name,...details});progress(checks.at(-1));};
 const equality=(label,state)=>{const a=before.model.view(state),b=after.model.view(state),left=JSON.stringify(a),right=JSON.stringify(b);assert(left===right,label,{bytes:after.C.utf8Encode(right).length,sha256:b.sha256});return b.sha256;};
 const originalText=JSON.stringify(raw);
 const original=equality('Complete retained managed state remains exact',raw);
 assert(original===view.sha256,'Original retained state hash matches the checkpoint');
 const changed=copy(raw);changed.carrier.session.draft.actor+=' | complete-content cache mutation';
 const caught=fn=>{try{fn();return null;}catch(e){return {message:e.message,code:e.code||null,status:e.status||null};}};
 const invalidBefore=caught(()=>before.model.view(changed)),invalidAfter=caught(()=>after.model.view(changed));
 assert(invalidBefore&&JSON.stringify(invalidBefore)===JSON.stringify(invalidAfter),'Changed carrier with its old hash is rejected identically',{error:invalidAfter});
 changed.carrier.sha256=after.C.hashText(JSON.stringify(changed.carrier.session));
 const successor=equality('Valid same-object carrier edit invalidates the exact-content caches',changed);
 assert(successor!==original,'Changed complete carrier has a distinct state identity');
 changed.carrier.session.draft.actor=changed.carrier.session.draft.actor.replace('mutation','revision');
 changed.carrier.sha256=after.C.hashText(JSON.stringify(changed.carrier.session));
 const second=equality('A second mutation of the same object produces the same full view as the original implementation',changed);
 assert(second!==successor,'Second mutation retains its own exact identity');
 const workspaceOutcome=workspaceHashes(before,after,raw.carrier.session.workspace);checks.push(workspaceOutcome);progress(workspaceOutcome);
 const damaged=copy(raw),archive=damaged.carrier.session.workspace.archive,key=Object.keys(archive)[0];if(!key)throw Error('Full retained history is absent');
 archive[key].performance_mutation='changed original';
 damaged.carrier.sha256=after.C.hashText(JSON.stringify(damaged.carrier.session));
 const archiveBefore=caught(()=>before.model.view(damaged)),archiveAfter=caught(()=>after.model.view(damaged));
 assert(archiveBefore&&JSON.stringify(archiveBefore)===JSON.stringify(archiveAfter),'Changed retained original is rejected after the outer carrier hash is recomputed',{error:archiveAfter});
 assert(JSON.stringify(raw)===originalText,'All original retained state bytes remain unchanged');
 const stats={codec:after.C.hashText.cacheStats(),workspaceHash:after.M.hash.cacheStats(),validatedValues:after.M.validate.cacheStats()};
 for(const [name,s]of Object.entries(stats))assert(s.retainedBytes<=s.maxBytes&&s.entries<=s.maxEntries,'Bounded '+name+' cache retains its declared limits',s);
 return {schema:'commons.complete-state-cache-mutation-course/v1',product,checks,stats,passed:true};
};

module.exports.workspaceHashes=workspaceHashes;
