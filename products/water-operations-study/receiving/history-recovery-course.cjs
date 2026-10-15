'use strict';
module.exports=function historyRecoveryCourse({core,M,legacy}){
 const checks=[],assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);},copy=x=>JSON.parse(JSON.stringify(x));
 const original=legacy.study,digest=core.digest(original),archiveText=JSON.stringify(legacy.archive);
 const old=M.normalize(copy(legacy)),recovered=M.historyStudy(old,old.history[0]);
 assert(core.digest(recovered)===digest&&JSON.stringify(recovered)===JSON.stringify(original),"Legacy history uses canonical Core.empty field order and retains exact reviewed study");
 assert(JSON.stringify(old.archive)===archiveText,"Reading legacy history preserves every original archive object and hash");
 const oldBranch=M.branchSession(old,old.backups[0]);
 assert(core.digest(oldBranch.study)===digest&&JSON.stringify(oldBranch.study.reviews)===JSON.stringify(original.reviews),"Legacy complete branch keeps review binding");
 const reordered=Object.fromEntries(Object.entries(copy(original)).reverse()),reorderedDigest=core.digest(reordered);
 const next=M.checkpoint(M.create(reordered),reordered,"Preserve explicit source order"),restored=M.historyStudy(M.normalize(copy(next)),next.history[0]);
 assert(JSON.stringify(restored)===JSON.stringify(reordered)&&core.digest(restored)===reorderedDigest,"New history preserves exact noncanonical source field order");
 const retained=M.retain(next,M.create(reordered),"Preserve complete reordered branch"),branch=M.branchSession(M.normalize(copy(retained)),retained.backups.at(-1));
 assert(JSON.stringify(branch.study)===JSON.stringify(reordered),"New retained branch reopens with complete source identity");
 const continued=M.checkpoint(old,recovered,"Continue after original recovery"),currentReviews=core.analyze(continued.study).reviews;
 assert(currentReviews.some(x=>x.study_sha256===digest&&x.reviewer==="History recovery course"),"Recovered review remains current during actual analysis and continued editing");
 return{schema:"installed-study-history-recovery/v1",surface:"Actual production core/session in V8",checks,original_digest:digest,reordered_digest:reorderedDigest,legacy_archive_unchanged:true};
};