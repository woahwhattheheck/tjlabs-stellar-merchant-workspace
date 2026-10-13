// MIT. Pure assembly shared by the file builder and connected source receiving.
export function assembleRecipient(sources,payload=null){
 const names=['sha256.mjs','core.mjs','review.mjs','renewal.mjs','renewal-panel.mjs','review-panel.mjs','workspace.mjs','reader.html'];
 for(const name of names)if(typeof sources[name]!=='string')throw new Error('Missing complete reader source: '+name);
 const withoutModules=source=>source.replace(/^import .*;\r?\n/gm,'').replace(/\bexport (?=(?:const|let|class|function|async function)\b)/g,'');
 const exposed=['REVIEW_SCHEMA','REVIEW_WORKING_SCHEMA','MAX_REVIEW_BYTES','MAX_WORKING_BYTES','recipientDecisionReference','recipientContext','validateRecipientReview','createRecipientReview','saveRecipientProposal','exportRecipientReview','openRecipientReview','recipientView','compareRecipientReview','selectRecipientAdoption','exportRecipientWorking','openRecipientWorking'];
 const renewalExports=['RENEWAL_SCHEMA','MAX_RENEWAL_BYTES','beginRecipientRenewal','openRecipientRenewal','editRecipientRenewal','saveRecipientRenewalChoice','completeRecipientRenewal','exportRecipientRenewal','recipientRenewalWorking','recipientRenewalReport'];
 const script=['sha256.mjs','core.mjs'].map(name=>withoutModules(sources[name])).join('\n')+
  '\nconst {'+exposed.join(',')+'}=(()=>{\n'+withoutModules(sources['review.mjs'])+'\nreturn {'+exposed.join(',')+'};})();\n'+
  '\nconst {'+renewalExports.join(',')+'}=(()=>{\n'+withoutModules(sources['renewal.mjs'])+'\nreturn {'+renewalExports.join(',')+'};})();\n'+
  ['renewal-panel.mjs','review-panel.mjs','workspace.mjs'].map(name=>withoutModules(sources[name])).join('\n')+'\nmount(document);\n';
 let html=sources['reader.html'].replace('<html lang="en">','<html lang="en" data-standalone="true">');
 if(!html.includes('<script type="module" id="catalog-application">'))throw new Error('Original reader application marker missing.');
 html=html.replace(/<script type="module" id="catalog-application">[\s\S]*?<\/script>/,()=>'<script type="module" id="catalog-application">\n'+script.replace(/<\/script/gi,'<\\/script')+'</script>');
 if(payload!==null){
  if(typeof payload.name!=='string'||typeof payload.base64!=='string'||!/^[a-f0-9]{64}$/.test(payload.sha256))throw new Error('Invalid original bundle payload.');
  const encoded=JSON.stringify(payload).replaceAll('<','\\u003c');
  html=html.replace('<script id="catalog-payload" type="application/json"></script>',()=>'<script id="catalog-payload" type="application/json">'+encoded+'</script>');
 }
 return html;
}
