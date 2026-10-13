// MIT. Native Bank reconciliation metadata; parser and financial validation remain original.
const P='merchant_accounting_bank_statements_';
const text=(max,min=0)=>({type:'string',minLength:min,maxLength:max});
const uuid={type:'string',pattern:'^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$'};
const hash={type:'string',pattern:'^[0-9a-f]{64}$'};
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
const stable={type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'};
const obj=(properties={},required=[],additionalProperties=false)=>({type:'object',properties,required,additionalProperties});
const array=(items,maxItems)=>({type:'array',items,maxItems});
const original=obj({},[],true);
const currency=obj({code:text(12,1),scale:{type:'integer',minimum:0,maximum:18}},['code','scale']);
const base={workspace:alias},revision={type:'integer',minimum:1};
const change={...base,workspaceId:uuid,revision,requestId:stable,actor:text(1000,1)};
const required=['workspace','workspaceId','revision','requestId','actor'];
const paging={offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:500}};
const date={type:'string',pattern:'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'};
const amount={type:'string',maxLength:256,pattern:'^-?(0|[1-9][0-9]*)(?:[.][0-9]+)?$'};
const close={accountId:uuid,from:date,until:date,openingBalance:amount,closingBalance:amount,balanceNote:text(4000),sourceClosing:original,periodCloseId:uuid};
const closeRequired=['accountId','from','until','openingBalance','closingBalance'];
const read=(name,description,properties={},needs=[])=>[P+name,description,{...base,...properties},['workspace',...needs],{readOnly:true,idempotent:true}];
const mutate=(name,description,properties,needs)=>[P+name,description,{...change,...properties},[...required,...needs],{idempotent:true}];
export const bankStatementsFileSelectors=Object.freeze(['bankStatementImportId','bankStatementCloseId']);
export const bankStatementsDefinitions=[
 read('status','Read the original Bank reconciliation summary or page every saved account, import, close, reopening, customer, period close or complete bank operation history. This is the existing accounting workspace.',{view:{type:'string',enum:['summary','accounts','imports','closes','reopenings','customers','periodCloses','history']},accountId:uuid,search:text(300),...paging}),
 read('source_preview','Inspect complete original CSV/OFX/QFX/CAMT bytes and explicit interpretation through the maintained parser. A declared receivablesInputs sourceAlias resolves once into returned sourceInput; retain those exact bytes for source_import.',{source:original,sourceAlias:alias},['source']),
 mutate('account_save','Bind one original bank source account and exact currency to the existing ledger. Retain request identity before dispatch.',{account:obj({name:text(160,1),currency,sourceIdentitySha256:hash,sourceIdentity:original,note:text(4000)},['name','currency','sourceIdentitySha256'])},['account']),
 mutate('source_import','Receive one reviewed original source statement and interpretation. Keep the returned sourceInput, reviewSha256, actual workspace UUID and chosen statement/account. No live aliases on mutations.',{accountId:uuid,statementId:text(240,1),source:original,reviewSha256:hash,supersedesImportId:uuid,receiptIntakeAccountId:uuid},['accountId','statementId','source','reviewSha256']),
 read('transactions','Page all original physical bank transactions, matching and source-review dispositions at one revision.',{accountId:uuid,status:text(40),search:text(300),...paging}),
 read('transaction','Read the complete original transaction, source copies, exact matching candidates, receipts/refunds and invoices.',{bankTransactionId:uuid},['bankTransactionId']),
 read('import','Read complete retained import and parsed source report with original-file selectors; no original rows are truncated.',{bankStatementImportId:uuid},['bankStatementImportId']),
 mutate('match','Match a resolved bank transaction to complete native receipt/refund/fee/income/expense/transfer/capital postings. Original amounts and bank coverage remain authoritative.',{bankTransactionId:uuid,parts:array(original,50000),reason:text(4000,1)},['bankTransactionId','parts','reason']),
 mutate('receipt','Receive one original bank credit as native customer cash with explicit gross/fee amounts and optional invoice allocation. Existing customer receipt/source checks remain authoritative.',{bankTransactionId:uuid,customerId:uuid,grossAmount:amount,feeAmount:amount,reference:text(300),note:text(4000),reason:text(4000,1),feeNote:text(3000),feeLedgerCode:text(240),invoiceId:uuid,allocationAmount:amount,allocatedDate:date},['bankTransactionId','customerId','grossAmount','reason']),
 mutate('undo','Undo the selected original match with a retained reason; original receipts and their financial history remain.',{bankTransactionId:uuid,reason:text(4000,1)},['bankTransactionId','reason']),
 mutate('resolve','Apply the original explicit source review: distinct payment, duplicate link, correction, reviewed foreign-currency valuation or incomplete-row exclusion.',{bankTransactionId:uuid,action:{type:'string',enum:['ACCEPT_DISTINCT','LINK_DUPLICATE','APPLY_CORRECTION','VALUE','EXCLUDE']},targetId:uuid,accountAmount:amount,reason:text(4000,1)},['bankTransactionId','action','reason']),
 read('assembly_preview','Review all retained CAMT pages through original page completeness, sequence, balance and source checks. Keep full sourceClosing for the close preview.',{accountId:uuid,importIds:array(uuid,1000),groupingNote:text(4000),summaryScope:{type:'string',enum:['STATEMENT','PAGE']}},['accountId','importIds']),
 read('close_preview','Review the complete original account period and balanced postings. Preserve full selection, actual revision and reviewSha256 before close.',close,closeRequired),
 mutate('close','Retain the exact reviewed balanced account close, original statement/customer source and complete export files. Reconcile the same request after a lost response.',{...close,name:text(160,1),note:text(4000),reviewSha256:hash},[...closeRequired,'name','reviewSha256']),
 read('close_detail','Read an original frozen close beside current changes and its complete file inventory/account.tar. The selected close archive is separate from whole-accounting-workspace backup.',{bankStatementCloseId:uuid},['bankStatementCloseId']),
 mutate('reopen','Reopen the selected original close through its native retained reason/history. Preserve all earlier closing files.',{bankStatementCloseId:uuid,reason:text(4000,1)},['bankStatementCloseId','reason']),
 read('request_lookup','Recover the original bank mutation by its stable requestId. Returns original action/intent/actor and native resulting records, or found:false. Uses the same accounting journal.',{requestId:stable},['requestId'])
];
