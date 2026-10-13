// MIT. Complete original Bank reconciliation under the existing accounting owner.
import {BankStatementsWorkspace} from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements/store.mjs';
import {BANK_SOURCE_BYTES} from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements/domain.mjs';
import {need,plain,field} from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/core.mjs';
export {bankStatementsDefinitions,bankStatementsFileSelectors} from './catalog/accounting-bank-statements.mjs';
const PREFIX='merchant_accounting_bank_statements_';
const clone=value=>structuredClone(value);
function input(args,...selectors){const omitted=new Set(['workspace',...selectors]);return Object.fromEntries(Object.entries(args).filter(([key])=>!omitted.has(key)));}
function page(rows,args,metadata){
 const offset=args.offset??0,limit=args.limit??100;
 need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=500,'BANK_MCP_PAGE','Choose a nonnegative offset and one to 500 records.');
 return {...metadata,items:clone(rows.slice(offset,offset+limit)),total:rows.length,offset,limit};
}
function inventory(kind,id,files){return Object.entries(files).map(([file,value])=>({...value,selection:{kind,...(kind==='bank-statements-import'?{bankStatementImportId:id}:{bankStatementCloseId:id}),file}}));}
/** Borrows the original receivables writer; creates no session, server or lease. */
export class MerchantBankStatements{
 constructor(receivables,{readSource}={}){this.controller=new BankStatementsWorkspace(receivables);this.workspace=receivables.workspace;this.readSource=readSource;}
 async init(){await this.controller.init();return this;}
 async status(args){
  return this.workspace.serial(async()=>{
   const bank=this.controller.data(),view=args.view??'summary',binding=this.controller.binding();
   const common={workspace:args.workspace,workspaceId:binding.workspaceId,sourcesSha256:binding.sourcesSha256,revision:this.workspace.state.revision,view};
   if(args.accountId){
    need(['accounts','imports','closes','reopenings','history'].includes(view),'BANK_MCP_ACCOUNT_VIEW','Filter an account-specific inventory; customers, period closes and summary belong to the whole original workspace.');
    this.controller.account(args.accountId);
   }
   const summary=this.controller._summary();
   if(view==='summary')return {...common,schema:summary.schema,currencies:summary.currencies,counts:Object.fromEntries(['accounts','imports','closes','reopenings','customers','periodCloses'].map(key=>[key,summary[key].length]))};
   let rows=view==='history'?this.controller.receivables.data().requests.filter(row=>row.action.startsWith('bank_')).slice().reverse():summary[view];
   need(Array.isArray(rows),'BANK_MCP_VIEW','Choose an original bank inventory view.');
   if(args.accountId)rows=rows.filter(row=>view==='accounts'?row.id===args.accountId:view==='history'?row.result.bankStatementAccountId===args.accountId:row.accountId===args.accountId);
   if(args.search){const q=field(args.search,'bank search',300).toLocaleLowerCase('en-US');rows=rows.filter(row=>['id','name','note','action','actor'].some(key=>String(row[key]??'').toLocaleLowerCase('en-US').includes(q)));}
   return page(rows,args,common);
  });
 }
 async previewSource(args){
  const value=input(args,'sourceAlias');
  need(plain(value.source),'INVALID_BANK_SOURCE','Choose the complete original bank source and interpretation.');
  if(args.sourceAlias!==undefined){
   need(plain(value.source.file)&&value.source.file.dataBase64===undefined&&typeof this.readSource==='function','BANK_MCP_SOURCE_SELECTION','Choose a configured receivablesInputs alias with its original filename, or inline original bytes.');
   const name=field(value.source.file.name,'original source filename',240),bytes=await this.readSource(args.sourceAlias,BANK_SOURCE_BYTES);
   need((Buffer.isBuffer(bytes)||bytes instanceof Uint8Array)&&bytes.byteLength>0&&bytes.byteLength<=BANK_SOURCE_BYTES,'BANK_MCP_SOURCE_SIZE','Keep the complete original source within the native size limit.');
   value.source={...value.source,file:{...value.source.file,name,dataBase64:Buffer.from(bytes).toString('base64')}};
  }
  const result=await this.controller.previewSource(value);
  return {workspace:args.workspace,...result,sourceInput:clone(value.source)};
 }
 async importDetail(args){
  const result=await this.controller.importDetail(args.bankStatementImportId);
  return {workspace:args.workspace,workspaceId:this.controller.binding().workspaceId,...result,
   files:inventory('bank-statements-import',args.bankStatementImportId,result.import.files)};
 }
 async closeDetail(args){
  const result=await this.controller.closeDetail(args.bankStatementCloseId);
  return {workspace:args.workspace,workspaceId:this.controller.binding().workspaceId,...result,
   files:inventory('bank-statements-close',args.bankStatementCloseId,result.close.files),
   archive:{kind:'bank-statements-close',bankStatementCloseId:args.bankStatementCloseId,file:'account.tar'},
   archiveScope:'SELECTED_ACCOUNT_CLOSE_WITH_RELATED_CUSTOMER_SOURCE'};
 }
 async request(args){
  try{return {workspace:args.workspace,found:true,...await this.controller.getOperation(args.requestId)};}
  catch(error){if(error.code!=='BANK_OPERATION_NOT_FOUND')throw error;return {workspace:args.workspace,workspaceId:this.controller.binding().workspaceId,revision:this.workspace.state.revision,found:false,requestId:args.requestId};}
 }
 async file(args){
  if(args.kind==='bank-statements-import')return this.controller.importFile(args.bankStatementImportId,args.file);
  need(args.kind==='bank-statements-close','BANK_MCP_FILE','Choose the original bank import or close.');
  return this.controller.closeFile(args.bankStatementCloseId,args.file);
 }
 async call(operation,args){
  const kind=operation.startsWith(PREFIX)?operation.slice(PREFIX.length):'';
  let result;switch(kind){
   case 'status':return this.status(args);
   case 'source_preview':return this.previewSource(args);
   case 'account_save':result=await this.controller.saveAccount(input(args));break;
   case 'source_import':result=await this.controller.receiveSource(input(args));break;
   case 'transactions':result=await this.controller.transactions(input(args));break;
   case 'transaction':result=await this.controller.detail(args.bankTransactionId);break;
   case 'import':return this.importDetail(args);
   case 'match':result=await this.controller.match(args.bankTransactionId,input(args,'bankTransactionId'));break;
   case 'receipt':result=await this.controller.receiveReceipt(args.bankTransactionId,input(args,'bankTransactionId'));break;
   case 'undo':result=await this.controller.undo(args.bankTransactionId,input(args,'bankTransactionId'));break;
   case 'resolve':result=await this.controller.resolve(args.bankTransactionId,input(args,'bankTransactionId'));break;
   case 'assembly_preview':result=await this.controller.previewAssembly(input(args));break;
   case 'close_preview':result={...await this.controller.previewClose(input(args)),closeInput:clone(input(args))};break;
   case 'close':result=await this.controller.retainClose(input(args));break;
   case 'close_detail':return this.closeDetail(args);
   case 'reopen':result=await this.controller.reopenClose(args.bankStatementCloseId,input(args,'bankStatementCloseId'));break;
   case 'request_lookup':return this.request(args);
   default:need(false,'BANK_MCP_OPERATION','Choose a declared original Bank reconciliation operation.');
  }
  return {workspace:args.workspace,workspaceId:this.controller.binding().workspaceId,...result};
 }
}
