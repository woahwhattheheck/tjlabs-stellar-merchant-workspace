// SPDX-License-Identifier: MIT
// Portable receiving of the original bank close; this module performs no ledger writes.
export const CLOSE_SCHEMA='stellar-forge.merchant-bank-close.v1';
export const REVIEW_SCHEMA='stellar-forge.bank-accountant-review.v1';
export const BUNDLE_SCHEMA='stellar-forge.bank-accountant-review-bundle.v1';
export const MAX_ARCHIVE_BYTES=128_000_000;
export const MAX_BUNDLE_BYTES=384_000_000;
export const REVIEW_STATUSES=['OPEN','QUESTION','EXAMINED','RESOLVED'];
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const HEX=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export function need(ok,code,message){if(!ok)throw Object.assign(new Error(message),{code});}
export const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export const copy=x=>JSON.parse(JSON.stringify(x));
export const json=x=>encoder.encode(JSON.stringify(x,null,2)+'\n');
export function bytes(value){if(value instanceof Uint8Array)return value;if(value instanceof ArrayBuffer)return new Uint8Array(value);need(false,'BYTES_REQUIRED','Choose the complete original archive bytes.');}
export async function digest(value){return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes(value))),x=>x.toString(16).padStart(2,'0')).join('');}
export function parseJson(value,label='file'){try{return JSON.parse(decoder.decode(bytes(value)));}catch{need(false,'INVALID_JSON','The complete '+label+' is not valid UTF-8 JSON.');}}
function text(value,label,max=4000,empty=false){need(typeof value==='string'&&value.length<=max&&(empty||value.trim().length>0),'INVALID_TEXT','Check '+label+'.');return value.trim();}
function uuid(value,label){need(UUID.test(value??''),'INVALID_ID','Choose the original '+label+' identifier.');return value;}
function safeName(value){return typeof value==='string'&&/^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(value)&&value.length<=255&&value.split('/').every(x=>x!=='.'&&x!=='..');}
const equal=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
const stamp=value=>{need(typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value,'INVALID_TIME','Keep a complete original review timestamp.');return value;};
function tarText(header,start,length){const part=header.subarray(start,start+length),end=part.indexOf(0);const used=end<0?part:part.subarray(0,end);need(used.every(x=>x>=32&&x<=126),'TAR_HEADER','The original archive contains an unsupported header.');return String.fromCharCode(...used);}
function octal(header,start,length){const str=tarText(header,start,length).trim();need(/^[0-7]+$/.test(str),'TAR_NUMBER','The original archive has an invalid numeric header.');const value=parseInt(str,8);need(Number.isSafeInteger(value),'TAR_NUMBER','An archive member is too large.');return value;}
export function readTar(input,{maximum=MAX_ARCHIVE_BYTES}={}){
 const raw=bytes(input);need(raw.length>=1024&&raw.length<=maximum&&raw.length%512===0,'TAR_SIZE','Choose a complete standard bank TAR within the receiving limit.');
 const members=new Map();let offset=0,ended=false;
 while(offset<raw.length){
  const header=raw.subarray(offset,offset+512);
  if(header.every(x=>x===0)){need(raw.length-offset>=1024&&raw.subarray(offset).every(x=>x===0),'TAR_END','The original archive has an incomplete or changed ending.');ended=true;break;}
  need(tarText(header,257,6)==='ustar'&&tarText(header,263,2)==='00','TAR_FORMAT','Choose the original standard ustar archive.');
  const expected=octal(header,148,8),actual=header.reduce((sum,x,i)=>sum+(i>=148&&i<156?32:x),0);
  need(expected===actual,'TAR_CHECKSUM','An archive header differs from its original checksum.');
  need(header[156]===48||header[156]===0,'TAR_MEMBER_TYPE','The archive may contain regular files only.');
  need(tarText(header,157,100)==='','TAR_LINK','Linked archive members cannot be received.');
  const prefix=tarText(header,345,155),name=(prefix?prefix+'/':'')+tarText(header,0,100),size=octal(header,124,12);
  need(safeName(name)&&!members.has(name),'TAR_PATH','Keep unique original member names without traversal.');
  need(size<=maximum&&offset+512+size<=raw.length,'TAR_TRUNCATED','An original archive member is incomplete.');
  const padded=Math.ceil(size/512)*512;
  need(raw.subarray(offset+512+size,offset+512+padded).every(x=>x===0),'TAR_PADDING','Archive padding changed.');
  members.set(name,raw.subarray(offset+512,offset+512+size));need(members.size<=15000,'TAR_MEMBER_LIMIT','This archive exceeds the supported member count.');
  offset+=512+padded;
 }
 need(ended,'TAR_END','The original archive is missing its complete ending.');return members;
}
export function writeTar(files,{maximum=MAX_BUNDLE_BYTES}={}){
 const rows=Array.from(files instanceof Map?files.entries():files.map(x=>[x.name,x.bytes]));let length=1024;const seen=new Set();
 for(const [name,value] of rows){need(safeName(name)&&!seen.has(name),'TAR_PATH','Use unique safe archive names.');seen.add(name);length+=512+Math.ceil(bytes(value).length/512)*512;}
 need(rows.length>0&&rows.length<=15000&&length<=maximum,'TAR_SIZE','The complete review exceeds its archive limit.');const out=new Uint8Array(length);let offset=0;
 const put=(h,str,start,size)=>{const value=encoder.encode(str);need(value.length<=size,'TAR_FIELD','An original archive name exceeds ustar limits.');h.set(value,start);};
 const number=(h,n,start,size)=>put(h,n.toString(8).padStart(size-1,'0')+'\0',start,size);
 for(const [name,value] of rows){const body=bytes(value),header=out.subarray(offset,offset+512),split=name.lastIndexOf('/'),prefix=name.length>100&&split>0?name.slice(0,split):'',leaf=prefix?name.slice(split+1):name;
  put(header,leaf,0,100);put(header,prefix,345,155);number(header,0o600,100,8);number(header,0,108,8);number(header,0,116,8);number(header,body.length,124,12);number(header,0,136,12);header.fill(32,148,156);header[156]=48;put(header,'ustar\0',257,6);put(header,'00',263,2);
  put(header,header.reduce((a,b)=>a+b,0).toString(8).padStart(6,'0')+'\0 ',148,8);out.set(body,offset+512);offset+=512+Math.ceil(body.length/512)*512;
 }return out;
}
function array(value,label){need(Array.isArray(value),'CLOSE_SCHEMA','The original '+label+' list is missing.');return value;}
function unique(rows,label){const map=new Map();for(const row of array(rows,label)){need(plain(row)&&typeof row.id==='string'&&row.id.length>0&&!map.has(row.id),'CLOSE_IDENTITY','The original '+label+' identities are invalid or repeated.');map.set(row.id,row);}return map;}
function decimal(value,currency){need(plain(currency)&&/^[A-Z]{3}$/.test(currency.code??'')&&Number.isInteger(currency.scale)&&currency.scale>=0&&currency.scale<=6,'CLOSE_CURRENCY','The original account currency precision is invalid.');need(typeof value==='string'&&/^-?(?:0|[1-9][0-9]{0,38})(?:\.[0-9]+)?$/.test(value),'CLOSE_AMOUNT','Keep the exact decimal amount from the original close.');let negative=value.startsWith('-'),[a,b='']=(negative?value.slice(1):value).split('.');need(b.length<=currency.scale,'CLOSE_AMOUNT','An amount exceeds the original currency precision.');const units=(negative?-1n:1n)*(BigInt(a)*10n**BigInt(currency.scale)+BigInt(b.padEnd(currency.scale,'0')||'0'));need(units>=-((1n<<127n)-1n)&&units<=((1n<<127n)-1n),'CLOSE_AMOUNT','An amount exceeds the original supported minor-unit range.');return units;}
function formatted(n,currency){const negative=n<0n;if(negative)n=-n;const s=n.toString().padStart(currency.scale+1,'0');return (negative?'-':'')+(currency.scale?s.slice(0,-currency.scale)+'.'+s.slice(-currency.scale):s);}
async function verifyManifest(members,manifest,{schema,manifestName='manifest.json',named=true}){
 need(plain(manifest)&&manifest.schema===schema&&plain(manifest.files),'MANIFEST_SCHEMA','Choose the complete original manifest for this archive.');
 const names=Object.keys(manifest.files);need(names.length+1===members.size&&!Object.hasOwn(manifest.files,manifestName),'MANIFEST_FILES','The archive member set differs from its original manifest.');
 for(const name of names){const expected=manifest.files[name];need(safeName(name)&&plain(expected)&&(!named||expected.name===name)&&Number.isSafeInteger(expected.bytes)&&expected.bytes>=0&&HEX.test(expected.sha256??''),'MANIFEST_MEMBER','An original manifest member is invalid.');
  const member=members.get(name);need(member&&member.length===expected.bytes,'MANIFEST_BYTES','The original '+name+' has changed or is missing.');need(await digest(member)===expected.sha256,'MANIFEST_DIGEST','The original '+name+' differs from its retained SHA-256.');
 }
}
function byId(rows,id,label){const row=rows.find(x=>x.id===id);need(row,'LINEAGE_MISSING','The original '+label+' is missing.');return row;}
function originalFileForImport(imported,members){const extension={OFX:'ofx',QFX:'qfx',CSV:'csv',CAMT053:'xml'}[imported.format];const name='source-'+imported.id+'.'+extension;need(extension&&members.has(name),'SOURCE_FILE_MISSING','The original statement file is missing from this close.');return name;}
export async function inspectBankClose(input,{filename='bank-close.tar'}={}){
 const raw=bytes(input),members=readTar(raw),manifest=parseJson(members.get('manifest.json')??new Uint8Array(),'bank manifest');
 await verifyManifest(members,manifest,{schema:'stellar-forge.merchant-bank-close-manifest.v1'});
 for(const name of ['reconciliation.json','editable-reconciliation.json','transactions.csv','posting-parts.csv','reconciliation.html'])need(members.has(name),'CLOSE_FILE_MISSING','The original '+name+' is required.');
 const report=parseJson(members.get('reconciliation.json'),'reconciliation'),snapshot=parseJson(members.get('editable-reconciliation.json'),'editable reconciliation');
 need(report.schema===CLOSE_SCHEMA&&snapshot.schema==='stellar-forge.merchant-bank-editable-close.v1'&&plain(snapshot.workspace),'CLOSE_SCHEMA','Choose an original bank close and its complete editable snapshot.');
 need(report.id===manifest.closeId&&report.account?.id===manifest.accountId&&snapshot.account?.id===manifest.accountId&&report.reviewSha256===manifest.reviewSha256&&JSON.stringify(snapshot.close)===JSON.stringify(report),'CLOSE_IDENTITY','The close, editable snapshot and manifest do not identify the same original edition.');
 const reviewed=copy(report);for(const key of ['id','name','note','createdAt','actor','requestId','reviewSha256'])delete reviewed[key];need(await digest(json(reviewed))===report.reviewSha256,'CLOSE_REVIEW_DIGEST','The original close differs from its reviewed reconciliation.');
 need(plain(report.currency)&&report.currency.code===snapshot.account.currency?.code&&report.currency.scale===snapshot.account.currency?.scale,'CLOSE_CURRENCY','The original currency bindings differ.');
 const tx=unique(report.transactions,'transactions'),matches=unique(report.matches,'matches');unique(snapshot.imports,'statement imports');unique(snapshot.receipts,'receipts');unique(snapshot.refunds,'refunds');unique(snapshot.customers,'customers');
 need(JSON.stringify(snapshot.transactions)===JSON.stringify(report.transactions),'CLOSE_TRANSACTIONS','The saved report and editable transaction edition differ.');
 for(const row of report.transactions){need(row.accountId===manifest.accountId,'CLOSE_ACCOUNT','A transaction belongs to another bank account.');array(row.copies,'source copies');}
 const matchesByTransaction=new Map();for(const match of report.matches){need(tx.has(match.transactionId)&&!matchesByTransaction.has(match.transactionId)&&!match.undoneAt,'CLOSE_MATCH','The saved close contains an invalid active match.');need(match.sourceFingerprint===tx.get(match.transactionId).financialSha256,'CLOSE_MATCH_SOURCE','A match identifies another source transaction edition.');matchesByTransaction.set(match.transactionId,match);array(match.parts,'posting parts');}
 let incoming=0n,outgoing=0n;const postings=[];
 for(const transaction of report.transactions){if(transaction.status!=='POSTED')continue;const amount=decimal(transaction.valuation?.amount??transaction.amount,report.currency);if(amount>=0n)incoming+=amount;else outgoing-=amount;
  const match=matchesByTransaction.get(transaction.id);need(match,'CLOSE_UNMATCHED','A posted transaction is missing its original saved match.');let total=0n;
  for(let index=0;index<match.parts.length;index++){const part=match.parts[index],units=decimal(part.amount,report.currency);need(units.toString()===part.minorAmount,'CLOSE_POSTING_AMOUNT','A posting amount differs from its retained minor units.');total+=units;postings.push({...copy(part),id:match.id+':'+index,matchId:match.id,transactionId:transaction.id,index});}
  need(total===amount,'CLOSE_POSTING_TOTAL','The original posting parts do not equal their bank transaction.');
 }
 const opening=decimal(report.openingBalance,report.currency),closing=decimal(report.closingBalance,report.currency);
 need(incoming===decimal(report.incoming,report.currency)&&outgoing===decimal(report.outgoing,report.currency)&&opening+incoming-outgoing===decimal(report.calculatedClosing,report.currency)&&closing-(opening+incoming-outgoing)===decimal(report.difference,report.currency),'CLOSE_TOTALS','The original close totals do not match its retained transactions.');
 need(report.ready===true&&report.problems?.length===0&&closing===opening+incoming-outgoing,'CLOSE_NOT_BALANCED','Choose an originally retained balanced bank close.');
 const sourceFiles=[];for(const imported of snapshot.imports){const name=originalFileForImport(imported,members),file=members.get(name);need(file.length===imported.file.bytes&&await digest(file)===imported.file.sha256,'SOURCE_FILE_CHANGED','A statement file differs from its original import.');sourceFiles.push({name,importId:imported.id,format:imported.format,bytes:file.length,sha256:imported.file.sha256,originalName:imported.file.name??name});}
 for(const retained of snapshot.receiptIntakeFiles??[]){const file=members.get(retained.archiveName);need(file&&file.length===retained.bytes&&await digest(file)===retained.sha256,'INTAKE_FILE_CHANGED','A retained Bank receipts file is missing or changed.');}
 for(const transaction of report.transactions)for(const source of transaction.copies)need(snapshot.imports.some(x=>x.id===source.importId),'SOURCE_LINEAGE','A transaction points to a statement import absent from its complete close.');
 const customers=[];for(const customer of snapshot.customers){const name='customer-'+customer.id+'.tar',body=members.get(name);need(body,'CUSTOMER_FILE_MISSING','An original participating customer archive is missing.');
  const files=readTar(body),customerManifest=parseJson(files.get('manifest.json')??new Uint8Array(),'customer file manifest');await verifyManifest(files,customerManifest,{schema:'stellar-forge.merchant-receivables-customer-files.v1',named:false});need(customerManifest.customerId===customer.id&&customerManifest.asOf===report.until,'CUSTOMER_IDENTITY','The nested customer manifest identifies another account date.');const documentName=files.has('account.json')?'account.json':null;
  need(documentName,'CUSTOMER_FILE_MISSING','The nested original customer account.json is missing.');const account=parseJson(files.get(documentName),'customer account');
  need(account.schema==='stellar-forge.merchant-receivables-customer-export.v1'&&account.customer?.id===customer.id&&account.asOf===report.until,'CUSTOMER_IDENTITY','The nested customer account identifies another customer.');
  customers.push({id:customer.id,name:customer.name,archiveName:name,bytes:body.length,sha256:await digest(body),files,account});
 }
 const archiveId=await digest(raw),manifestSha256=await digest(members.get('manifest.json'));
 const identity={workspaceId:snapshot.workspace.workspaceId,accountId:manifest.accountId,sourceIdentitySha256:snapshot.account.sourceIdentitySha256,currency:report.currency};
 need(typeof identity.workspaceId==='string'&&identity.workspaceId.length>0&&HEX.test(identity.sourceIdentitySha256??''),'CLOSE_WORKSPACE','The original accounting workspace or bank source identity is missing.');
 return {archiveId,filename:text(filename,'archive filename',255),bytes:raw.length,raw,members,manifest,manifestSha256,report,snapshot,identity,postings,sourceFiles,customers,
  summary:{archiveId,filename,bytes:raw.length,closeId:report.id,accountId:manifest.accountId,workspaceId:identity.workspaceId,name:report.name,accountName:report.account.name,from:report.from,until:report.until,currency:copy(report.currency),openingBalance:report.openingBalance,closingBalance:report.closingBalance,incoming:report.incoming,outgoing:report.outgoing,difference:report.difference,createdAt:report.createdAt,actor:report.actor,transactions:report.transactions.length,postings:postings.length,sources:sourceFiles.length,customers:customers.length,files:members.size,manifestSha256}};
}
export function lineage(archive,transactionId){
 const transaction=byId(archive.report.transactions,transactionId,'bank transaction'),matches=archive.snapshot.matches.filter(x=>x.transactionId===transaction.id),postings=archive.postings.filter(x=>x.transactionId===transaction.id);
 const receiptIds=new Set(postings.filter(x=>x.kind==='RECEIPT').map(x=>x.targetId)),refundIds=new Set(postings.filter(x=>x.kind==='REFUND').map(x=>x.targetId));
 const refunds=archive.snapshot.refunds.filter(x=>refundIds.has(x.id));for(const refund of refunds)if(refund.proposal?.receiptId)receiptIds.add(refund.proposal.receiptId);
 let expanded=true;while(expanded){expanded=false;for(const r of archive.snapshot.receipts){const related=[r.id,r.replacesReceiptId,r.replacedByReceiptId,...(r.replacementReceiptIds??[])].filter(Boolean);if(related.some(id=>receiptIds.has(id)))for(const id of related)if(!receiptIds.has(id)){receiptIds.add(id);expanded=true;}}}const receipts=archive.snapshot.receipts.filter(x=>receiptIds.has(x.id)),allocations=archive.snapshot.allocations.filter(x=>receiptIds.has(x.receiptId)),customerIds=new Set(receipts.map(x=>x.customerId));
 return {transaction:copy(transaction),sources:transaction.copies.map(x=>({copy:copy(x),import:copy(byId(archive.snapshot.imports,x.importId,'statement import')),file:archive.sourceFiles.find(y=>y.importId===x.importId)})),postings:copy(postings),matches:copy(matches),receipts:copy(receipts),refunds:copy(refunds),allocations:copy(allocations),customers:archive.customers.filter(x=>customerIds.has(x.id)).map(x=>({id:x.id,name:x.name,archiveName:x.archiveName,account:copy(x.account)})),prior:archive.report.transactions.filter(x=>[transaction.replacesTransactionId,transaction.duplicateOf,transaction.supersedesTransactionId,transaction.interpretationReplacesId,transaction.replacedById,transaction.replacesId,...(transaction.candidateIds??[])].includes(x.id)).map(copy)};
}
function compareRows(before,after){const a=new Map(before.map(x=>[x.id,x])),b=new Map(after.map(x=>[x.id,x])),changes=[];for(const id of new Set([...a.keys(),...b.keys()])){const old=a.get(id),current=b.get(id);if(JSON.stringify(old)!==JSON.stringify(current))changes.push({id,kind:!old?'ADDED':!current?'REMOVED':'CHANGED',before:old?copy(old):null,after:current?copy(current):null});}return changes;}
export function compareCloses(before,after){
 need(JSON.stringify(before.identity)===JSON.stringify(after.identity),'CLOSE_COMPARISON_ACCOUNT','Compare saved closes from the same original workspace, bank account and currency.');
 const a=before.report,b=after.report,totals={};for(const key of ['openingBalance','incoming','outgoing','calculatedClosing','closingBalance','difference'])totals[key]={before:a[key],after:b[key],change:formatted(decimal(b[key],b.currency)-decimal(a[key],a.currency),b.currency)};
 return {schema:'stellar-forge.bank-close-comparison.v1',before:copy(before.summary),after:copy(after.summary),kind:a.from===b.from&&a.until===b.until?'SAME_PERIOD_EDITIONS':'DIFFERENT_PERIODS',totals,
 transactions:compareRows(a.transactions,b.transactions),postings:compareRows(before.postings,after.postings),receipts:compareRows(before.snapshot.receipts,after.snapshot.receipts),refunds:compareRows(before.snapshot.refunds,after.snapshot.refunds),allocations:compareRows(before.snapshot.allocations,after.snapshot.allocations),sources:compareRows(before.snapshot.imports,after.snapshot.imports),reopenings:copy(after.snapshot.reopenings),relatedCloses:copy(after.snapshot.relatedCloses)};
}
export async function reviewTarget(archive,kind,id){
 let value,label;switch(kind){case'CLOSE':need(id===archive.report.id,'REVIEW_TARGET','Choose this original close.');value=archive.report;label=archive.report.name;break;
 case'TRANSACTION':value=byId(archive.report.transactions,id,'transaction');label=[value.postedDate,value.payee,value.reference].filter(Boolean).join(' · ');break;
 case'POSTING':value=byId(archive.postings,id,'posting');label=value.kind+' '+value.amount;break;
 case'SOURCE':value=archive.sourceFiles.find(x=>x.importId===id);need(value,'REVIEW_TARGET','Choose an original statement source.');label=value.originalName;break;
 case'CUSTOMER':value=archive.customers.find(x=>x.id===id);need(value,'REVIEW_TARGET','Choose a participating original customer.');label=value.name;value={id:value.id,archiveName:value.archiveName,sha256:value.sha256};break;
 default:need(false,'REVIEW_TARGET','Choose a close, transaction, posting, statement source or customer.');}
 return {archiveId:archive.archiveId,closeId:archive.report.id,kind,id,label:label??id,sourceSha256:await digest(json(value))};
}
export function newReview({id,name,createdAt}){return {schema:REVIEW_SCHEMA,id:uuid(id,'review workspace'),name:text(name,'review name',160),createdAt:stamp(createdAt),revision:0,archives:[],editions:[]};}
export function reviewArchiveSize(review){
 const reviewBytes=json(review).length,manifest={schema:BUNDLE_SCHEMA,reviewId:review.id,revision:review.revision,files:{'review.json':{name:'review.json',bytes:reviewBytes,sha256:'0'.repeat(64)}}};
 let size=1024+512+Math.ceil(reviewBytes/512)*512;
 for(const declared of review.archives){need(HEX.test(declared.archiveId??'')&&Number.isSafeInteger(declared.bytes)&&declared.bytes>=1024&&declared.bytes<=MAX_ARCHIVE_BYTES,'REVIEW_ARCHIVE_CHANGED','Keep each complete original archive size.');const name='close-'+declared.archiveId+'.tar';manifest.files[name]={name,bytes:declared.bytes,sha256:declared.archiveId};size+=512+Math.ceil(declared.bytes/512)*512;}
 size+=512+Math.ceil(json(manifest).length/512)*512;need(Number.isSafeInteger(size)&&size<=MAX_BUNDLE_BYTES,'REVIEW_BUNDLE_LIMIT','This complete review would exceed 384 MB. Keep this review and create another private review for additional original closes or notes.');return size;
}
export async function validateReview(review,archives){
 need(plain(review)&&review.schema===REVIEW_SCHEMA&&UUID.test(review.id??'')&&typeof review.name==='string'&&Number.isSafeInteger(review.revision)&&review.revision>=0&&Array.isArray(review.archives)&&Array.isArray(review.editions),'REVIEW_SCHEMA','Choose a complete accountant review.');
 text(review.name,'review name',160);stamp(review.createdAt);reviewArchiveSize(review);need(review.archives.length<=24,'REVIEW_ARCHIVE_LIMIT','Use at most 24 original closes per review.');const available=new Map(archives.map(x=>[x.archiveId,x]));need(review.archives.length===available.size&&new Set(review.archives.map(x=>x.archiveId)).size===review.archives.length,'REVIEW_ARCHIVES','The review and original archive selection differ.');
 for(const declared of review.archives){const a=available.get(declared.archiveId);need(a&&declared.closeId===a.report.id&&declared.manifestSha256===a.manifestSha256&&declared.bytes===a.bytes,'REVIEW_ARCHIVE_CHANGED','A review archive differs from its original received edition.');}
 let parent=null;const ids=new Set();for(let i=0;i<review.editions.length;i++){const edition=review.editions[i];need(UUID.test(edition.id??'')&&!ids.has(edition.id)&&edition.parentId===parent&&Number.isInteger(edition.revision)&&edition.revision===i+1,'REVIEW_HISTORY','The review edition history is incomplete.');ids.add(edition.id);stamp(edition.createdAt);text(edition.actor,'reviewer',160);text(edition.note,'review summary',12000,true);const base={...edition};delete base.sha256;need(await digest(json(base))===edition.sha256,'REVIEW_EDITION_CHANGED','A retained review edition changed.');
  const seen=new Set();for(const entry of array(edition.entries,'review entries')){need(plain(entry)&&REVIEW_STATUSES.includes(entry.status),'REVIEW_ENTRY','Choose an existing review status.');text(entry.note,'review note',12000,true);const a=available.get(entry.target?.archiveId);need(a,'REVIEW_ARCHIVE_CHANGED','A review target has no original archive.');const target=await reviewTarget(a,entry.target.kind,entry.target.id);need(JSON.stringify(target)===JSON.stringify(entry.target),'REVIEW_TARGET_CHANGED','A review note no longer names its original source.');const key=target.archiveId+':'+target.kind+':'+target.id;need(!seen.has(key),'REVIEW_ENTRY','The review contains repeated targets.');seen.add(key);}parent=edition.id;
 }need(review.revision===review.editions.length,'REVIEW_REVISION','The review revision differs from its complete history.');return review;
}
export async function retainReview(review,archives,{id,parentId,actor,note='',entries,createdAt}){
 await validateReview(review,archives);actor=text(actor,'reviewer',160);note=text(note,'review summary',12000,true);const prior=review.editions.find(x=>x.id===id);if(prior){need(JSON.stringify({actor,note,entries,parentId,createdAt})===JSON.stringify({actor:prior.actor,note:prior.note,entries:prior.entries,parentId:prior.parentId,createdAt:prior.createdAt}),'REVIEW_REQUEST_CHANGED','This review request ID already records another edit.');return copy(review);}
 need(parentId===(review.editions.at(-1)?.id??null),'REVIEW_STALE','A later review edition exists. Open it before saving your edit.');
 const edition={id:uuid(id,'review edition'),parentId,revision:review.revision+1,actor:text(actor,'reviewer',160),note:text(note,'review summary',12000,true),entries:copy(entries),createdAt:stamp(createdAt)};edition.sha256=await digest(json(edition));const next={...copy(review),revision:edition.revision,editions:[...copy(review.editions),edition]};await validateReview(next,archives);return next;
}
export function attachArchive(review,archive){const prior=review.archives.find(x=>x.archiveId===archive.archiveId);if(prior)return copy(review);need(review.archives.length<24,'REVIEW_ARCHIVE_LIMIT','Use at most 24 complete bank close editions in one private review.');const next={...copy(review),archives:[...copy(review.archives),{archiveId:archive.archiveId,closeId:archive.report.id,filename:archive.filename,bytes:archive.bytes,manifestSha256:archive.manifestSha256}]};reviewArchiveSize(next);return next;}
export async function exportReview(review,archives){
 await validateReview(review,archives);const files=new Map([['review.json',json(review)]]);for(const a of archives)files.set('close-'+a.archiveId+'.tar',a.raw);
 const manifest={schema:BUNDLE_SCHEMA,reviewId:review.id,revision:review.revision,files:{}};for(const [name,value] of files)manifest.files[name]={name,bytes:value.length,sha256:await digest(value)};
 files.set('manifest.json',json(manifest));return writeTar(files);
}
export async function receiveReview(input){
 const raw=bytes(input),files=readTar(raw,{maximum:MAX_BUNDLE_BYTES}),manifest=parseJson(files.get('manifest.json')??new Uint8Array(),'review manifest');await verifyManifest(files,manifest,{schema:BUNDLE_SCHEMA});const review=parseJson(files.get('review.json')??new Uint8Array(),'review');
 need(review.id===manifest.reviewId&&review.revision===manifest.revision,'REVIEW_IDENTITY','The original review and manifest identify different editions.');const archives=[];
 for(const declared of array(review.archives,'review archives')){const name='close-'+declared.archiveId+'.tar';need(files.has(name),'REVIEW_ARCHIVE_MISSING','An original bank close is missing from this review.');archives.push(await inspectBankClose(files.get(name),{filename:declared.filename}));}
 need(files.size===archives.length+2,'REVIEW_ARCHIVES','The review contains an undeclared original file.');await validateReview(review,archives);return {review,archives,sha256:await digest(raw),bytes:raw.length};
}
