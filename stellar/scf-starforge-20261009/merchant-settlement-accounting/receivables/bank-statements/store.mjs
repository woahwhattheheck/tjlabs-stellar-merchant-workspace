// SPDX-License-Identifier: MIT
// One original accounting lease, revision, request journal, receipt writer and allocation writer.
import {randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {open,mkdir,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {accountingWorkspaceBinding} from '../../workspace/binding.mjs';
import {need,plain,field,identifier,dateValue,currencyKey,minor,money,json,sha,customerExport,renderCustomerTar} from '../core.mjs';
import {readBankStatementSource} from './source.mjs';
import {BankReceiptsWorkspace} from '../bank-receipts-workspace.mjs';
import {normalizeBankAccount,bankAccountSummary,bankSourceMatches} from '../bank-receipts.mjs';
import {bindStatementIntakeAccount,statementSourceEntry,recordStatementCoverage,releaseStatementCoverage} from '../bank-coverage.mjs';
import {BANK_SCHEMA,BANK_CLOSE_SCHEMA,BANK_REQUEST_BYTES,BANK_SOURCE_BYTES,BANK_ROW_LIMIT,now,clone,
  emptyBank,bankData,record,activeMatch,activeCloses,assertOpenDate,amountOf,transactionIdentity,financialFingerprint,
  compactSourceRow,normalizeAccount,sourcePreview,previewIdentity,prepareMatch,matchView,matchSuggestions,
  accountSummary,importSummary,closePreview,closeDocuments} from './domain.mjs';
export {BANK_REQUEST_BYTES};

const EXT={OFX:'ofx',QFX:'qfx',CSV:'csv'};
const selectedFilters=query=>({accountId:query.accountId??'',status:query.status??'',search:String(query.search??'').toLowerCase().slice(0,300)});
async function privateDirectory(path) {
  await mkdir(path,{mode:0o700});
  const stat=await lstat(path);
  need(stat.isDirectory()&&!stat.isSymbolicLink()&&!(stat.mode&0o077)&&(!process.getuid||stat.uid===process.getuid()),
    'BANK_PRIVATE_DIRECTORY','Use the original private accounting directory without a symlink.',409);
}
async function ensureDirectory(path) {
  try{await privateDirectory(path);}catch(error){if(error?.code!=='EEXIST')throw error;
    const stat=await lstat(path);need(stat.isDirectory()&&!stat.isSymbolicLink()&&!(stat.mode&0o077)&&(!process.getuid||stat.uid===process.getuid()),
      'BANK_PRIVATE_DIRECTORY','The original bank file directory is no longer private.',409);}
}
async function syncDirectory(path) {
  const file=await open(path,constants.O_RDONLY|(constants.O_DIRECTORY??0)|(constants.O_NOFOLLOW??0));
  try{await file.sync();}finally{await file.close();}
}
async function writeFile(path,bytes) {
  const file=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
  try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
  return {bytes:bytes.length,sha256:sha(bytes)};
}
async function readFile(path,expected,maximum=128_000_000) {
  const file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
  try{const stat=await file.stat();
    need(stat.isFile()&&stat.nlink===1&&stat.size>0&&stat.size<=maximum&&!(stat.mode&0o077)&&
      (!process.getuid||stat.uid===process.getuid()),'BANK_FILE_CHANGED','The retained bank file is not an unchanged private regular file.',409);
    const bytes=await file.readFile();
    need(bytes.length===expected.bytes&&sha(bytes)===expected.sha256,'BANK_FILE_CHANGED',
      'The retained bank source or close differs from its saved bytes.',409);
    return bytes;
  }finally{await file.close();}
}
function sourceInput(value) {
  need(plain(value),'INVALID_BANK_SOURCE','Provide the original source file and its explicit format.');
  const report=readBankStatementSource(value);
  need(report.bytes.length<=BANK_SOURCE_BYTES,'BANK_SOURCE_TOO_LARGE','Choose an original statement up to 16 MB.',413);
  need(report.statements.reduce((sum,row)=>sum+row.rows.length+row.pendingRows.length,0)<=BANK_ROW_LIMIT,
    'BANK_SOURCE_ROW_LIMIT','Choose at most 50,000 original statement rows.',413);
  return report;
}
function pagination(query) {
  const offset=Number(query.offset??0),limit=Number(query.limit??100);
  need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=500,
    'INVALID_BANK_PAGE','Use a nonnegative offset and a page size from one to 500.');
  return {offset,limit};
}
export class BankStatementsWorkspace {
  constructor(receivables) {this.receivables=receivables;this.workspace=receivables.workspace;}
  async init() {
    await this.receivables.init();
    await this.workspace.serial(async()=>{
      if(this.receivables.data().bankStatements===undefined) {
        this.receivables.data().bankStatements=emptyBank();
        await this.workspace.commit('receivables_bank_initialized','workspace startup');
      }
      const data=this.receivables.data(),bank=bankData(data);
      let bound=false;
      for(const account of bank.accounts)if(!account.receiptIntakeAccountId) {
        const source=bank.imports.find(row=>row.accountId===account.id)?.sourceAccount;
        if(source){bindStatementIntakeAccount(data,account,source,'workspace startup',now(),normalizeBankAccount);bound=true;}
      }
      if(bound)await this.workspace.commit('receivables_bank_intake_accounts_bound','workspace startup');
    });
    return this;
  }
  data(){return bankData(this.receivables.data());}
  binding(){return accountingWorkspaceBinding(this.workspace.directory,this.workspace.state);}
  account(id){return record(this.data().accounts,id,'bank account');}
  transaction(id){return record(this.data().transactions,id,'bank transaction');}
  importRow(id){return record(this.data().imports,id,'statement import');}
  closeRow(id){return record(this.data().closes,id,'bank close');}
  async _directory(kind,id) {
    const root=join(this.workspace.directory,'bank-statements');
    await ensureDirectory(root);await ensureDirectory(join(root,kind));
    const path=join(root,kind,identifier(id,'bank file owner'));
    await ensureDirectory(path);return path;
  }
  _path(kind,id,name){identifier(id,'bank file owner');return join(this.workspace.directory,'bank-statements',kind,id,name);}
  _summary() {
    const bank=this.data(),binding=this.binding();
    return {schema:BANK_SCHEMA,revision:this.workspace.state.revision,workspaceId:binding.workspaceId,
      sourcesSha256:binding.sourcesSha256,accounts:bank.accounts.map(row=>accountSummary(bank,row)),
      receiptIntakeAccounts:(this.receivables.data().bankAccounts??[]).map(row=>({...bankAccountSummary(row),
        statementSourceIdentitySha256:row.statementSourceIdentitySha256??null,statementSourceIdentity:clone(row.statementSourceIdentity??null)})),
      imports:bank.imports.map(importSummary),closes:clone(bank.closes),reopenings:clone(bank.reopenings),
      customers:clone(this.workspace.state.customerStatements.customers),
      currencies:[...new Map(bank.accounts.map(row=>[currencyKey(row.currency),row.currency])).values()].map(clone),
      periodCloses:(this.workspace.state.periodCloses??[]).map(row=>({id:row.id,name:row.name,period:clone(row.period),
        runId:row.runId,exportId:row.exportId,createdAt:row.createdAt})),
      history:this.workspace.state.history.filter(row=>row.action.startsWith('receivables_bank_')).slice(-150).reverse()};
  }
  _reply(output) {
    const result=output.operation?.result??{},bank=this.data();
    return {...output,workspaceId:this.binding().workspaceId,
      ...(result.bankStatementAccountId?{account:accountSummary(bank,this.account(result.bankStatementAccountId))}:{}),
      ...(result.bankStatementImportId?{import:importSummary(this.importRow(result.bankStatementImportId))}:{}),
      ...(result.bankTransactionId?{transaction:matchView(bank,this.transaction(result.bankTransactionId))}:{}),
      ...(result.bankCloseId?{close:clone(this.closeRow(result.bankCloseId))}:{}),
      ...(result.bankReopeningId?{reopening:clone(bank.reopenings.find(row=>row.id===result.bankReopeningId))}:{}),
    };
  }
  async _mutate(action,value,work) {
    need(plain(value),'INVALID_BANK_REQUEST','Send one complete bank workspace request.');
    if(value.workspaceId!==undefined)need(value.workspaceId===this.binding().workspaceId,'BANK_WORKSPACE_CHANGED',
      'This request belongs to another accounting workspace.',409);
    const output=await this.receivables._mutate('bank_'+action,value,async(data,actor,requestId)=>{
      const result=await work(data,actor,requestId);
      need(Buffer.byteLength(json(this.workspace.state))<31_500_000,'BANK_REGISTER_CAPACITY',
        'The complete workspace is nearing its saved-state capacity. Retain the full account handover before creating another period.',413);
      return result;
    });
    return this._reply(output);
  }
  async state(){return this.workspace.serial(async()=>this._summary());}
  async getOperation(id) {
    return this.workspace.serial(async()=>{
      const operation=this.receivables.data().requests.find(row=>row.id===id&&row.action.startsWith('bank_'));
      need(operation,'BANK_OPERATION_NOT_FOUND','This bank operation has not been recorded.',404);
      return this._reply({...this.receivables._result(operation.result),operation:{...clone(operation),replayed:true}});
    });
  }
  async previewSource(value) {
    need(plain(value)&&plain(value.source),'INVALID_BANK_SOURCE','Select an original statement file.');
    const report=sourceInput(value.source);
    return {revision:this.workspace.state.revision,workspaceId:this.binding().workspaceId,
      ...sourcePreview(report),reviewSha256:previewIdentity(report,value.source)};
  }
  async saveAccount(value) {
    return this._mutate('account_saved',value,async(data,actor)=>{
      const bank=bankData(data),input=normalizeAccount(value.account);
      need(!bank.accounts.some(row=>row.sourceIdentitySha256===input.sourceIdentitySha256),
        'BANK_ACCOUNT_ALREADY_BOUND','This original bank account is already connected. Use its saved account.',409);
      const row={id:randomUUID(),...input,createdAt:now(),actor};bank.accounts.push(row);
      return {bankStatementAccountId:row.id};
    });
  }
  async receiveSource(value) {
    return this._mutate('source_received',value,async(data,actor,requestId)=>{
      const bank=bankData(data),account=this.account(value.accountId),report=sourceInput(value.source);
      need(value.reviewSha256===previewIdentity(report,value.source),'BANK_SOURCE_REVIEW_CHANGED',
        'Review this complete original file and mapping before receiving it.',409);
      const statement=report.statements.find(row=>row.id===value.statementId);
      need(statement,'BANK_SOURCE_ACCOUNT_REQUIRED','Select one original statement account from the preview.');
      need(statement.account.identitySha256===account.sourceIdentitySha256&&
        (!statement.account.currency||statement.account.currency===account.currency.code),'BANK_SOURCE_ACCOUNT_MISMATCH',
        'The selected original statement has a different account or currency.',409);
      bindStatementIntakeAccount(data,account,statement.account,actor,now(),normalizeBankAccount,value.receiptIntakeAccountId??null);
      const sameFile=bank.imports.filter(row=>row.accountId===account.id&&row.file.sha256===report.file.sha256&&row.statementId===statement.id);
      const identical=sameFile.find(row=>row.reviewSha256===value.reviewSha256);
      if(identical)return {bankStatementAccountId:account.id,bankStatementImportId:identical.id,existingImport:true};
      const prior=value.supersedesImportId?this.importRow(value.supersedesImportId):null;
      need(!sameFile.length||prior&&sameFile.some(row=>row.id===prior.id),'BANK_SOURCE_MAPPING_CHANGED',
        'Select the saved interpretation being corrected before receiving another mapping of this original file.',409);
      if(prior)need(prior.accountId===account.id&&prior.file.sha256===report.file.sha256,
        'BANK_INTERPRETATION_SOURCE','An interpretation correction must retain the same original bytes and bank account.',409);
      const priorRows=prior?prior.rowIds.map(id=>this.transaction(id)):[];
      need(bank.transactions.length+statement.rows.length<=BANK_ROW_LIMIT,'BANK_REGISTER_ROW_LIMIT',
        'This account workspace retains at most 50,000 bank transaction records.',413);
      const importId=randomUUID(),knownBefore=new Set(bank.transactions.map(row=>row.id)),rowIds=[];
      const imported={id:importId,accountId:account.id,statementId:statement.id,kind:statement.kind,
        file:clone(report.file),format:report.format,reviewSha256:value.reviewSha256,sourceAccount:clone(statement.account),
        interpretation:clone(report.interpretation),period:clone(statement.period),balances:clone(statement.balances),
        issues:clone([...report.issues,...statement.issues]),sourceSummary:clone(statement.summary),
        excludedRows:clone(statement.excludedRows),rowIds,pendingRows:statement.pendingRows.map(compactSourceRow),
        createdAt:now(),actor,requestId,supersedesImportId:prior?.id??null,files:{}};
      for(const source of statement.rows) {
        const compact=compactSourceRow(source);
        const row={...compact,sourceRowId:compact.id,id:randomUUID(),accountId:account.id,
          sourceStatus:source.status,sourceAmount:source.amount,
          sourceIdentity:transactionIdentity(source,account.id),financialSha256:financialFingerprint(source),
          copies:[{importId,sourceRowId:source.id,source:clone(compact.source)}],
          status:'POSTED',candidateIds:[],createdAt:now(),actor,history:[]};
        let valid=source.eligible&&source.status==='POSTED';
        try {
          dateValue(row.postedDate,'bank posted date');
          if(row.currency===account.currency.code)row.amount=money(minor(row.amount,account.currency,'source amount',{signed:true}),account.currency);
          else valid=false;
        }catch {valid=false;}
        row.financialSha256=financialFingerprint(row);
        const sameIdentity=row.sourceIdentity?bank.transactions.filter(item=>item.accountId===account.id&&
          item.sourceIdentity===row.sourceIdentity&&!['DUPLICATE','DELETED','SUPERSEDED','EXCLUDED'].includes(item.status)):[];
        const duplicate=sameIdentity.find(item=>item.financialSha256===row.financialSha256&&!row.correction&&item.status==='POSTED');
        const previousInterpretation=priorRows.find(item=>item.sourceRowId===row.sourceRowId);
        if(previousInterpretation&&previousInterpretation.financialSha256!==row.financialSha256 ||
          previousInterpretation&&['INVALID','FOREIGN_CURRENCY','CONFLICT'].includes(previousInterpretation.status)) {
          row.status='CORRECTION_REVIEW';row.interpretationReplacesId=previousInterpretation.id;
          row.interpretationAction='REPLACE';row.candidateIds=[previousInterpretation.id];
        } else if(row.correction) {
          row.status='CORRECTION_REVIEW';
          row.candidateIds=bank.transactions.filter(item=>item.accountId===account.id&&item.id!==row.id&&
            !['DUPLICATE','DELETED','SUPERSEDED','EXCLUDED'].includes(item.status)&&
            (row.correction.providerKey?item.providerKey===row.correction.providerKey:
              item.providerId===row.correction.providerId)).map(item=>item.id);
        } else if(duplicate&&row.postedDate&&row.amount!==null&&row.currency===account.currency.code) {
          row.status='DUPLICATE';row.duplicateOf=duplicate.id;
          duplicate.copies.push(...clone(row.copies));
          row.history.push({at:now(),actor,action:'native_identity_duplicate',targetId:duplicate.id});
        } else if(sameIdentity.length) {
          row.status='CONFLICT';row.candidateIds=sameIdentity.map(item=>item.id);
        } else if(!valid) {
          row.status=row.currency&&row.currency!==account.currency.code?'FOREIGN_CURRENCY':'INVALID';
        } else if(!row.providerKey) {
          row.candidateIds=bank.transactions.filter(item=>knownBefore.has(item.id)&&item.accountId===account.id&&
            item.financialSha256===row.financialSha256&&!['DUPLICATE','DELETED','SUPERSEDED','EXCLUDED'].includes(item.status)).map(item=>item.id);
          if(row.candidateIds.length)row.status='OVERLAP_REVIEW';
        }
        rowIds.push(row.id);bank.transactions.push(row);
      }
      // Removed or newly pending records in a revised mapping remain explicit reviewed removals.
      for(const previous of priorRows) if(!statement.rows.some(source=>source.id===previous.sourceRowId)&&
        !['SUPERSEDED','DELETED','EXCLUDED'].includes(previous.status)) {
        const removal={...clone(previous),id:randomUUID(),sourceRowId:previous.sourceRowId,
          status:'CORRECTION_REVIEW',interpretationReplacesId:previous.id,interpretationAction:'DELETE',
          correction:null,candidateIds:[previous.id],createdAt:now(),actor,history:[],
          copies:[{importId,sourceRowId:previous.sourceRowId,source:clone(previous.source)}]};
        delete removal.match;delete removal.duplicateOf;delete removal.supersedesId;delete removal.correctedBy;
        bank.transactions.push(removal);rowIds.push(removal.id);
      }
      const directory=await this._directory('imports',importId);
      const originalName='original.'+EXT[report.format];
      imported.files.original={name:originalName,type:report.file.type,...await writeFile(join(directory,originalName),report.bytes)};
      const parsed={...report};delete parsed.bytes;
      imported.files['parsed.json']={name:'parsed.json',type:'application/json',
        ...await writeFile(join(directory,'parsed.json'),Buffer.from(json(parsed)))};
      await syncDirectory(directory);
      bank.imports.push(imported);
      return {bankStatementAccountId:account.id,bankStatementImportId:importId};
    });
  }
  async transactions(query={}) {
    return this.workspace.serial(async()=>{
      const bank=this.data(),{offset,limit}=pagination(query),filter=selectedFilters(query);
      if(filter.accountId)this.account(filter.accountId);
      let rows=bank.transactions.filter(row=>(!filter.accountId||row.accountId===filter.accountId));
      if(filter.status==='UNMATCHED')rows=rows.filter(row=>row.status==='POSTED'&&!activeMatch(bank,row.id));
      else if(filter.status==='MATCHED')rows=rows.filter(row=>Boolean(activeMatch(bank,row.id)));
      else if(filter.status==='REVIEW')rows=rows.filter(row=>['OVERLAP_REVIEW','CONFLICT','CORRECTION_REVIEW','INVALID','FOREIGN_CURRENCY'].includes(row.status));
      else if(filter.status)rows=rows.filter(row=>row.status===filter.status);
      if(filter.search)rows=rows.filter(row=>[row.payee,row.memo,row.reference,row.providerId,row.postedDate,row.amount].some(value=>String(value??'').toLowerCase().includes(filter.search)));
      rows.sort((a,b)=>String(a.postedDate??'').localeCompare(String(b.postedDate??''))||a.id.localeCompare(b.id));
      return {items:rows.slice(offset,offset+limit).map(row=>matchView(bank,row)),total:rows.length,offset,limit,
        revision:this.workspace.state.revision};
    });
  }
  async detail(id) {
    return this.workspace.serial(async()=>{
      const transaction=this.transaction(id),account=this.account(transaction.accountId),data=this.receivables.data();
      return {transaction:matchView(this.data(),transaction),account:clone(account),
        suggestions:matchSuggestions(data,account,transaction),
        invoices:data.invoices.filter(row=>row.status==='ISSUED'&&currencyKey(row.document.currency)===currencyKey(account.currency))
          .map(row=>this.receivables._result({invoiceId:row.id}).invoice),
        revision:this.workspace.state.revision,workspaceId:this.binding().workspaceId};
    });
  }
  async importDetail(id) {
    return this.workspace.serial(async()=>{
      const row=this.importRow(id),bytes=await this._importFile(row,'parsed.json');
      return {import:clone(row),report:JSON.parse(bytes.toString('utf8')),revision:this.workspace.state.revision};
    });
  }
  async _importFile(row,name) {
    const file=row.files[name];need(file,'BANK_FILE_NOT_FOUND','Choose the original source file or parsed.json.',404);
    return readFile(this._path('imports',row.id,file.name),file);
  }
  async importFile(id,name) {
    return this.workspace.serial(async()=>{
      const row=this.importRow(id),file=row.files[name];
      need(file,'BANK_FILE_NOT_FOUND','Choose the original source file or parsed.json.',404);
      return {bytes:await this._importFile(row,name),name:name==='original'?row.file.name:file.name,type:file.type};
    });
  }
  async match(id,value) {
    return this._mutate('transaction_matched',{...value,bankTransactionId:id},async(data,actor)=>{
      const row=this.transaction(id),account=this.account(row.accountId),match=prepareMatch(data,account,row,value);
      const saved={id:randomUUID(),...match,createdAt:now(),actor};
      this.data().matches.push(saved);recordStatementCoverage(data,account,row,saved,actor,saved.createdAt);
      row.history.push({at:now(),actor,action:'matched',reason:match.reason});
      return {bankStatementAccountId:account.id,bankTransactionId:row.id};
    });
  }
  async receiveReceipt(id,value) {
    return this._mutate('receipt_received',{...value,bankTransactionId:id},async(data,actor)=>{
      const bank=bankData(data),row=this.transaction(id),account=this.account(row.accountId);
      need(row.status==='POSTED'&&!activeMatch(bank,id),'BANK_TRANSACTION_REVIEW_REQUIRED',
        'Choose one resolved, unmatched bank credit.',409);
      assertOpenDate(bank,account.id,row.postedDate);
      const bankAmount=amountOf(row,account),gross=minor(value.grossAmount,account.currency,'gross customer payment',{positive:true}),
        fee=minor(value.feeAmount??'0',account.currency,'bank or processor fee');
      need(bankAmount>0n&&gross-fee===bankAmount,'BANK_RECEIPT_NET_DIFFERENCE',
        'Gross customer payment less its bank/processor fee must equal this bank credit.',409);
      const entry=statementSourceEntry(data,account,row);
      need(entry,'BANK_INTAKE_ACCOUNT_MISSING','Receive the statement into its original receipt intake account.',409);
      const sourceMatches=bankSourceMatches(data,entry.bankImport,entry.row),
        distinct=row.history?.some(event=>event.action==='ACCEPT_DISTINCT');
      need(!sourceMatches.some(source=>source.receiptIds.length&&
        (['TRANSACTION_ID','SOURCE_LINE'].includes(source.match)||!distinct)),
        'BANK_EXISTING_CUSTOMER_RECEIPT','This bank payment already has an original receipt. Match that saved receipt.',409);
      const reference=field(value.reference??row.reference??row.providerId,'payment reference',300);
      need(!data.receipts.some(item=>item.customerId===value.customerId&&item.reference===reference&&item.status==='RECORDED'),
        'BANK_EXISTING_CUSTOMER_RECEIPT','A customer receipt already has this reference. Match its original record.',409);
      const original=this.receivables._appendReceipt(data,actor,{
        customerId:value.customerId,currency:account.currency,amount:money(gross,account.currency),receivedDate:row.postedDate,
        method:'Bank statement',reference,note:field(value.note??'','payment note',4000,true)
      },{sourceKey:sha(json({kind:'ORIGINAL_BANK_STATEMENT',accountId:account.id,transactionId:row.id})),
        source:{kind:'ORIGINAL_BANK_STATEMENT',accountId:account.id,transactionId:row.id,
          sourceIdentity:row.sourceIdentity,sourceFingerprint:row.financialSha256,copies:clone(row.copies),
          originalCurrency:row.currency,originalAmount:row.sourceAmount,bankAmount:money(bankAmount,account.currency),
          grossAmount:money(gross,account.currency),feeAmount:money(fee,account.currency),valuation:clone(row.valuation??null)},
        action:'bank_statement_received'});
      const parts=[{kind:'RECEIPT',receiptId:original.receiptId,amount:money(gross,account.currency)}];
      if(fee>0n)parts.push({kind:'FEE',amount:money(-fee,account.currency),
        note:field(value.feeNote??value.reason,'bank or processor fee description',3000),ledgerCode:value.feeLedgerCode??''});
      const match=prepareMatch(data,account,row,{parts,reason:value.reason});
      const saved={id:randomUUID(),...match,createdAt:now(),actor,createdReceiptId:original.receiptId};
      bank.matches.push(saved);recordStatementCoverage(data,account,row,saved,actor,saved.createdAt);
      row.history.push({at:now(),actor,action:'receipt_received',receiptId:original.receiptId});
      let allocation={};
      if(value.invoiceId)allocation=this.receivables._allocatePayment(data,actor,{
        invoiceId:value.invoiceId,receiptId:original.receiptId,amount:value.allocationAmount??money(gross,account.currency),
        allocatedDate:value.allocatedDate??row.postedDate});
      return {...original,...allocation,bankStatementAccountId:account.id,bankTransactionId:row.id};
    });
  }
  async undo(id,value) {
    return this._mutate('match_undone',{...value,bankTransactionId:id},async(data,actor)=>{
      const bank=bankData(data),row=this.transaction(id),match=activeMatch(bank,id);
      assertOpenDate(bank,row.accountId,row.postedDate);
      need(match,'BANK_MATCH_NOT_FOUND','This transaction has no current match.',409);
      match.undoneAt=now();match.undoneBy=actor;match.undoReason=field(value.reason,'undo reason',4000);
      releaseStatementCoverage(data,match,actor,match.undoneAt,match.undoReason);
      row.history.push({at:now(),actor,action:'match_undone',matchId:match.id,reason:match.undoReason});
      return {bankStatementAccountId:row.accountId,bankTransactionId:id};
    });
  }
  _unencumberedSource(data,row) {
    need(!activeMatch(bankData(data),row.id),'BANK_CORRECTION_HAS_MATCH',
      'Undo the original bank match before resolving its source correction.',409);
    need(!data.receipts.some(receipt=>receipt.source?.kind==='ORIGINAL_BANK_STATEMENT'&&
      receipt.source.transactionId===row.id&&receipt.status==='RECORDED'),'BANK_SOURCE_HAS_RECEIPT',
      'Release any allocations and void the original bank-created receipt before replacing its source transaction.',409);
  }
  async resolve(id,value) {
    return this._mutate('source_resolved',{...value,bankTransactionId:id},async(data,actor)=>{
      const bank=bankData(data),row=this.transaction(id),account=this.account(row.accountId),
        reason=field(value.reason,'source review reason',4000),action=field(value.action,'source review action',40);
      assertOpenDate(bank,account.id,row.postedDate);
      this._unencumberedSource(data,row);
      if(action==='ACCEPT_DISTINCT') {
        need(row.status==='OVERLAP_REVIEW'&&!row.providerKey,'BANK_DISTINCT_REVIEW_REQUIRED',
          'Accept a separate transaction only for an ambiguous source row without a native transaction ID.',409);
        amountOf(row,account);dateValue(row.postedDate,'bank posted date');row.status='POSTED';
      } else if(action==='LINK_DUPLICATE') {
        need(['OVERLAP_REVIEW','CONFLICT','INVALID','POSTED'].includes(row.status),'BANK_DUPLICATE_REVIEW_REQUIRED',
          'Select a current source row for duplicate review.',409);
        const target=this.transaction(value.targetId);
        need(target.id!==row.id&&target.accountId===account.id&&target.status==='POSTED'&&
          target.postedDate===row.postedDate&&amountOf(target,account)===amountOf(row,account),
          'BANK_DUPLICATE_IDENTITY','Choose the original transaction with the same account, date and exact amount.',409);
        if(row.providerKey&&target.providerKey)need(row.providerKey===target.providerKey,'BANK_NATIVE_IDENTITY_DIFFERS',
          'Two distinct native transaction IDs represent separate bank transactions.');
        row.status='DUPLICATE';row.duplicateOf=target.id;
        for(const copy of row.copies)if(!target.copies.some(item=>item.importId===copy.importId&&item.sourceRowId===copy.sourceRowId))target.copies.push(clone(copy));
      } else if(action==='APPLY_CORRECTION') {
        need(['CORRECTION_REVIEW','CONFLICT'].includes(row.status),'BANK_CORRECTION_REQUIRED',
          'Select a native correction or changed transaction identity.',409);
        const target=this.transaction(value.targetId);
        need(target.id!==row.id&&target.accountId===account.id&&['POSTED','INVALID','CONFLICT','DUPLICATE','FOREIGN_CURRENCY'].includes(target.status),
          'BANK_CORRECTION_TARGET','Choose the current original transaction in this bank account.',409);
        assertOpenDate(bank,account.id,target.postedDate);this._unencumberedSource(data,target);
        need(row.interpretationReplacesId?row.interpretationReplacesId===target.id:
          row.correction?row.correction.providerKey?row.correction.providerKey===target.providerKey:
            row.correction.providerId===target.providerId:row.sourceIdentity&&row.sourceIdentity===target.sourceIdentity,
          'BANK_CORRECTION_IDENTITY','The correction must identify the selected original bank transaction.',409);
        const kind=row.interpretationAction??row.correction?.action??'REPLACE';
        const originalImport=this.importRow(row.copies[0].importId);
        need(!originalImport.issues.some(issue=>issue.severity==='ERROR'&&issue.code!=='CONFLICTING_PROVIDER_TRANSACTION'),
          'BANK_SOURCE_ERROR','Receive the corrected original provider/source response before applying its transaction.',409);
        if(kind==='REPLACE')need(!row.issues.some(issue=>issue.severity==='ERROR'&&issue.code!=='CONFLICTING_PROVIDER_TRANSACTION'),
          'BANK_SOURCE_ERROR','Correct the original source or its explicit mapping before replacing this transaction.',409);
        need(['REPLACE','DELETE'].includes(kind),'BANK_CORRECTION_ACTION','Review an original REPLACE or DELETE correction.');
        if(kind==='REPLACE') {dateValue(row.postedDate,'replacement posted date');amountOf(row,account);
          target.status='SUPERSEDED';row.status='POSTED';}
        else {target.status='DELETED';row.status='DELETED';}
        target.correctedBy=row.id;row.supersedesId=target.id;
        target.history.push({at:now(),actor,action:'source_'+kind.toLowerCase(),replacementId:row.id,reason});
      } else if(action==='VALUE') {
        need(row.currency&&row.currency!==account.currency.code&&['FOREIGN_CURRENCY','CORRECTION_REVIEW'].includes(row.status),
          'BANK_FOREIGN_VALUE_REQUIRED','Select an original foreign-currency transaction for account valuation.');
        need(!row.issues.some(issue=>issue.severity==='ERROR')&&
          !this.importRow(row.copies[0].importId).issues.some(issue=>issue.severity==='ERROR'),
          'BANK_SOURCE_ERROR','Receive the corrected source before valuing this foreign-currency transaction.',409);
        dateValue(row.postedDate,'bank posted date');
        need(typeof row.amount==='string'&&/^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(row.amount),'BANK_SOURCE_AMOUNT_REQUIRED','Retain a valid original signed amount.');
        const amount=minor(value.accountAmount,account.currency,'reviewed account-currency amount',{signed:true});
        need(amount!==0n&&(row.amount.startsWith('-')?amount<0n:amount>0n),'BANK_VALUATION_SIGN',
          'The reviewed account value must preserve the original debit or credit direction.');
        row.valuation={amount:money(amount,account.currency),currency:clone(account.currency),reason,actor,at:now()};
        row.financialSha256=sha(json({source:financialFingerprint(row),valuation:row.valuation.amount}));
        if(row.status==='FOREIGN_CURRENCY')row.status='POSTED';
      } else if(action==='EXCLUDE') {
        need(row.status==='INVALID'&&(!row.postedDate||row.amount===null||row.sourceStatus!=='POSTED'),
          'BANK_EXCLUSION_REQUIRED','Exclude only a non-posted or incomplete source row; review posted amounts as transactions.');
        row.status='EXCLUDED';row.exclusionReason=reason;
      } else need(false,'INVALID_BANK_RESOLUTION','Choose a documented source review action.');
      row.history.push({at:now(),actor,action,reason,targetId:value.targetId??null});
      return {bankStatementAccountId:account.id,bankTransactionId:id};
    });
  }
  _periodClose(id) {
    if(!id)return null;
    const row=(this.workspace.state.periodCloses??[]).find(item=>item.id===id);
    need(row,'BANK_ACCOUNTING_CLOSE_NOT_FOUND','Choose the original retained recorded-activity close.',404);
    return {id:row.id,name:row.name,period:clone(row.period),runId:row.runId,exportId:row.exportId,
      closeSha256:row.closeSha256,createdAt:row.createdAt};
  }
  async previewClose(value) {
    return this.workspace.serial(async()=>{
      const report=closePreview(this.receivables.data(),this.account(value.accountId),value,this._periodClose(value.periodCloseId));
      return {revision:this.workspace.state.revision,workspaceId:this.binding().workspaceId,...report};
    });
  }
  async retainClose(value) {
    return this._mutate('period_closed',value,async(data,actor,requestId)=>{
      const bank=bankData(data),account=this.account(value.accountId),
        report=closePreview(data,account,value,this._periodClose(value.periodCloseId));
      need(value.reviewSha256===report.reviewSha256,'BANK_CLOSE_REVIEW_CHANGED',
        'Review the current complete reconciliation before retaining its close.',409);
      need(report.ready,'BANK_CLOSE_UNRESOLVED','Resolve every source row, matching difference and bank balance difference before closing.',409);
      const id=randomUUID(),createdAt=now(),name=field(value.name,'reconciliation name',160),note=field(value.note??'','close note',4000,true);
      const sourceIds=new Set(report.imports.map(row=>row.id)),receiptIds=new Set(report.matches.flatMap(row=>row.parts.filter(part=>part.kind==='RECEIPT').map(part=>part.targetId))),
        refundIds=new Set(report.matches.flatMap(row=>row.parts.filter(part=>part.kind==='REFUND').map(part=>part.targetId)));
      const refunds=(data.refunds??[]).filter(row=>refundIds.has(row.id));
      for(const refund of refunds)receiptIds.add(refund.proposal.receiptId);
      let expanded=true;
      while(expanded) {
        expanded=false;
        for(const receipt of data.receipts) {
          const relations=[receipt.id,receipt.replacesReceiptId,receipt.replacedByReceiptId,...(receipt.replacementReceiptIds??[])].filter(Boolean);
          if(relations.some(id=>receiptIds.has(id)))for(const id of relations)if(!receiptIds.has(id)){receiptIds.add(id);expanded=true;}
        }
      }
      const receipts=data.receipts.filter(row=>receiptIds.has(row.id));
      const customerIds=new Set(receipts.map(row=>row.customerId));
      const intake=new BankReceiptsWorkspace(this.receivables),
        intakeImports=(data.bankImports??[]).filter(row=>row.accountId===account.receiptIntakeAccountId&&
          row.index.some(item=>item.bookedDate>=report.from&&item.bookedDate<=report.until)),
        intakeFiles=[],intakeManifest=[],intakeArchiveByHash=new Map();
      for(const imported of intakeImports) {
        const entries=[
          ...Object.keys(imported.files).map(name=>({name,postingId:null,read:()=>intake._file(imported,name)})),
          ...imported.postings.flatMap(posting=>Object.entries(posting.files).map(([name,metadata])=>({
            name,postingId:posting.id,read:()=>intake._readRetained(metadata)})))
        ];
        for(const original of entries) {
          const file=await original.read(),originalName=original.name,
            extension=(originalName.match(/\.([A-Za-z0-9]+)$/)?.[1]??'bin').slice(0,12),
            digest=sha(file.bytes),name=intakeArchiveByHash.get(digest)??'intake-'+digest+'.'+extension;
          if(!intakeArchiveByHash.has(digest)){intakeFiles.push({...file,name});intakeArchiveByHash.set(digest,name);}
          intakeManifest.push({bankImportId:imported.id,bankPostingId:original.postingId,originalName,
            sourceName:file.name??originalName,archiveName:name,bytes:file.bytes.length,sha256:sha(file.bytes),type:file.type});
        }
      }
      const closedReport={...report,id,name,note,createdAt,actor,requestId};
      const snapshot={schema:'stellar-forge.merchant-bank-editable-close.v1',workspace:this.binding(),close:closedReport,
        account:clone(account),receiptIntakeAccount:clone((data.bankAccounts??[]).find(row=>row.id===account.receiptIntakeAccountId)??null),
        receiptIntakeImports:clone(intakeImports),receiptIntakeFiles:intakeManifest,
        imports:bank.imports.filter(row=>sourceIds.has(row.id)).map(clone),
        transactions:clone(report.transactions),matches:bank.matches.filter(row=>report.transactions.some(tx=>tx.id===row.transactionId)).map(clone),
        receipts:clone(receipts),refunds:clone(refunds),allocations:data.allocations.filter(row=>receipts.some(receipt=>receipt.id===row.receiptId)).map(clone),
        customers:this.workspace.state.customerStatements.customers.filter(row=>customerIds.has(row.id)).map(clone),
        relatedCloses:bank.closes.filter(row=>row.accountId===account.id).map(clone),reopenings:bank.reopenings.filter(row=>row.accountId===account.id).map(clone)};
      const files=[...closeDocuments(closedReport,snapshot),...intakeFiles];
      for(const imported of bank.imports.filter(row=>sourceIds.has(row.id)))files.push({
        name:'source-'+imported.id+'.'+EXT[imported.format],type:imported.file.type,bytes:await this._importFile(imported,'original')});
      for(const customerId of customerIds) {
        const customer=this.workspace.state.customerStatements.customers.find(row=>row.id===customerId);
        files.push({name:'customer-'+customerId+'.tar',type:'application/x-tar',
          bytes:renderCustomerTar((await this.receivables._exportCustomer(customerId,{asOf:report.until})).files)});
      }
      const directory=await this._directory('closes',id),descriptors={};
      for(const file of files)descriptors[file.name]={name:file.name,type:file.type,...await writeFile(join(directory,file.name),file.bytes)};
      const manifest={schema:'stellar-forge.merchant-bank-close-manifest.v1',closeId:id,accountId:account.id,
        reviewSha256:report.reviewSha256,files:clone(descriptors),createdAt,requestId};
      const manifestBytes=Buffer.from(json(manifest));
      descriptors['manifest.json']={name:'manifest.json',type:'application/json',...await writeFile(join(directory,'manifest.json'),manifestBytes)};
      await syncDirectory(directory);
      const close={id,schema:BANK_CLOSE_SCHEMA,accountId:account.id,name,note,from:report.from,until:report.until,
        openingBalance:report.openingBalance,closingBalance:report.closingBalance,currency:clone(account.currency),
        createdAt,actor,requestId,reviewSha256:report.reviewSha256,
        transactionIds:report.transactions.map(row=>row.id),matchIds:report.matches.map(row=>row.id),
        files:descriptors,sourceClosing:value.sourceClosing??null,periodClose:report.periodClose,
        previousCloseId:bank.closes.filter(row=>row.accountId===account.id&&row.from===report.from&&row.until===report.until).at(-1)?.id??null};
      bank.closes.push(close);
      return {bankStatementAccountId:account.id,bankCloseId:id};
    });
  }
  async reopenClose(id,value) {
    return this._mutate('period_reopened',{...value,bankCloseId:id},async(data,actor,requestId)=>{
      const bank=bankData(data),close=this.closeRow(id);
      need(!bank.reopenings.some(row=>row.closeId===id),'BANK_CLOSE_ALREADY_REOPENED','This close already has its retained reopening.',409);
      const event={id:randomUUID(),closeId:id,accountId:close.accountId,reason:field(value.reason,'reopening reason',4000),
        actor,at:now(),requestId};
      bank.reopenings.push(event);return {bankStatementAccountId:close.accountId,bankCloseId:id,bankReopeningId:event.id};
    });
  }
  async closeDetail(id) {
    return this.workspace.serial(async()=>{
      const bank=this.data(),close=this.closeRow(id),file=close.files['reconciliation.json'];
      const report=JSON.parse((await readFile(this._path('closes',id,file.name),file)).toString('utf8'));
      const changed=report.transactions.filter(row=>{
        const current=bank.transactions.find(item=>item.id===row.id);
        return !current||current.financialSha256!==row.financialSha256||current.status!==row.status||
          (activeMatch(bank,row.id)?.id??null)!==(report.matches.find(match=>match.transactionId===row.id)?.id??null);
      }).map(row=>row.id);
      const current=closePreview(this.receivables.data(),this.account(close.accountId),{
        accountId:close.accountId,from:report.from,until:report.until,openingBalance:report.openingBalance,
        closingBalance:report.closingBalance,balanceNote:report.balanceNote,
        ...(report.sourceClosing?{sourceClosing:{importId:report.sourceClosing.importId,id:report.sourceClosing.closing.id}}:{})
      },report.periodClose);
      return {close:clone(close),report,reopening:clone(bank.reopenings.find(row=>row.closeId===id)??null),
        currentProblems:current.problems.filter(problem=>problem.code!=='BANK_CLOSE_OVERLAP'),currentDifference:current.difference,
        changedTransactionIds:changed,newTransactionIds:bank.transactions.filter(row=>row.accountId===close.accountId&&row.postedDate&&row.postedDate>=close.from&&row.postedDate<=close.until&&!report.transactions.some(prior=>prior.id===row.id)).map(row=>row.id),revision:this.workspace.state.revision};
    });
  }
  async closeFile(id,name) {
    return this.workspace.serial(async()=>{
      const close=this.closeRow(id);
      if(name==='account.tar') {
        const files=[];for(const [filename,metadata] of Object.entries(close.files))
          files.push({name:filename,bytes:await readFile(this._path('closes',id,filename),metadata)});
        return {name:'bank-reconciliation-'+id+'.tar',type:'application/x-tar',bytes:renderCustomerTar(files)};
      }
      const descriptor=close.files[name];need(descriptor,'BANK_FILE_NOT_FOUND','Choose a retained reconciliation file.',404);
      return {name,type:descriptor.type,bytes:await readFile(this._path('closes',id,name),descriptor)};
    });
  }
}
