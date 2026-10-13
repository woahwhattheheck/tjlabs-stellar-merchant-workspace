// MIT. Compose the complete selected Source Monitoring reviewer edition.
export async function composeSourceMonitoringGrant(input,{H,P,G,S,utf8,sha256}){
  const need=(v,m)=>{if(!v)throw Error(m);},copy=v=>JSON.parse(JSON.stringify(v));
  const {base,sourceChapter,sourceRegistration,highwaySourceChapter,highwayRegistration,at,productCommit,sourceModules}=input;
  need(Number.isFinite(Date.parse(at)),'Use the actual package creation time.');
  const hash=s=>sha256(utf8(s)),git=s=>H.gitBlob(utf8(s));
  const originalIndex=JSON.parse(base['source-index'].content),originalCompanion=base['product-and-finance'].content;
  const oldChapters=P.grantProductChapters(originalCompanion);
  const monitoring=JSON.parse(sourceRegistration),highway=JSON.parse(highwayRegistration);
  const selected=oldChapters.filter(c=>c.heading===highway.heading);
  need(selected.length===1,'Receive the one complete original Highway chapter.');
  const marker='### Complete offline field work and reviewed return';
  need(highwaySourceChapter.split(marker).length===2,'Receive the complete accepted Highway continuation.');
  const appendix=marker+highwaySourceChapter.split(marker)[1];
  let highwayChapter=selected[0].markdown;
  if(!highwayChapter.includes(marker))highwayChapter=highwayChapter.trimEnd()+'\n\n'+appendix.trim()+'\n';
  else need(highwayChapter.slice(highwayChapter.indexOf(marker)).trim()===appendix.trim(),'Retain the current changed Highway continuation and deliberately select its successor.');
  let companion=originalCompanion,index=copy(originalIndex);
  const definitions=[
    {chapter:highwayChapter,raw:highwayRegistration,path:'grant-products/highway-field-operations.json'},
    {chapter:sourceChapter,raw:sourceRegistration,path:'grant-products/source-monitoring.json'}
  ],registered=[];
  for(const item of definitions){
    const registration={...JSON.parse(item.raw),definition:{path:item.path,bytes:utf8(item.raw).length,sha256:hash(item.raw),git_blob:await git(item.raw)}};
    registered.push(registration);
    companion=G.receiveGrantCustomerSections(companion,item.chapter,{productRegistrations:[registration]});
    index=G.projectGrantSourceIndex(P.receiveGrantProductSources(index,item.chapter,[registration]));
  }
  const after=P.grantProductChapters(companion);
  need(after.length===oldChapters.length,'Retain all current complete chapters without duplicate products.');
  const changed=oldChapters.filter(c=>after.filter(x=>x.heading===c.heading).length!==1||after.find(x=>x.heading===c.heading).markdown!==c.markdown).map(x=>x.heading);
  need(changed.every(x=>[monitoring.heading,highway.heading].includes(x))&&changed.includes(monitoring.heading),'Only these two original owned product chapters may change.');
  const oldHighway=selected[0].markdown.trimEnd(),newHighway=after.find(x=>x.heading===highway.heading).markdown;
  need(newHighway.startsWith(oldHighway),'Retain the whole current Highway chapter before its accepted continuation.');
  const previousRows=new Map(originalIndex.sources.map(x=>[x.id,JSON.stringify(x)]));
  const changedPrior=index.sources.filter(x=>previousRows.has(x.id)&&previousRows.get(x.id)!==JSON.stringify(x)).map(x=>x.id);
  need(changedPrior.length===0,'Retain every original source record: '+changedPrior.join(', '));
  need(index.sources.length===new Set(index.sources.map(x=>x.id)).size,'Retain one source record per original identity.');
  index.product_and_finance={...index.product_and_finance,prior_git_blob:originalIndex.product_and_finance.git_blob,
    git_blob:await git(companion),bytes:utf8(companion).length,sha256:hash(companion)};
  const unrelated=Object.keys(originalIndex).filter(x=>!['sources','product_and_finance','narrative_source'].includes(x));
  for(const key of unrelated)need(JSON.stringify(index[key])===JSON.stringify(originalIndex[key]),'Retain the original '+key+' field.');
  const indexText=JSON.stringify(index,null,2)+'\n';
  const source=S.makeSource({markdown:base.application.content,index,url:base.application.sourceUrl,receivedAt:at});
  const bundle=await H.createSourceBundle(source,{indexBytes:utf8(indexText),budgetBytes:utf8(base.budget.content),companionBytes:utf8(companion),
    receivedAt:at,urls:Object.fromEntries(Object.entries(base).map(([role,item])=>[role,item.sourceUrl]))});
  const received={source,...bundle},packageText=await H.createReviewerSourcePackage(received,{exportedAt:at}),reopened=await H.openReviewerSourcePackage(packageText);
  need(JSON.stringify(reopened)===JSON.stringify(received),'The complete four-role reviewer source did not reopen identically.');
  const report={schema:'commons.source-monitoring-grant-receiving.v1',productCommit,createdAt:at,
    originalApplicationGit:originalIndex.application.git_blob,originalCompanionGit:originalIndex.product_and_finance.git_blob,
    composition:{before:oldChapters.length,after:after.length,changed,preservedOtherChapters:oldChapters.length-changed.length},
    sourcesBefore:originalIndex.sources.length,sourcesAfter:index.sources.length,changedPriorSources:changedPrior,
    originalFieldsPreserved:unrelated,registrations:registered,sourceModules,
    package:{bytes:utf8(packageText).length,sha256:hash(packageText),bundleId:bundle.bundle.id,sameReopen:true,
      files:bundle.bundle.body.files.map(x=>({role:x.role,bytes:x.bytes,sha256:x.sha256}))}};
  return{packageText,companion,indexText,received,report,highwayChapter};
}
