#!/usr/bin/env node
// MIT. One finite fictional worksheet/source/merge/native-plan/return journey.
// No provider, listener, buyer workspace or existing financial operation is opened.
import assert from 'node:assert/strict';
import {mkdir,open,lstat,link,rm,readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createBuyerHandoff} from '../../accountant/buyer-source.mjs';
import {normalizeQboCompany} from '../../accountant/qbo-company.mjs';
import {qboBuyerRows} from '../../accountant/qbo-buyer.mjs';
import {createQboPlan,qboHash as hash,qboCanonical as canonical,renderQboReview} from '../../accountant/qbo.mjs';
import {parseReturnCsv,renderCsv,accountantColumns,importReturn} from '../../accountant/engine.mjs';
import {createQboWorksheet,openQboWorksheet,inspectQboWorksheet,qboWorksheetSelections,QBO_WORKSHEET_COLUMNS} from '../../accountant/qbo-worksheet.mjs';

const output=resolve(process.argv[2]??'');
assert(process.argv.length===3,'Usage: node workspace/examples/qbo-worksheet-receiving.mjs /private/new-output');
await mkdir(output,{recursive:true,mode:0o700});const info=await lstat(output);
assert(info.isDirectory()&&!info.isSymbolicLink()&&!(info.mode&0o077),'Use a private original receiving output directory.');
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
async function retain(name,value){
  const bytes=Buffer.isBuffer(value)?value:typeof value==='string'?Buffer.from(value):json(value),path=join(output,name);
  const temporary=join(output,'.'+name+'.'+randomUUID()+'.pending'),file=await open(temporary,'wx',0o600);
  try{
    try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
    try{await link(temporary,path);}catch(error){if(error.code!=='EEXIST')throw error;assert.deepEqual(await readFile(path),bytes,'Keep an existing different receiving file: '+name);}
    const directory=await open(output,constants.O_RDONLY);try{await directory.sync();}finally{await directory.close();}
    assert.deepEqual(await readFile(path),bytes);return {name,bytes:bytes.length,sha256:hash(bytes)};
  }finally{await rm(temporary,{force:true});}
}
const at='2026-10-12T12:00:00.000Z',stamp='2026-10-12',uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const allocation=(item,amount,extra={})=>({
  item_id:'fictional-'+item,coding_id:'coding-'+item,source_id:'fictional-source',source_capture:'fictional-capture',
  center_id:'center-'+item,center_code:item==='one'?'0000000000000001':'OPS',center_name:'Fictional operations',
  source_name:'Fictional source — quotes "and", commas',source_kind:'FICTIONAL_RECEIVING',
  recognition_date:stamp,network:'stellar:testnet',asset:'native',amount,settled_actual:amount,
  project:'Worksheet receiving',account_code:'6000',line:1,data_context:'development',...extra
});
const expenses=[allocation('one','9007199254740993'),allocation('two','8000000'),allocation('zero','0'),allocation('omitted','7000000')];
const credits=[allocation('credit','900000',{credit_id:'fictional-credit',native_return:'900000'})];
const totals=rows=>[{network:'stellar:testnet',asset:'native',amount:rows.reduce((sum,row)=>sum+BigInt(row.amount),0n).toString(),lines:rows.length}];
const issued={
  schema:'stellar-forge.buyer-accountant-source.v1',workspaceId:'fictional-worksheet-buyer',
  issued:{schema:'stellar-forge.buyer-expense-period.v1',id:'fictional-close',status:'CLOSED',ready:true,unresolved:0,
    period:{id:'fictional-period',state:'CLOSED',latest_close:'fictional-close',from_day:stamp,through_day:stamp},
    review:{decision:'READY',actor:'fictional-reviewer'},sequence:1,context_sha256:hash('fictional context'),created_at:at,
    data_context:'development',allocations:expenses,credit_allocations:credits,totals:totals(expenses),credit_totals:totals(credits)}
};
const rawIssued=json(issued),handoff=createBuyerHandoff({buyerSourceBytes:rawIssued,name:'Fictional worksheet receiving',actor:'fixture-operator',id:uuid(1),createdAt:at});
const company=normalizeQboCompany({realmId:'12345678901234567890',
  companyInfo:{CompanyInfo:{CompanyName:'Fictional worksheet company'}},
  preferences:{Preferences:{CurrencyPrefs:{MultiCurrencyEnabled:false,HomeCurrency:{value:'USD'}}}},
  accounts:{QueryResponse:{Account:[
    {Id:'10',Name:'Fictional expense',Active:true,AccountType:'Expense',CurrencyRef:{value:'USD'}},
    {Id:'20',Name:'Fictional cash',Active:true,AccountType:'Bank',CurrencyRef:{value:'USD'}},
    {Id:'30',Name:'Inactive fixture',Active:false,AccountType:'Expense',CurrencyRef:{value:'USD'}}
  ]}}
});
const sourceBefore=canonical(handoff),source=qboBuyerRows(handoff),ids=source.map(row=>row.rowId),byItem=new Map(source.map(row=>[row.itemId,row.rowId]));
const one=byItem.get('fictional-one'),two=byItem.get('fictional-two'),zero=byItem.get('fictional-zero'),omitted=byItem.get('fictional-omitted'),credit=byItem.get('fictional-credit');
const blank=row=>({rowId:row.rowId,decision:'pending',amount:'',debitAccountId:'',creditAccountId:'',valuationNote:'',reason:'',description:''});
const base={valuationBasis:'Original fictional base',rows:source.map(blank)};
Object.assign(base.rows.find(row=>row.rowId===two),{decision:'include',amount:'12.34',debitAccountId:'10',creditAccountId:'20',
  valuationNote:'Original value',description:'Original description'});
for(const id of [zero,omitted])Object.assign(base.rows.find(row=>row.rowId===id),{decision:'exclude',reason:id===zero?'Zero original native units.':'Outside this fictional journal.'});
const context={handoff,revision:null,workspaceBinding:{workspaceId:hash('fictional original workspace'),sourcesSha256:hash('fictional original sources')},
  companySnapshot:company,environment:'sandbox'};
const exported=createQboWorksheet({...context,id:uuid(2),createdAt:at,draft:base});
assert.equal(openQboWorksheet({...context,worksheet:exported.worksheet}).csvText,exported.csvText);
assert(exported.csvText.includes("'9007199254740993"),'Long native units remain protected exact text.');
assert.equal(exported.accountReference.csvSha256,hash(exported.accountReference.csvText));
assert(exported.accountReference.csvText.includes('INACTIVE'), 'Original account exclusions remain visible in the reference.');
const quote=value=>'"'+String(value).replace(/"/g,'""')+'"';
function editCsv(text,columns,work){
  const parsed=parseReturnCsv(text,{columns}),rows=parsed.records.map(record=>Object.fromEntries(parsed.headers.map((key,index)=>[key,record.values[index]])));
  const changed=work(rows)??rows;
  return parsed.headers.map(quote).join(',')+'\r\n'+changed.map(row=>parsed.headers.map(key=>quote(row[key]??'')).join(',')).join('\r\n')+'\r\n';
}
const edited=editCsv(exported.csvText,QBO_WORKSHEET_COLUMNS,rows=>{
  Object.assign(rows.find(row=>row.rowType==='JOURNAL'),{valuationBasis:'Returned fictional basis\nQuotes "kept", exact values.'});
  Object.assign(rows.find(row=>row.rowId===one),{decision:'include',amount:'42.17',debitAccountId:'10',creditAccountId:'20',
    valuationNote:'Fictional source value — original units remain separate.',description:"'=literal text"});
  Object.assign(rows.find(row=>row.rowId===two),{amount:'15.01',valuationNote:'Returned individual note'});
  Object.assign(rows.find(row=>row.rowId===credit),{decision:'include',amount:'3.21',debitAccountId:'20',creditAccountId:'10',
    valuationNote:'Fictional credit value',description:'Explicit credit direction'});
  return rows.reverse();
});
const current=structuredClone(base);current.valuationBasis='Later local basis';
Object.assign(current.rows.find(row=>row.rowId===two),{amount:'18.00',description:'Later local description'});
const inspect=(csvBytes=edited,currentDraft=current,resolutions=[])=>inspectQboWorksheet({...context,worksheet:exported.worksheet,csvBytes,currentDraft,resolutions});
const unchanged=inspect(exported.csvText,base);
assert.equal(unchanged.readyToAdopt,true);assert.equal(unchanged.readyForPlan,false);assert.equal(unchanged.changes.length,0);
const preview=inspect();assert.equal(preview.conflicts.length,2);assert.equal(preview.readyToAdopt,false);
assert.equal(preview.candidate.rows.find(row=>row.rowId===two).description,'Later local description');
const resolutions=preview.conflicts.map(row=>({id:row.id,choice:row.field==='amount'?'current':'returned'}));
const reviewed=inspect(edited,current,resolutions);assert.equal(reviewed.readyToAdopt,true);assert.equal(reviewed.readyForPlan,true);
assert.equal(reviewed.integrity.sha256,inspect(edited,current,resolutions).integrity.sha256);
assert.equal(reviewed.candidate.rows.find(row=>row.rowId===two).amount,'18.00');
assert.equal(reviewed.candidate.rows.find(row=>row.rowId===one).description,'=literal text');
assert.equal(reviewed.candidate.rows.find(row=>row.rowId===zero).decision,'exclude');
assert.equal(reviewed.candidate.rows.find(row=>row.rowId===omitted).reason,'Outside this fictional journal.');
const editedWithBom=Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(edited,'utf8')]);
const bomReviewed=inspect(editedWithBom,current,resolutions);
assert.deepEqual(bomReviewed.candidate,reviewed.candidate);
assert.equal(bomReviewed.csv.sha256,hash(editedWithBom));assert.equal(bomReviewed.csv.bytes,editedWithBom.length);
const selected=qboWorksheetSelections(reviewed.candidate);
const plan=createQboPlan({...selected,id:uuid(3),createdAt:at,name:'Fictional worksheet journal',actor:'fixture-operator',
  handoff,revision:null,handoffId:handoff.id,expectedParentId:null,realmId:company.realmId,companyName:company.companyName,
  baseCurrency:company.baseCurrency,companySnapshot:company,environment:'sandbox',txnDate:stamp});
assert.equal(plan.rows.length,3);assert.equal(plan.excluded.length,2);
const creditRow=plan.rows.find(row=>row.rowId===credit);assert.equal(creditRow.kind,'BUYER_CREDIT');
assert.equal(creditRow.debitAccount.value,'20');assert.equal(creditRow.creditAccount.value,'10');
assert.equal(sourceBefore,canonical(handoff),'Worksheet work does not change its original handoff.');
const malformed={};
for(const [name,change]of [
  ['missing',rows=>rows.filter(row=>row.rowId!==one)],
  ['duplicate',rows=>[...rows,structuredClone(rows.find(row=>row.rowId===one))]],
  ['native_units_changed',rows=>{rows.find(row=>row.rowId===one).nativeAmountAtomic='9007199254740992';return rows;}]
]){
  const result=inspect(editCsv(edited,QBO_WORKSHEET_COLUMNS,change),current);
  assert.equal(result.candidate,null);assert.equal(result.readyToAdopt,false);malformed[name]=result.sourceIssues;
}
assert.throws(()=>inspect(edited,current,[{id:hash('another conflict'),choice:'returned'}]),error=>error.code==='QBO_WORKSHEET_RESOLUTIONS_CHANGED');
const zeroCandidate=structuredClone(reviewed.candidate);
Object.assign(zeroCandidate.rows.find(row=>row.rowId===zero),{decision:'include',amount:'1.00',debitAccountId:'10',creditAccountId:'20',valuationNote:'Would be unsupported'});
const zeroBase=createQboWorksheet({...context,id:uuid(4),createdAt:at,draft:zeroCandidate});
const zeroReview=inspectQboWorksheet({...context,worksheet:zeroBase.worksheet,csvBytes:zeroBase.csvText,currentDraft:zeroCandidate});
assert.equal(zeroReview.readyToAdopt,true);assert.equal(zeroReview.readyForPlan,false);
assert(zeroReview.draftIssues.some(row=>row.code==='QBO_ZERO_BUYER_ALLOCATION'));
const prod=createQboWorksheet({...context,environment:'production',id:uuid(5),createdAt:at,draft:reviewed.candidate});
const prodReview=inspectQboWorksheet({...context,environment:'production',worksheet:prod.worksheet,csvBytes:prod.csvText,currentDraft:reviewed.candidate});
assert(prodReview.draftIssues.some(row=>row.code==='QBO_PRODUCTION_BUYER_SOURCE_REQUIRED'));
assert.throws(()=>openQboWorksheet({...context,workspaceBinding:{...context.workspaceBinding,workspaceId:hash('other')},worksheet:exported.worksheet}),
  error=>error.code==='QBO_WORKSHEET_SOURCE_CHANGED');
const accountantCsv=renderCsv(handoff).toString('utf8');
const returnedCsv=editCsv(accountantCsv,accountantColumns(handoff),rows=>{
  for(const row of rows)if(plan.rows.some(item=>item.rowId===row.rowId)){row.externalStatus='BOOKED';row.externalBookRef='FICTIONAL-QBO-RECEIPT';row.externalAccountCode='fictional accounts';row.externalNote='Fixture return only; no provider called.';}
  return rows;
});
const accountantReturn=importReturn({handoff,csvBytes:returnedCsv,actor:'fixture-accountant',name:'Fictional received return',createdAt:at,id:uuid(6)});
assert.throws(()=>openQboWorksheet({...context,revision:accountantReturn,worksheet:exported.worksheet}),
  error=>error.code==='QBO_WORKSHEET_SOURCE_CHANGED');
const files=[];
for(const [name,value] of Object.entries({
  'fictional-issued-source.json':rawIssued,'original-handoff.json':handoff,'company.json':company,'worksheet.json':exported.worksheet,
  'original.csv':exported.csvText,'account-reference.csv':exported.accountReference.csvText,'edited.csv':edited,'edited-with-bom.csv':editedWithBom,'bom-reviewed-preview.json':bomReviewed,'current-draft.json':current,'unresolved-preview.json':preview,
  'resolutions.json':resolutions,'reviewed-preview.json':reviewed,'native-plan.json':plan,'native-review.html':renderQboReview(plan),
  'original-accountant.csv':accountantCsv,'returned-accountant.csv':returnedCsv,'accountant-return.json':accountantReturn,
  'source-coverage-results.json':malformed
}))files.push(await retain(name,value));
const reopened=JSON.parse(await readFile(join(output,'worksheet.json'),'utf8'));
assert.equal(openQboWorksheet({...context,worksheet:reopened}).csvText,await readFile(join(output,'original.csv'),'utf8'));
assert.equal(inspectQboWorksheet({...context,worksheet:reopened,csvBytes:await readFile(join(output,'edited.csv')),
  currentDraft:JSON.parse(await readFile(join(output,'current-draft.json'),'utf8')),
  resolutions:JSON.parse(await readFile(join(output,'resolutions.json'),'utf8'))}).integrity.sha256,reviewed.integrity.sha256);
assert.deepEqual(JSON.parse(await readFile(join(output,'original-handoff.json'),'utf8')),handoff);
const result={schema:'stellar-forge.qbo-worksheet-receiving.v1',fixture:true,providerCalls:0,financialWorkspaceOpened:false,
  handoffId:handoff.id,worksheetId:exported.worksheet.id,sourceAllocations:source.length,conflictsReviewed:preview.conflicts.length,
  nativePlan:{id:plan.id,sha256:plan.integrity.sha256,included:plan.rows.length,excluded:plan.excluded.length},
  inspectionSha256:reviewed.integrity.sha256,accountantReturnId:accountantReturn.id,
  outcomes:['exact native-unit text','original company account reference','BOM bytes retained in returned-file hash','same worksheet replay','field-level local edits retained','explicit conflicting amount and basis decisions',
    'reasoned exclusions and zero units preserved','native expense and credit plan','all-or-nothing source coverage','stale conflict rejected',
    'original zero/production source gates','changed workspace and accountant parent rejected','complete files reopened'],
  files};
await retain('RESULT.json',result);process.stdout.write(JSON.stringify(result)+'\n');
