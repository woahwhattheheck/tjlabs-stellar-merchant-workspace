// MIT. Complete recipient delivery from one original merchant invoice.
import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {MerchantError,MerchantResult} from './workspace.mjs';
import {canonicalJson} from './protocol.mjs';

export const INVOICE_DELIVERY_SCHEMA='stellar-forge.merchant-invoice-delivery.v1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=/^[a-f0-9]{64}$/;
const ROOT=dirname(fileURLToPath(import.meta.url));
const LIMIT=16*1024*1024;
const hash=value=>createHash('sha256').update(value).digest('hex');
const need=(v,code,status=400)=>{if(!v)throw new MerchantError(code,status);};
const json=value=>JSON.stringify(value,null,2)+'\n';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={CREATED:'Draft',CHARGE_UNCERTAIN:'Creating request',CHARGE_REJECTED:'Request rejected',
 AWAITING_PAYMENT:'Awaiting payment',PAYMENT_PENDING:'Payment pending',PAYMENT_UNCERTAIN:'Reconciling payment',
 PAYMENT_FAILED:'Payment failed',SETTLEMENT_CONFIRMED:'Settled',FULFILLMENT_PENDING:'Preparing result',
 FULFILLMENT_INTERRUPTED:'Resuming delivery',COMPLETE:'Delivered'};
function amount(value,decimals){
 need(typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value)&&Number.isInteger(decimals)&&decimals>=0&&decimals<=255,'INVOICE_DELIVERY_AMOUNT_INVALID',500);
 if(!decimals)return value;const padded=value.padStart(decimals+1,'0');return padded.slice(0,-decimals)+'.'+padded.slice(-decimals);
}
function resultName(value){
 const name=value.fileName;
 if(typeof name==='string'&&/^[A-Za-z0-9][A-Za-z0-9._ -]{0,179}$/.test(name)&&!/[. ]$/.test(name)&&
  !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))return 'result/'+name;
 const extension=typeof name==='string'?name.match(/(\.[a-z0-9]{1,12})$/i)?.[1]:null;
 return 'result/delivered-result'+(extension||'.bin');
}
/** The original database owns this synchronous read. No payment action occurs. */
function capture(workspace,id){
 need(UUID.test(id??''),'ORDER_ID_INVALID');
 const store=workspace.store;store._assertOpen();
 need(!workspace.closing&&!store._db.isTransaction,'INVOICE_DELIVERY_BUSY',409);
 store._db.exec('BEGIN');
 try{
  const meta=store._get('SELECT store_id FROM merchant_meta WHERE singleton=1');
  need(meta.store_id===store.storeId,'INVOICE_DELIVERY_OWNER_CHANGED',409);
  const inspected=workspace.inspect(id);need(inspected.order.id===id,'INVOICE_DELIVERY_ORDER_CHANGED',409);
  const envelope=inspected.order.chargeId?workspace.envelope(id):null;
  const body={schema:INVOICE_DELIVERY_SCHEMA,owner:{storeId:store.storeId,tenantId:workspace.config.tenantId},
   invoice:inspected.order,history:inspected.history,envelope,
   amountMeaning:'Each payment option is an alternative quoted price. The original invoice outcome describes payment and delivery.'};
  const encoded=canonicalJson(body);need(Buffer.byteLength(encoded)<=LIMIT,'INVOICE_DELIVERY_HISTORY_CAPACITY',413);
  const result=body.invoice.state==='COMPLETE'?workspace.result(id):null;
  if(result)need(body.invoice.result&&result.metadata.sha256===body.invoice.result.sha256&&
   result.metadata.bytes===body.invoice.result.bytes,'INVOICE_DELIVERY_RESULT_CHANGED',409);
  store._assertOpen();store._db.exec('COMMIT');
  return {body,revision:hash(encoded),result};
 }catch(error){try{store._db.exec('ROLLBACK');}catch{}throw error;}
}
function summary(selected){
 const {body,revision}=selected,invoice=body.invoice;
 return {schema:INVOICE_DELIVERY_SCHEMA,owner:body.owner,invoiceId:invoice.id,revision,
  reference:invoice.reference,title:invoice.title,state:invoice.state,updatedAt:invoice.updatedAt,
  offers:invoice.frozen.rails.map(rail=>({...rail,amount:amount(rail.amountAtomic,rail.decimals)})),
  hasWalletRequest:body.envelope!==null,
  result:selected.result?{...invoice.result,member:resultName(invoice.result)}:null,
  historyRecords:body.history.length,
  members:['index.html','invoice.json','README.txt','MANIFEST.json',
   ...(body.envelope?['payment-request.json']:[]),...(selected.result?[resultName(invoice.result)]:[])]};
}
export function previewInvoiceDelivery(workspace,id){return summary(capture(workspace,id));}
function fact(label,value){return '<div><dt>'+escape(label)+'</dt><dd>'+escape(value??'—')+'</dd></div>';}
export function renderInvoiceDelivery(body,revision,{resultMember=null}={}){
 const order=body.invoice,rails=order.frozen.rails;
 const terms=rails.map(r=>'<tr><td>'+escape(r.label)+'</td><td class="amount">'+escape(amount(r.amountAtomic,r.decimals))+
  '</td><td>'+escape(r.network)+'</td><td class="mono">'+escape(r.assetId)+'</td><td class="mono">'+escape(r.recipient)+'</td></tr>').join('');
 const rows=body.history.map(row=>'<tr><td>'+escape(row.sequence)+'</td><td>'+escape(row.createdAt)+'</td><td>'+escape(row.kind)+
  '</td><td class="mono">'+escape(JSON.stringify(row.details))+'</td></tr>').join('');
 const envelope=body.envelope?'<a href="payment-request.json" download>Download original wallet request</a>':'';
 const result=resultMember?'<a href="'+escape(resultMember)+'" download="'+escape(order.result.fileName)+'">Download delivered file</a>':'';
 const resultFacts=order.result?fact('Original filename',order.result.fileName)+fact('Content type',order.result.contentType)+
  fact('Complete bytes',String(order.result.bytes))+fact('SHA-256',order.result.sha256):'';
 const receipt=order.receiptVerification?'<details><summary>Original receipt verification</summary><pre>'+
  escape(JSON.stringify(order.receiptVerification,null,2))+'</pre></details>':'';
 const next=order.state==='COMPLETE'?'The original completed file is included. Open or download it from this package.':
  order.nextActionAt?'The saved record schedules its next update for '+order.nextActionAt+'. Contact the original merchant for its current outcome.':
  'This package records the selected invoice at the edition shown. Contact the original merchant for its current payment or delivery outcome.';
 return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src \'none\'; base-uri \'none\'; form-action \'none\'">'+
 '<title>'+escape(order.reference)+' — Merchant invoice</title><style>'+
 '*{box-sizing:border-box}html{color-scheme:light}body{margin:0;background:#f4f4f4;color:#222;font:15px/1.5 system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:28px}header,section,details{background:#fff;border:1px solid #bbb;padding:20px;margin-bottom:16px;min-width:0}h1{font-size:28px;line-height:1.2;margin:6px 0 12px}h2{font-size:20px;margin:0 0 12px}p{margin:8px 0}h1,h2,p,dd,td,a{overflow-wrap:anywhere}.eyebrow{font-size:13px;color:#555}.status{display:inline-block;border:1px solid #777;padding:4px 9px;font-weight:600}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}a{color:#222;text-underline-offset:3px}.actions a{border:1px solid #777;background:#eee;padding:8px 12px}dl{margin:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 24px}dt{font-size:13px;color:#555}dd{margin:2px 0;font-weight:500}.mono{font:13px/1.5 ui-monospace,monospace;overflow-wrap:anywhere}.table-wrap{max-width:100%;overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #ddd;padding:10px 8px}th{background:#eee;font-weight:600}.amount{white-space:nowrap;font-variant-numeric:tabular-nums}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.5 ui-monospace,monospace}summary{cursor:pointer;font-weight:600}.muted{color:#555}@media(max-width:620px){main{padding:12px}header,section,details{padding:14px}h1{font-size:24px}dl{grid-template-columns:1fr}.table-wrap table{min-width:660px}}@media print{body{background:#fff}main{max-width:none;padding:0}.actions{display:none}header,section,details{break-inside:avoid}.table-wrap{overflow:visible}th,td{font-size:10px;padding:5px}a{color:#000}}</style></head><body><main>'+
 '<header><p class="eyebrow">Original merchant invoice · '+escape(order.id)+'</p><h1>'+escape(order.reference)+'</h1><p>'+escape(order.title)+
 '</p><p class="status">'+escape(names[order.state]||order.state)+'</p><p>'+escape(next)+'</p><nav class="actions" aria-label="Complete files">'+
 result+envelope+'<a href="invoice.json" download>Download complete invoice record</a><a href="MANIFEST.json" download>Download file manifest</a></nav></header>'+
 '<section><h2>Invoice and delivery</h2><dl>'+fact('Merchant store',body.owner.storeId)+fact('Tenant',body.owner.tenantId)+
 fact('Created',order.createdAt)+fact('Record updated',order.updatedAt)+fact('Charge',order.chargeId)+fact('Payment',order.paymentId)+
 fact('Provider order',order.providerOrderId)+fact('Wallet request expires',order.expiresAt)+fact('Selected record SHA-256',revision)+
 fact('Original state',order.state)+'</dl></section>'+
 '<section><h2>Original payment options</h2><p>'+escape(body.amountMeaning)+'</p><div class="table-wrap"><table><thead><tr><th>Option</th><th>Exact amount</th><th>Network</th><th>Asset</th><th>Recipient</th></tr></thead><tbody>'+terms+
 '</tbody></table></div><details><summary>Complete frozen request and version selections</summary><pre>'+escape(JSON.stringify(order.frozen,null,2))+'</pre></details></section>'+
 (order.result?'<section><h2>Delivered file</h2><dl>'+resultFacts+'</dl></section>':'')+receipt+
 '<details><summary>Complete original activity · '+body.history.length+' records</summary><div class="table-wrap"><table><thead><tr><th>Sequence</th><th>Time</th><th>Activity</th><th>Original details</th></tr></thead><tbody>'+rows+'</tbody></table></div></details>'+
 '<section><h2>Use this delivery</h2><p>Extract the complete ZIP into one folder and open index.html. Keep its files together. Open the delivered file with the application for its content type; use your browser’s Print command for this invoice.</p>'+
 '<p>The JSON record and manifest retain this exact original edition. A later update is a separate selected invoice edition. The original merchant continues payment and delivery through its existing service.</p></section></main></body></html>\n';
}
async function zip(directory,request,signal){
 need(!signal?.aborted,'INVOICE_DELIVERY_CANCELLED',503);
 const python=process.env.CODEX_PRIMARY_RUNTIME_PYTHON??'python3';
 const child=spawn(python,['-B',join(ROOT,'invoice_delivery_zip.py')],{stdio:['pipe','pipe','pipe'],windowsHide:true});
 let output='',stderr='',failure=null;const stop=()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');};
 child.on('error',error=>{failure=error;});child.stdin.on('error',error=>{failure=error;});
 child.stdout.on('data',data=>{output+=data;if(output.length>65536){failure=Error('INVOICE_DELIVERY_NATIVE_OUTPUT_LIMIT');stop();}});
 child.stderr.on('data',data=>{stderr=(stderr+data).slice(-65536);});
 signal?.addEventListener('abort',stop,{once:true});
 const closed=new Promise(resolve=>child.once('close',(code,sig)=>resolve({code,signal:sig})));
 try{
  child.stdin.end(JSON.stringify(request)+'\n');if(signal?.aborted)stop();const ended=await closed;
  need(!failure&&!signal?.aborted&&ended.code===0,'INVOICE_DELIVERY_ARCHIVE_FAILED',503);
  let value;try{value=JSON.parse(output);}catch{need(false,'INVOICE_DELIVERY_ARCHIVE_RESPONSE',503);}
  need(value?.path===join(directory,'invoice-delivery.zip')&&Number.isSafeInteger(value.bytes)&&value.bytes>0&&SHA.test(value.sha256??''),
   'INVOICE_DELIVERY_ARCHIVE_RESPONSE',503);return value;
 }finally{signal?.removeEventListener('abort',stop);}
}
/** Full source snapshot, original verified result, and deterministic standard ZIP. */
export async function createInvoiceDeliveryExport(workspace,{invoiceId,revision,signal}={}){
 need(SHA.test(revision??''),'INVOICE_DELIVERY_REVIEW_REQUIRED');
 const selected=capture(workspace,invoiceId);need(selected.revision===revision,'INVOICE_DELIVERY_CHANGED',409);
 const directory=await mkdtemp(join(tmpdir(),'merchant-invoice-delivery-'));
 const cleanup=()=>rmSync(directory,{recursive:true,force:true});
 try{
  const report=summary(selected),files=[],members=[];
  async function add(name,text,contentType){
   const raw=Buffer.from(text);need(raw.length<=64*1024*1024,'INVOICE_DELIVERY_DOCUMENT_CAPACITY',413);
   const path=join(directory,'part-'+files.length);await writeFile(path,raw,{flag:'wx',mode:0o600});
   const member={name,bytes:raw.length,sha256:hash(raw),contentType};members.push(member);files.push({...member,path});return member;
  }
  await add('invoice.json',json({...selected.body,revision}),'application/json');
  if(selected.body.envelope)await add('payment-request.json',JSON.stringify(selected.body.envelope),'application/json');
  if(selected.result){
   await selected.result.verify({signal});
   const result=selected.result.metadata;need(result.sha256===report.result.sha256&&result.bytes===report.result.bytes,'INVOICE_DELIVERY_RESULT_CHANGED',409);
   const member={name:report.result.member,bytes:result.bytes,sha256:result.sha256,contentType:result.contentType};
   members.push(member);files.push({...member,path:result.path});
  }
  await add('index.html',renderInvoiceDelivery(selected.body,revision,{resultMember:report.result?.member??null}),'text/html; charset=utf-8');
  await add('README.txt','MERCHANT INVOICE DELIVERY\n\nExtract the complete ZIP into one folder. Open index.html, then open the original delivered file using its native application. Keep all files together.\n\nInvoice: '+selected.body.invoice.reference+'\nOriginal invoice ID: '+invoiceId+'\nOriginal state: '+selected.body.invoice.state+'\nSelected record SHA-256: '+revision+'\n\ninvoice.json contains the complete public original invoice, frozen terms, wallet envelope and original activity. MANIFEST.json identifies every delivered member by byte count and SHA-256. The original merchant continues payment and delivery; this package preserves the selected original record edition.\n','text/plain; charset=utf-8');
  const manifest={schema:'stellar-forge.merchant-invoice-delivery-manifest.v1',owner:report.owner,invoiceId,revision,members:[...members]};
  await add('MANIFEST.json',json(manifest),'application/json');
  const archive=await zip(directory,{directory,files},signal);
  const result=new MerchantResult({...archive,fileName:'merchant-invoice-'+invoiceId+'.zip',contentType:'application/zip'});
  await result.verify({signal});
  return {operation:randomUUID(),...result.metadata,report:{...report,source:{...report.owner,revision},
   selection:{invoiceId,revision},invoiceCount:1,offerCount:report.offers.length},cleanup};
 }catch(error){await cleanup();throw error;}
}
