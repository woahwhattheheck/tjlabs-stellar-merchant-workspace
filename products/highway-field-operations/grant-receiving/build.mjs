// MIT. Rebuild the complete Highway reviewer package with the maintained grant modules.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../..');
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!args[i].startsWith('--')||args[i+1]===undefined)throw Error('Use --base-dir DIR --output-dir DIR --at ISO_TIME');options[args[i].slice(2)]=args[i+1];}
const need=(v,m)=>{if(!v)throw Error(m);},hash=b=>createHash('sha256').update(b).digest('hex');
need(options['base-dir']&&options['output-dir']&&options.at,'Select the four complete original inputs, destination and observed creation time.');
need(Number.isFinite(Date.parse(options.at)),'Use a valid observed timestamp.');
const selected=JSON.parse(await readFile(resolve(here,'SOURCE_SELECTION.json'),'utf8'));
for(const f of selected.sourceModules){const body=await readFile(resolve(root,f.path));need(body.length===f.bytes&&hash(body)===f.sha256,'Use the selected maintained grant source: '+f.path);}
const H=await import(pathToFileURL(resolve(root,'stellar-forge/developer-site/dist/grant-handover-source.mjs')));
const P=await import(pathToFileURL(resolve(root,'stellar-forge/developer-site/dist/grant-product-sources-core.mjs')));
const G=await import(pathToFileURL(resolve(root,'stellar-forge/developer-site/grant-customers.mjs')));
const S=await import(pathToFileURL(resolve(root,'stellar-forge/developer-site/dist/grant-submission-core.mjs')));
const input=resolve(options['base-dir']),output=resolve(options['output-dir']);
need(input!==output,'Keep the original source files separately from the following output.');
const filenames=['application.md','source-index.json','budget.csv','product-and-finance.md'],original={};
for(const name of filenames){const body=await readFile(resolve(input,name)),expected=selected.currentReviewerInputs.find(x=>x.name===name);need(expected&&body.length===expected.bytes&&hash(body)===expected.sha256,'Complete selected input differs: '+name);original[name]=body;}
const originalIndex=JSON.parse(original['source-index.json']),originalCompanion=original['product-and-finance.md'].toString('utf8');
let companion=originalCompanion,index=JSON.parse(JSON.stringify(originalIndex));
const declarations=[
 ['products/curriculum-migration-workbench/GRANT.md','stellar-forge/developer-site/grant-products/curriculum-migration-workbench.json'],
 ['products/mpc-recovery-operations/GRANT.md','stellar-forge/developer-site/grant-products/mpc-recovery-operations.json'],
 ['stellar-forge/developer-site/GRANT_HIGHWAY_FIELD_OPERATIONS.md','stellar-forge/developer-site/grant-products/highway-field-operations.json']
];
for(const [chapterPath,registrationPath]of declarations){
 const chapter=await readFile(resolve(root,chapterPath),'utf8'),raw=await readFile(resolve(root,registrationPath));
 const expected=selected.composedFiles.find(x=>x.path===chapterPath);need(expected&&Buffer.byteLength(chapter)===expected.bytes&&hash(chapter)===expected.sha256,'Select the original complete authored chapter: '+chapterPath);
 const expectedRegistration=selected.composedFiles.find(x=>x.path===registrationPath);need(expectedRegistration&&raw.length===expectedRegistration.bytes&&hash(raw)===expectedRegistration.sha256,'Select the original complete registration: '+registrationPath);
 const registration={...JSON.parse(raw),definition:{path:registrationPath.replace('stellar-forge/developer-site/',''),bytes:raw.length,sha256:hash(raw),git_blob:await H.gitBlob(raw)}};
 companion=G.receiveGrantCustomerSections(companion,chapter,{productRegistrations:[registration]});
 index=G.projectGrantSourceIndex(P.receiveGrantProductSources(index,chapter,[registration]));
 if(chapterPath==="products/mpc-recovery-operations/GRANT.md")index.product_and_finance={...index.product_and_finance,prior_git_blob:index.product_and_finance.git_blob,git_blob:await H.gitBlob(Buffer.from(companion)),bytes:Buffer.byteLength(companion),sha256:hash(companion)};
}
const before=P.grantProductChapters(originalCompanion),after=P.grantProductChapters(companion),heading=selected.registration.heading;
const changed=before.filter(x=>after.find(y=>y.heading===x.heading)?.markdown!==x.markdown).map(x=>x.heading);
need(changed.length===1&&changed[0]===heading,'Preserve all other complete current chapters.');
const priorRows=new Map(originalIndex.sources.map(x=>[x.id,JSON.stringify(x)]));
need(index.sources.every(x=>!priorRows.has(x.id)||priorRows.get(x.id)===JSON.stringify(x)),'Preserve all original current source records.');
index.product_and_finance={...index.product_and_finance,prior_git_blob:index.product_and_finance.git_blob,git_blob:await H.gitBlob(Buffer.from(companion)),bytes:Buffer.byteLength(companion),sha256:hash(companion)};
const indexText=JSON.stringify(index,null,2)+'\n',source=S.makeSource({markdown:original['application.md'].toString('utf8'),index,url:selected.currentReviewerInputs.find(x=>x.name==='application.md').url,receivedAt:options.at});
const bundle=await H.createSourceBundle(source,{indexBytes:Buffer.from(indexText),budgetBytes:original['budget.csv'],companionBytes:Buffer.from(companion),receivedAt:options.at,urls:{application:source.url,budget:selected.currentReviewerInputs.find(x=>x.name==="budget.csv").url}});
const text=await H.createReviewerSourcePackage({source,...bundle},{exportedAt:options.at}),opened=await H.openReviewerSourcePackage(text);
need(JSON.stringify(opened)===JSON.stringify({source,...bundle}),'The complete reviewer package did not reopen exactly.');
await mkdir(output,{recursive:true});
for(const [name,body]of Object.entries({'application.md':original['application.md'],'source-index.json':indexText,'budget.csv':original['budget.csv'],'product-and-finance.md':companion,'highway-reviewer-source.json':text}))await writeFile(resolve(output,name),body,{flag:'wx'});
console.log(JSON.stringify({package:resolve(output,'highway-reviewer-source.json'),bytes:Buffer.byteLength(text),sha256:hash(text),bundleId:bundle.bundle.id,chapters:after.length,sources:index.sources.length,changedChapter:heading}));
