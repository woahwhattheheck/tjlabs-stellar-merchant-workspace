// MIT. Exact original Bank reconciliation through the existing authenticated Merchant transport.
import {createHash} from 'node:crypto';
import {openMerchantFileClient} from './retained-download.mjs';
import {createAccountingMaintenanceClient} from './accounting-maintenance-client.mjs';
const PREFIX='merchant_accounting_bank_statements_';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const SHA=/^[a-f0-9]{64}$/;
const REQUEST_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const json=value=>JSON.stringify(value,null,2)+'\n';
const digest=value=>createHash('sha256').update(json(value)).digest('hex');
const fail=(code,message)=>Object.assign(new Error(message),{code:'ACCOUNTING_BANK_STATEMENTS_CLIENT_'+code});
function need(ok,message,code='ARGUMENTS'){if(!ok)throw fail(code,message);}
function wire(value={}){
 need(plain(value)&&!Object.hasOwn(value,'workspace'),'Keep this client’s configured workspace alias.');
 let copy;try{copy=JSON.parse(JSON.stringify(value));}catch{throw fail('ARGUMENTS','Use complete JSON arguments.');}
 need(plain(copy),'Use one complete argument object.');return copy;
}
function revision(value){need(Number.isSafeInteger(value)&&value>=1,'Keep the original accounting revision.');return value;}
export const ACCOUNTING_BANK_STATEMENTS_METHODS=Object.freeze({
 status:'status',previewSource:'source_preview',saveAccount:'account_save',receiveSource:'source_import',
 transactions:'transactions',transaction:'transaction',import:'import',match:'match',receiveReceipt:'receipt',
 undo:'undo',resolve:'resolve',previewAssembly:'assembly_preview',previewClose:'close_preview',
 retainClose:'close',closeDetail:'close_detail',reopenClose:'reopen',request:'request_lookup'
});
const ACTIONS=Object.freeze({account_save:'bank_account_saved',source_import:'bank_source_received',
 match:'bank_transaction_matched',receipt:'bank_receipt_received',undo:'bank_match_undone',
 resolve:'bank_source_resolved',close:'bank_period_closed',reopen:'bank_period_reopened'});
export const ACCOUNTING_BANK_STATEMENTS_MUTATIONS=Object.freeze(Object.keys(ACTIONS));
const OPERATIONS=new Set(Object.values(ACCOUNTING_BANK_STATEMENTS_METHODS));
const PAGED=new Set(['status','transactions']);
export function accountingBankStatementsArguments(kind,value){
 need(Object.hasOwn(ACTIONS,kind),'Choose an original bank mutation.');
 const args=wire(value);revision(args.revision);
 need(UUID.test(args.workspaceId??'')&&REQUEST_ID.test(args.requestId??'')&&typeof args.actor==='string'&&args.actor.trim()&&args.actor.length<=1000,
  'Preserve the actual workspace UUID, original request ID and responsible operator.');
 need(args.sourceAlias===undefined,'Resolved original bytes belong in mutations; do not reread a host alias.');
 if(['match','receipt','undo','resolve'].includes(kind))need(UUID.test(args.bankTransactionId??''),'Select the original transaction.');
 if(kind==='reopen')need(UUID.test(args.bankStatementCloseId??''),'Select the original close.');
 if(kind==='source_import'){
  need(UUID.test(args.accountId??'')&&typeof args.statementId==='string'&&SHA.test(args.reviewSha256??'')&&plain(args.source)&&plain(args.source.file),
   'Keep the reviewed source, chosen statement/account and original review SHA.');
  const encoded=args.source.file.dataBase64,bytes=Buffer.from(encoded??'','base64');
  need(typeof encoded==='string'&&bytes.length>0&&bytes.length<=16_000_000&&bytes.toString('base64')===encoded,
   'Retain complete original source bytes within the native 16 MB limit.');
 }
 if(kind==='close')need(UUID.test(args.accountId??'')&&SHA.test(args.reviewSha256??''),'Keep the original account and reviewed close SHA.');
 return args;
}
export function accountingBankStatementsImportArguments(inspection,selection){
 need(plain(inspection)&&plain(inspection.sourceInput)&&plain(inspection.file)&&UUID.test(inspection.workspaceId??'')&&SHA.test(inspection.reviewSha256??''),
  'Retain the complete original inspection and resolved sourceInput.');
 const bytes=Buffer.from(inspection.sourceInput.file?.dataBase64??'','base64');
 need(bytes.length===inspection.file.bytes&&createHash('sha256').update(bytes).digest('hex')===inspection.file.sha256,
  'The inspected original source bytes changed.','SOURCE');
 const selected=wire(selection);
 need(Object.keys(selected).every(k=>['actor','requestId','accountId','statementId','supersedesImportId','receiptIntakeAccountId'].includes(k)),
  'Keep the chosen native statement/account and original operation context.');
 need(inspection.statements?.some(row=>row.id===selected.statementId),'Choose one actual inspected statement.');
 return accountingBankStatementsArguments('source_import',{...selected,revision:inspection.revision,workspaceId:inspection.workspaceId,
  source:wire({source:inspection.sourceInput}).source,reviewSha256:inspection.reviewSha256});
}
export function accountingBankStatementsCloseArguments(preview,operation){
 need(plain(preview)&&preview.ready===true&&plain(preview.closeInput)&&SHA.test(preview.reviewSha256??'')&&UUID.test(preview.workspaceId??''),
  'Retain a complete ready native close preview and its exact closeInput.');
 const selected=wire(operation);
 need(Object.keys(selected).every(k=>['actor','requestId','name','note'].includes(k)),'Add only the original operation identity and close label.');
 return accountingBankStatementsArguments('close',{...wire(preview.closeInput),...selected,revision:preview.revision,
  workspaceId:preview.workspaceId,reviewSha256:preview.reviewSha256});
}
function nativeIntent(kind,input){
 const value=wire(input);
 if(['match','receipt','undo','resolve'].includes(kind)){const id=value.bankTransactionId;delete value.bankTransactionId;value.bankTransactionId=id;}
 if(kind==='reopen'){const id=value.bankStatementCloseId;delete value.bankStatementCloseId;value.bankCloseId=id;}
 delete value.revision;return digest({action:ACTIONS[kind],value});
}
/** Borrow one structured call; the caller retains original authentication and transport. */
export function createAccountingBankStatementsClient({workspace, call} = {}) {
  need(typeof workspace === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(workspace),
    'Choose the configured original accounting workspace alias.');
  need(typeof call === 'function', 'Supply the original structured MCP call.');
  const maintenance = createAccountingMaintenanceClient({workspace, call}), pending = new Set();
  let closed = false, transitioning = false, closePromise;
  function accepting() { need(!closed && !transitioning, 'This caller is draining or closed.', 'CLOSED'); }
  async function tracked(work) {
    accepting(); const promise = Promise.resolve().then(work); pending.add(promise);
    try { return await promise; } finally { pending.delete(promise); }
  }
  function invoke(name, args = {}, options) {
    const selected = wire(args);
    return tracked(async () => {
      const result = await call(name, {...selected, workspace}, options);
      need(plain(result), 'The original merchant returned no structured result.', 'REPLY');
      return result;
    });
  }
  async function transition(work, permanent = false) {
    accepting(); transitioning = true;
    try {
      await Promise.allSettled([...pending]);
      const result = await work();
      if (permanent) closed = true;
      return result;
    } finally { transitioning = false; }
  }
  function closeAfter(work) {
    if (!closePromise) {
      const attempt = transition(work, true); closePromise = attempt;
      attempt.catch(() => { if (closePromise === attempt) closePromise = undefined; });
    }
    return closePromise;
  }
  const client = {
    workspace,
    open: options => invoke('merchant_accounting_open', {}, options),
    configuredSources: options => invoke('merchant_accounting_sources', {}, options),
    callOperation(kind, args = {}, options) {
      need(OPERATIONS.has(kind), 'Choose a declared bank-statements operation.');
      const selected=Object.hasOwn(ACTIONS,kind)?accountingBankStatementsArguments(kind,args):wire(args);
      return invoke(PREFIX+kind,selected,options).then(result=>{
        need(result.workspace===workspace&&UUID.test(result.workspaceId??''),'The bank reply lost its original workspace binding.','REPLY');
        if(selected.workspaceId)need(result.workspaceId===selected.workspaceId,'The reply belongs to another accounting workspace.','REQUEST_BINDING');
        return result;
      });
    },
    async listAll(kind, args = {}, options) {
      need(PAGED.has(kind) && args.offset === undefined && args.limit === undefined &&
        (kind !== 'status' || ['accounts','imports','closes','reopenings','customers','periodCloses','history'].includes(args.view)),
        'Choose an original paged view and let this reader advance offsets.');
      const items = []; let offset = 0, total, version, metadata, stamp;
      for (;;) {
        const page = await client.callOperation(kind, {...args, offset, limit: 200}, options);
        need(Array.isArray(page.items) && page.offset === offset && Number.isSafeInteger(page.total) &&
          page.total >= offset + page.items.length && page.items.length <= 200,
          'The original inventory returned an inconsistent page.', 'PAGE');
        revision(page.revision);
        const observed = JSON.stringify({view: page.view ?? null, asOf: page.asOf ?? null,
          workspaceId: page.workspaceId ?? null});
        if (metadata === undefined) {
          const {items: omitted, offset: ignoredOffset, limit: ignoredLimit, ...rest} = page;
          metadata = rest; total = page.total; version = page.revision; stamp = observed;
        }
        need(total === page.total && version === page.revision && stamp === observed,
          'The original inventory changed between pages. Read the current inventory again.', 'OBSERVATION_CHANGED');
        items.push(...page.items); offset += page.items.length;
        if (offset === total) return {...metadata, items, total, revision: version};
        need(page.items.length > 0, 'The original inventory did not advance.', 'PAGE');
      }
    },
    async reconcileOperation(kind, value, options) {
      const args = accountingBankStatementsArguments(kind, value);
      const observed = await client.request({requestId: args.requestId}, options);
      need(observed.workspaceId === args.workspaceId,'The original operation was observed in a different workspace.','REQUEST_BINDING');
      if (!observed.found) return observed;
      const operation = observed.operation;
      need(operation?.id === args.requestId && operation.action === ACTIONS[kind] &&
        operation.actor === args.actor.trim() && operation.intentSha256 === nativeIntent(kind, args),
        'The request ID belongs to a different original operation or source selection.', 'REQUEST_BINDING');
      return observed;
    },
    registerFileRead: readId => maintenance.registerFileRead(readId),
    releaseFile: (readId, options) => maintenance.releaseFile(readId, options),
    drainFileReads: () => transition(() => maintenance.drainFileReads()),
    async *fileChunks(selection, options) {
      accepting(); need(['bank-statements-import','bank-statements-close'].includes(selection?.kind),'Select an original bank file.');
      const iterator = maintenance.fileChunks(selection, options);
      try {
        for (;;) { accepting(); const item = await iterator.next(); if (item.done) return; yield item.value; }
      } finally { await iterator.return?.(); }
    },
    async fileBytes(selection, {maximumBytes = 128 * 1024 * 1024, ...options} = {}) {
      need(Number.isSafeInteger(maximumBytes) && maximumBytes > 0 && maximumBytes <= 128 * 1024 * 1024,
        'Use a complete-file limit within the native private export size.');
      const parts = []; let length = 0, file;
      for await (const chunk of client.fileChunks(selection, options)) {
        file ??= chunk.file;
        need(Number.isSafeInteger(file.bytes) && file.bytes <= maximumBytes &&
          length + chunk.bytes.length <= maximumBytes,
          'The complete original file exceeds the selected byte limit.', 'FILE_SIZE');
        parts.push(chunk.bytes); length += chunk.bytes.length;
      }
      need(file && length === file.bytes, 'The complete original file ended early.', 'FILE_REPLY');
      return {bytes: Buffer.concat(parts, length), file};
    },
    disconnect: () => closeAfter(() => maintenance.drainFileReads()),
    closeWorkspace: options => closeAfter(() => maintenance.closeWorkspace(options)),
  };
  for (const [name, suffix] of Object.entries(ACCOUNTING_BANK_STATEMENTS_METHODS))
    client[name] = (args = {}, options) => client.callOperation(suffix, args, options);
  return Object.freeze(client);
}
/** Connect to the existing listener; no server, owner, credentials or keys are created. */
export async function connectAccountingBankStatementsClient({
  workspace, bearerToken, tokenEnv = 'MCP_ACCESS_TOKEN', environment = process.env,
  maximumResponseBytes = 128 * 1024 * 1024, ...options
} = {}) {
  const selectedEnvironment = bearerToken === undefined ? environment : {...environment, [tokenEnv]: bearerToken};
  const connection = await openMerchantFileClient({...options, tokenEnv, environment: selectedEnvironment,
    maximumResponseBytes, errorPrefix: 'ACCOUNTING_BANK_STATEMENTS', clientName: 'starforge-accounting-bank-statements'});
  return Object.freeze({...createAccountingBankStatementsClient({workspace, call: connection.call}), endpoint: connection.endpoint});
}
