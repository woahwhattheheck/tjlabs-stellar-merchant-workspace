// One complete recipient-review model course, composed with the original Statements receiving.
export function exerciseStatementRecipientReview({review,copies,source,caseId,invoiceId,current,preview,at='2026-10-13T12:00:00.000Z'}){
  const clone=value=>structuredClone(value),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const require=(ok,message)=>{if(!ok)throw new Error(message);};
  const rejects=(work,label)=>{let message='';try{work();}catch(error){message=String(error.message||error);}require(message,label+' must reject before changing the draft.');return message;};
  require(source.filename==='operating-october.csv'&&source.contentBase64,'Use the complete original October CSV.');
  require(current.program.id===caseId&&preview.caseId===caseId&&preview.expectedVersion===current.program.version,'Use the original case and its actual preview.');
  require(current.records.invoices.some(value=>value.id===invoiceId),'Use the original retained 250 USD supplier invoice.');
  require(preview.rows.length===3&&[2,3,4].every(n=>preview.rows.some(row=>row.rowNumber===n)),'Use all three original CSV source rows.');
  const draft={schema:'sf47.statement-draft.v1',caseId,inputs:{
    sourceFormat:'CSV',source:clone(source),accountId:'operating-usd',accountLabel:'Operating USD',currency:'USD',
    format:{delimiter:',',decimalMark:'.',groupMark:'',dateFormat:'YYYY-MM-DD',amountMode:'DEBIT_CREDIT',positiveDirection:'IN'},
    columns:{date:'Date',reference:'Reference',description:'Description',debit:'Debit',credit:'Credit',currency:'Currency'},
    defaultCategory:'OTHER',openingBalance:'100.00',closingBalance:'1100.00',decisions:[]},
    headers:['Date','Reference','Description','Debit','Credit','Currency'],inspection:null,nativeScalesText:'USD: 2',
    preview:clone(preview),dirty:false,pending:null,accepted:null,setupPending:null,allocationWorks:{},
    lastReceipt:null,originalInputHandoff:null};
  const saved=copies.prepareStatementCopySave(copies.statementCopyIndex(caseId),{
    expectedRevision:0,id:'statement-copy-recipient-course-original',name:'Original October recipient review',
    note:'Complete original source and current preview before finance recommendations.',savedAt:at,draft});
  const edition=saved.edition,unchangedEdition=clone(edition);
  const packet=review.prepareStatementRecipientPacket(edition,current,{
    id:'statement-review-original-finance-course',recipient:{name:'Original programme finance reviewer',role:'Finance'},
    issuedBy:{name:'Original Statements operator',id:'original-receiving-course'},issuedAt:at});
  const recommendations=[
    {rowNumber:2,action:'IMPORT',category:'GRANT',tranche:1,reason:'Reviewed the original grant receipt.',allocations:[]},
    {rowNumber:3,action:'IMPORT',category:'INVOICE',tranche:null,reason:'Reviewed the original supplier invoice and statement movement.',allocations:[{invoiceId,amountUsd:'250.00'}]},
    {rowNumber:4,action:'IMPORT',category:'CUSTOMER',tranche:null,reason:'Reviewed the original customer receipt.',allocations:[]}];
  const returned=review.prepareStatementRecipientReturn(packet,{reviewer:{name:packet.recipient.name,role:packet.recipient.role,note:'Complete original three-row finance review.'},recommendations,returnedAt:at});
  const concurrent=clone(draft);concurrent.inputs.decisions=[{rowNumber:2,action:'IMPORT',category:'CAPITAL'}];
  concurrent.allocationWorks={'3':{rowNumber:3,basis:{caseId,originalRow:3},allocations:[{invoiceId,amountUsd:'125.00'}],reason:'Retained unfinished original partial allocation.',proposal:{state:'reviewed'}},
    '4':{rowNumber:4,basis:{caseId,originalRow:4},allocations:[],reason:'Unrelated current working note.',proposal:null}};
  const currentBefore=clone(concurrent),comparison=review.compareStatementRecipientReturn(packet,edition,concurrent,returned);
  require(comparison.fields.some(row=>row.key==='2:category'&&row.conflict),'Show the original OTHER, current CAPITAL and returned GRANT conflict.');
  const choices=Object.fromEntries(comparison.fields.map(row=>[row.key,'RETURNED']));
  const result=review.applyStatementRecipientReturn(packet,edition,concurrent,comparison,choices,{actor:'Original Statements operator',appliedAt:at});
  const decisions=new Map(result.draft.inputs.decisions.map(value=>[value.rowNumber,value]));
  require(decisions.get(2).category==='GRANT'&&decisions.get(2).tranche===1,'Receive the original tranche 1 grant classification.');
  require(decisions.get(3).category==='INVOICE'&&same(decisions.get(3).allocations,[{invoiceId,amountUsd:'250.00'}]),'Receive the exact original retained supplier allocation.');
  require(decisions.get(4).category==='CUSTOMER','Receive the original customer classification.');
  require(result.draft.dirty===true&&result.receipt.reviewer.name===packet.recipient.name,'Retain attribution and require native re-preview.');
  require(same(result.draft.inputs.source,draft.inputs.source)&&same(edition,unchangedEdition)&&same(concurrent,currentBefore),'Preserve original source, issued edition and current input objects.');
  require(same(result.draft.allocationWorks['3'].allocations,currentBefore.allocationWorks['3'].allocations)&&result.draft.allocationWorks['3'].proposal===null,'Preserve the unfinished allocation and invalidate its prior proposal.');
  require(same(result.draft.allocationWorks['4'].allocations,currentBefore.allocationWorks['4'].allocations),'Preserve unrelated current working values.');
  const fresh=copies.prepareStatementCopySave(saved.index,{expectedRevision:saved.index.revision,id:edition.id,name:edition.name,
    note:'Received original finance recommendations; native re-preview remains required.',savedAt:at,draft:result.draft});
  const archive=copies.prepareStatementCopyArchive({schema:'sf47.statement-working-copy-archive.v1',caseId,index:fresh.index,editions:[edition,fresh.edition]},caseId);
  require(same(archive.editions[0],edition)&&same(archive.editions[1].draft,result.draft),'The complete archive reopens the original edition and all returned decisions/history.');
  const altered=clone(concurrent);altered.inputs.source.contentBase64+='AA==';
  const changedSource=rejects(()=>review.compareStatementRecipientReturn(packet,edition,altered,returned),'Changed original statement bytes');
  const stale=clone(concurrent);stale.inputs.decisions[0].category='REFUND';
  const staleComparison=rejects(()=>review.applyStatementRecipientReturn(packet,edition,stale,comparison,choices,{actor:'Original Statements operator',appliedAt:at}),'Changed current draft');
  const pending=clone(concurrent);pending.pending={payload:{requestId:'retained-original-request'}};
  const pendingRequest=rejects(()=>review.compareStatementRecipientReturn(packet,edition,pending,returned),'Unresolved original native request');
  const trancheZero=clone(recommendations);trancheZero[0].tranche=0;
  const acceptedZero=review.prepareStatementRecipientReturn(packet,{reviewer:returned.reviewer,recommendations:trancheZero,returnedAt:at});
  require(acceptedZero.recommendations[0].tranche===0,'Preserve native-supported tranche 0.');
  const trancheFour=clone(recommendations);trancheFour[0].tranche=4;
  const rejectedFour=rejects(()=>review.prepareStatementRecipientReturn(packet,{reviewer:returned.reviewer,recommendations:trancheFour,returnedAt:at}),'Native-unsupported tranche 4');
  return {schema:'sf47.statement-recipient-model-course.v1',caseId,invoiceId,sourceFilename:source.filename,
    changedFields:comparison.fields.length,conflicts:comparison.fields.filter(row=>row.conflict).length,
    immutableEditions:archive.editions.length,completeResult:result,archive,
    rejections:{changedSource,staleComparison,pendingRequest,rejectedFour},acceptedNativeTrancheZero:true};
}
