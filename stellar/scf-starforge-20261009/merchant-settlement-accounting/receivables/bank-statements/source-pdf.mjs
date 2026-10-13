// SPDX-License-Identifier: MIT
// Explicit page-mapped PDF interpretation through the maintained CSV parser.
// It preserves the PDF as the original financial file; no PDF text becomes cash automatically.
import {createHash} from 'node:crypto';
import {PDF_SCHEMA,PDF_LIMITS,canonical,validateExtraction,bankSourceDraft,sourceText} from './bank-pdf/model.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const copy=value=>JSON.parse(JSON.stringify(value));
const need=(value,code,message,details={})=>{if(!value)throw Object.assign(new Error(message),{code,details,status:400});};
export function readPdfReviewSource(input,value,{readCsv}) {
 const selection=value.pdfReview,work=selection?.workingCopy;
 need(work?.schema===PDF_SCHEMA&&typeof work.id==='string'&&Number.isSafeInteger(work.revision)&&work.revision>=0,'PDF_WORKSPACE','Provide the complete reviewed PDF working copy');
 need(input.bytes.subarray(0,1024).includes(Buffer.from('%PDF-')),'PDF_HEADER','The source bytes are not a PDF');
 need(input.bytes.length===work.file?.bytes&&hash(input.bytes)===work.file.sha256,'PDF_HASH','The actual original PDF differs from the selected working copy');
 need(work.file.dataBase64===undefined,'PDF_DUPLICATE_BYTES','Keep original PDF bytes in source.file; the mapping holds its identity');
 validateExtraction(work.extraction);
 need(hash(canonical(work.extraction))===work.extractionSha256,'PDF_EXTRACTION_HASH','The retained original page extraction changed');
 for(const key of['accounts','regions','rows','balances','pageReviews','history','bankImports'])need(Array.isArray(work[key]),'PDF_WORKSPACE','Retain the complete '+key+' collection');
 need(work.rows.length<=PDF_LIMITS.rows&&work.history.length===work.revision&&work.history.every((row,index)=>row.revision===index+1),'PDF_HISTORY','Retain complete ordered interpretation history');
 for(const key of['accounts','regions','rows','balances']){
  const ids=new Set();for(const row of work[key]){need(typeof row.id==='string'&&row.id.length>0&&row.id.length<=160&&!ids.has(row.id),'PDF_ID','Retain distinct stable '+key+' IDs');ids.add(row.id);}
 }
 for(const row of[...work.rows,...work.balances]){
  const source=row.source,page=work.extraction.pages.find(p=>p.number===source?.page);
  need(page&&source.pdfSha256===work.file.sha256&&source.extractionSha256===work.extractionSha256,'PDF_SOURCE_BINDING','Every mapped value must retain this original PDF and extraction');
  need(Array.isArray(source.box)&&source.box.length===4&&source.box.every(Number.isFinite)&&source.box[0]>=0&&source.box[1]>=0&&source.box[2]>source.box[0]&&source.box[3]>source.box[1]&&source.box[2]<=page.width+.1&&source.box[3]<=page.height+.1,'PDF_REGION','Mapped value must retain an original page rectangle');
  need(source.text===sourceText(work,source),'PDF_SOURCE_TEXT','Retained original text differs from its page item references');
 }
 const draft=bankSourceDraft(work,selection.accountId,{acknowledgeBalanceDifference:selection.acknowledgeBalanceDifference===true});
 const csvSha256=hash(draft.source.file.content),mappingSha256=hash(canonical(draft.mapping));
 need(csvSha256===selection.csvSha256&&mappingSha256===selection.mappingSha256,'PDF_MAPPING_CHANGED','Preview the exact complete page interpretation before receiving it');
 const parsed=readCsv(draft.source),statement=parsed.statements[0];
 need(parsed.statements.length===1,'PDF_ACCOUNT','Review one explicit PDF account at a time');
 const stableId=(kind,id)=>hash(canonical({pdf:input.file.sha256,account:statement.account.identitySha256,kind,id}));
 const originals=new Map(work.rows.map(row=>[row.id,row])),balances=new Map(work.balances.map(row=>[row.id,row]));
 const byRecord=new Map(draft.rowMap.map(row=>[row.recordNumber,row]));
 function location(csvSource){
  const mapping=byRecord.get(csvSource.recordNumber);need(mapping,'PDF_SOURCE_RECORD','Generated CSV record has no original page mapping');
  const source=copy(mapping.source);
  return{pointer:'/pdf/accounts/'+encodeURIComponent(draft.accountId)+'/'+(mapping.rowId?'rows/':'balances/')+encodeURIComponent(mapping.rowId||mapping.balanceId),
   pointerSyntax:'PDF_REVIEW_ROW',pdfSha256:input.file.sha256,page:source.page,box:source.box,itemIds:source.itemIds,
   extractionSha256:work.extractionSha256,raw:source.text,derivedCsv:{sha256:csvSha256,...copy(csvSource)}};
 }
 statement.id=stableId('STATEMENT','account');statement.kind='PDF_REVIEWED_CASH';
 statement.source={pointer:'/pdf/accounts/'+encodeURIComponent(draft.accountId),pointerSyntax:'PDF_REVIEW_ACCOUNT',pdfSha256:input.file.sha256,extractionSha256:work.extractionSha256};
 statement.account.source=copy(statement.source);
 statement.period={...statement.period,kind:'OPERATOR_REVIEWED_STATEMENT',from:draft.review.account.from,until:draft.review.account.until};
 for(const row of statement.rows){
  const mapping=byRecord.get(row.source.recordNumber),original=originals.get(mapping?.rowId);
  need(original,'PDF_SOURCE_ROW','Generated cash row lacks its original mapping');
  row.id=stableId('ROW',{page:original.source.page,itemIds:[...original.source.itemIds].sort(),...(original.source.itemIds.length?{}:{box:original.source.box})});row.source=location(row.source);row.original={...row.original,pdfRow:copy(original),generatedCsvSha256:csvSha256};
  if(row.runningBalance)row.runningBalance.source=copy(row.source);
  row.issues=row.issues.map(issue=>({...issue,source:copy(row.source)}));
 }
 for(const balance of statement.balances.sourceBalances){const mapped=byRecord.get(balance.source.recordNumber);balance.source=location(balance.source);balance.original={...balance.original,pdfBalance:copy(balances.get(mapped?.balanceId)??null)};}
 const selected=statement.balances.sourceBalances;
 for(const close of statement.balances.closing){
  close.id=stableId('CLOSING',{opening:draft.review.opening.source,closing:draft.review.closing.source});
  close.kind='PDF_REVIEWED_BALANCES';close.opening=copy(selected.find(x=>x.kind==='OPENING'));close.closing=copy(selected.find(x=>x.kind==='CLOSING'));
  close.source={pointer:'/pdf/accounts/'+encodeURIComponent(draft.accountId)+'/balance-pair',pointerSyntax:'PDF_REVIEW_BALANCE_PAIR',opening:copy(close.opening.source),closing:copy(close.closing.source)};
  close.original={opening:copy(draft.review.opening),closing:copy(draft.review.closing)};
  // The Bank retains and displays the original mismatch. Its close preview still
  // independently requires actual postings and the exact selected balances.
 }
 statement.excludedRows=work.rows.filter(row=>row.accountId===draft.accountId&&row.decision==='EXCLUDE').map(row=>({
  reason:row.note,operatorSelected:true,source:{...copy(row.source),pointer:'/pdf/accounts/'+encodeURIComponent(draft.accountId)+'/rows/'+encodeURIComponent(row.id),pointerSyntax:'PDF_REVIEW_ROW',raw:row.source.text},original:{pdfRow:copy(row)}}));
 const issues=[...parsed.issues,...draft.review.problems.map(problem=>({code:problem.code,message:problem.message,severity:'WARNING',source:copy(statement.source),details:copy(problem)}))];
 return{schema:parsed.schema,format:'PDF_REVIEW',file:{...input.file,type:'application/pdf',textEncoding:null},bytes:input.bytes,
  interpretation:{...parsed.interpretation,textEncoding:null,sourceFormat:'PDF_REVIEW',sourceOffsets:'ORIGINAL_PDF_PAGE_GEOMETRY_AND_TEXT_ITEMS',
   automaticTextRecognition:false,automaticCashInference:false,operatorReviewed:true,csvSha256,mappingSha256,extractionSha256:work.extractionSha256,workingCopyId:work.id,workingRevision:work.revision},
  statements:[statement],issues,csv:parsed.csv,
  pdfReview:{schema:'stellar-forge.bank-pdf-retained-review.v1',accountId:draft.accountId,workingCopy:copy(work),csv:{file:copy(draft.source.file),sha256:csvSha256,configuration:copy(draft.source.csv)},
   rowMap:copy(draft.rowMap),review:copy(draft.review),mappingSha256,acknowledgeBalanceDifference:selection.acknowledgeBalanceDifference===true}};
}
