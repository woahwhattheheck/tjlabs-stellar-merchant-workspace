// SDP-native batch preparation and receiving. Provider source pinned in PROVIDER_CONTRACT.md.
// This module has no network, account, ledger, scheduler, or storage side effects.
export const SDP_SOURCE = "stellar/stellar-disbursement-platform-backend@4330f131e8a2638a10767ec8db50a98f22672a61";
export const CONTACT_TYPES = Object.freeze(["EMAIL", "PHONE_NUMBER", "EMAIL_AND_WALLET_ADDRESS", "PHONE_NUMBER_AND_WALLET_ADDRESS"]);
export const PAYMENT_STATES = Object.freeze(["DRAFT", "READY", "PENDING", "PAUSED", "SUCCESS", "FAILED", "CANCELED"]);
export const EVENT_TYPES = Object.freeze(["disbursement.created", "disbursement.approved", "disbursement.rejected", "disbursement.submitted", "disbursement.completed", "disbursement.failed", "disbursement.paused", "wallet.created", "wallet.archived", "wallet.promoted_to_default", "wallet.membership_granted", "wallet.membership_revoked"]);
export class SDPContractError extends Error {
  constructor(code, message, detail = {}) { super(message); this.name = "SDPContractError"; this.code = code; this.detail = detail; }
}
function fail(code, message, detail) { throw new SDPContractError(code, message, detail); }
function record(v, label) { if (!v || typeof v !== "object" || Array.isArray(v)) fail("INVALID_INPUT", label + " must be an object"); return v; }
function string(v, label, {empty=false, max=4096, canonical=false} = {}) {
  if (typeof v !== "string" || (!empty && !v.length) || [...v].length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)) fail("INVALID_INPUT", label + " is not a valid string");
  if (canonical && v !== v.trim()) fail("NORMALIZATION_REQUIRED", label + " must not have surrounding whitespace");
  return v;
}
function keys(value, allowed, label) { for (const key of Object.keys(value)) if (!allowed.includes(key)) fail("UNKNOWN_FIELD", label + " contains unsupported field " + key); }
export function decimalUnits(value, {positive=true}={}) {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,7})?$/.test(value)) fail("INVALID_AMOUNT", "Amount must be an exact decimal string with at most seven fractional digits");
  const [whole, fraction=""] = value.split(".");
  const units = BigInt(whole) * 10000000n + BigInt(fraction.padEnd(7,"0"));
  if ((positive && units <= 0n) || units > 9223372036854775807n) fail("INVALID_AMOUNT", "Amount is outside the positive Stellar int64 range");
  return units;
}
export function unitsDecimal(value) {
  const units = typeof value === "bigint" ? value : BigInt(value);
  const sign=units<0n?"-":"", abs=units<0n?-units:units;
  const fraction=(abs%10000000n).toString().padStart(7,"0").replace(/0+$/,"");
  return sign + (abs/10000000n).toString() + (fraction ? "."+fraction : "");
}
export function csv(rows) {
  return rows.map(row=>row.map(value=>{const s=String(value ?? "");return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}).join(",")).join("\r\n")+"\r\n";
}
export function parseCSV(text) {
  if (typeof text !== "string" || text.includes("\u0000")) fail("INVALID_CSV","CSV must be UTF-8 text");
  if (text[0]==="\ufeff") text=text.slice(1);
  const rows=[]; let row=[], value="", quoted=false, closed=false, started=false;
  function field(){row.push(value);value="";closed=false;started=false;}
  function line(){field();if (!(row.length===1 && row[0]==="")) rows.push(row);row=[];}
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=c;continue;}
    if(closed && c!=="," && c!=="\n" && c!=="\r") fail("INVALID_CSV","Unexpected text after closing quote");
    if(c==='"'){if(started) fail("INVALID_CSV","Quote inside unquoted field");quoted=true;started=true;}
    else if(c===",")field();
    else if(c==="\r"||c==="\n"){if(c==="\r"&&text[i+1]==="\n")i++;line();}
    else{value+=c;started=true;}
  }
  if(quoted)fail("INVALID_CSV","Unclosed quoted field");
  if(started||closed||value!==""||row.length)line();
  if(!rows.length)fail("INVALID_CSV","CSV is empty");
  const headers=rows[0];
  if(new Set(headers).size!==headers.length)fail("INVALID_CSV","Duplicate CSV header");
  return {headers,rows:rows.slice(1).map((values,index)=>{if(values.length!==headers.length)fail("INVALID_CSV","CSV row has wrong field count",{line:index+2});return Object.fromEntries(headers.map((h,j)=>[h,values[j]]));})};
}
export function validateScope(value) {
  record(value,"scope");keys(value,["origin","tenantName","tenantId","sourceWalletId","networkPassphrase","asset"],"scope");
  const origin=string(value.origin,"origin",{canonical:true});
  // URL construction and HTTPS policy are enforced by the native transport.
  if (!/^https?:\/\/[^/?#]+(?:\/[^?#]*)?$/.test(origin)) fail("INVALID_SCOPE","origin must be an explicit absolute HTTP(S) base URL without query or fragment");
  const tenantName=string(value.tenantName,"tenantName",{max:255,canonical:true});
  const tenantId=string(value.tenantId,"tenantId",{max:255,canonical:true});
  const sourceWalletId=string(value.sourceWalletId,"sourceWalletId",{max:255,canonical:true});
  const networkPassphrase=string(value.networkPassphrase,"networkPassphrase",{max:255,canonical:true});
  const asset=record(value.asset,"asset");keys(asset,["id","code","issuer"],"asset");
  return {origin,tenantName,tenantId,sourceWalletId,networkPassphrase,asset:{id:string(asset.id,"asset.id",{max:255,canonical:true}),code:string(asset.code,"asset.code",{max:12,canonical:true}),issuer:string(asset.issuer,"asset.issuer",{max:56,canonical:true})}};
}
export function prepareBatch(input, {validateAddress}={}) {
  record(input,"batch");keys(input,["operationId","scope","disbursement","items"],"batch");
  const operationId=string(input.operationId,"operationId",{max:200,canonical:true}),scope=validateScope(input.scope);
  const d=record(input.disbursement,"disbursement");
  keys(d,["name","registration_contact_type","wallet_id","verification_field","receiver_registration_message_template"],"disbursement");
  const name=string(d.name,"disbursement.name",{max:255,canonical:true}),type=d.registration_contact_type;
  if(!CONTACT_TYPES.includes(type))fail("INVALID_CONTACT_TYPE","Unsupported SDP registration contact type");
  const direct=type.endsWith("_AND_WALLET_ADDRESS"),email=type.startsWith("EMAIL"),contact=email?"email":"phone";
  const request={name,asset_id:scope.asset.id,registration_contact_type:type};
  if(d.receiver_registration_message_template!==undefined)request.receiver_registration_message_template=string(d.receiver_registration_message_template,"receiver_registration_message_template",{max:255,empty:true});
  if(direct){
    if(d.wallet_id || d.verification_field)fail("INVALID_REGISTRATION","Wallet-address registration cannot set wallet_id or verification_field");
    if(typeof validateAddress!=="function")fail("ADDRESS_VALIDATOR_REQUIRED","Pass the selected original Stellar SDK address validator for wallet-address registration");
  }else{
    request.wallet_id=string(d.wallet_id,"wallet_id",{max:255,canonical:true});
    // Empty verification is supported only by the provider's selected embedded wallet.
    if(d.verification_field!==undefined)request.verification_field=string(d.verification_field,"verification_field",{max:64,canonical:true,empty:true});
  }
  if(!Array.isArray(input.items)||input.items.length<1||input.items.length>10000)fail("INVALID_BATCH_SIZE","SDP batches contain 1 to 10,000 instructions");
  const seenContact=new Set(),seenID=new Set(),seenPayment=new Set(),warnings=[],items=[];
  let total=0n;
  for(let index=0;index<input.items.length;index++){
    const item=record(input.items[index],"items["+index+"]");keys(item,["id","paymentID","amount","email","phone","verification","walletAddress","walletAddressMemo"],"item");
    const id=string(item.id,"item.id",{max:64,canonical:true}),paymentID=string(item.paymentID,"item.paymentID",{max:64,canonical:true});
    const amount=string(item.amount,"item.amount",{max:32,canonical:true});total+=decimalUnits(amount);
    const c=string(item[contact],contact,{max:320,canonical:true});
    if(c!==c.toLowerCase())fail("NORMALIZATION_REQUIRED","Use the provider's lowercase contact form explicitly",{index,field:contact});
    if(email ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c) : !/^\+[1-9][0-9]{5,14}$/.test(c))fail("INVALID_CONTACT","Invalid "+contact,{index});
    if(item[email?"phone":"email"])fail("INVALID_CONTACT","One registration contact is permitted",{index});
    if(seenContact.has(c)||seenID.has(id)||seenPayment.has(paymentID))fail("DUPLICATE_INSTRUCTION","Contact, recipient id and paymentID must each be unique in this batch",{index});
    seenContact.add(c);seenID.add(id);seenPayment.add(paymentID);
    const row={id,paymentID,amount,[contact]:c};
    if(direct){
      const address=string(item.walletAddress,"walletAddress",{max:56,canonical:true});
      if(address!==address.toUpperCase() || validateAddress(address)!==true)fail("INVALID_ADDRESS","Original SDK rejected the wallet address",{index});
      row.walletAddress=address;row.walletAddressMemo=string(item.walletAddressMemo??"","walletAddressMemo",{max:256,canonical:true,empty:true});
      if(address.startsWith("C")&&row.walletAddressMemo)fail("INVALID_MEMO","Contract recipients do not support memos",{index});
      if(item.verification)fail("INVALID_REGISTRATION","Wallet-address instructions cannot include verification",{index});
    }else{
      if(item.walletAddress||item.walletAddressMemo)fail("INVALID_REGISTRATION","This contact type cannot include wallet address fields",{index});
      if(request.verification_field)row.verification=string(item.verification,"verification",{max:4096,canonical:true});
      else if(item.verification)fail("INVALID_REGISTRATION","Verification must match the selected disbursement field",{index});
    }
    items.push(row);
  }
  if(!direct&&!request.verification_field)warnings.push("The selected SDP wallet must be embedded to omit verification; confirm the provider wallet before creation.");
  warnings.push("SDP matches existing recipients by contact. CSV id sets external_id only for a newly created recipient; verify existing contact-to-recipient mappings before starting.");
  warnings.push("Uploading instructions replaces draft payment rows and can resend registration invitations. Reconcile an uncertain upload before another dispatch.");
  const headers=["id",contact,"amount","paymentID",...(direct?["walletAddress","walletAddressMemo"]:request.verification_field?["verification"]:[])];
  const instructions=csv([headers,...items.map(item=>headers.map(h=>item[h]??""))]);
  return {schema:"commons.sdp.batch.v1",providerSource:SDP_SOURCE,operationId,scope,request,items,instructions,totalAmount:unitsDecimal(total),warnings};
}
export function verifyPrepared(prepared, options={}) {
  record(prepared,"prepared batch");
  if(prepared.schema!=="commons.sdp.batch.v1"||prepared.providerSource!==SDP_SOURCE)fail("SOURCE_MISMATCH","Unsupported prepared batch/source");
  const {asset_id,...d}=record(prepared.request,"request");
  if(asset_id!==prepared.scope?.asset?.id)fail("SCOPE_MISMATCH","Request asset differs from selected scope");
  const rebuilt=prepareBatch({operationId:prepared.operationId,scope:prepared.scope,disbursement:d,items:prepared.items},options);
  for(const k of ["scope","request","items","instructions","totalAmount"])if(JSON.stringify(rebuilt[k])!==JSON.stringify(prepared[k]))fail("PREPARED_CHANGED","Prepared batch differs from its original inputs",{field:k});
  return rebuilt;
}
export function inspectInstructions(prepared, text) {
  const actual=parseCSV(text), expected=parseCSV(prepared.instructions),differences=[];
  const allowed=new Set(expected.headers);
  for(const h of actual.headers)if(!allowed.has(h))differences.push({kind:"unexpected_column",column:h});
  for(const h of expected.headers)if(!actual.headers.includes(h))differences.push({kind:"missing_column",column:h});
  const byPayment=new Map();
  for(let i=0;i<actual.rows.length;i++){const r=actual.rows[i];if(!r.paymentID||byPayment.has(r.paymentID))differences.push({kind:"duplicate_or_missing_payment_id",line:i+2,paymentID:r.paymentID??""});else byPayment.set(r.paymentID,r);}
  for(const row of expected.rows){
    const found=byPayment.get(row.paymentID);if(!found){differences.push({kind:"missing_instruction",paymentID:row.paymentID});continue;}
    byPayment.delete(row.paymentID);
    for(const h of expected.headers)if(row[h]!==found[h])differences.push({kind:"changed_instruction",paymentID:row.paymentID,field:h,expected:row[h],actual:found[h]??null});
  }
  for(const paymentID of byPayment.keys())differences.push({kind:"unexpected_instruction",paymentID});
  return {exactBytes:text===prepared.instructions,semanticMatch:differences.length===0,expectedCount:expected.rows.length,actualCount:actual.rows.length,differences};
}
function assetMatches(actual, expected){return actual?.id===expected.id&&actual?.code===expected.code&&actual?.issuer===expected.issuer;}
export function reconcileBatch(prepared,snapshot) {
  record(prepared,"prepared batch");record(snapshot,"snapshot");
  const findings=[],items=[],scope=prepared.scope,d=snapshot.disbursement;
  const add=(kind,detail={})=>findings.push({kind,...detail});
  if(!d||typeof d.id!=="string")fail("INVALID_SNAPSHOT","Snapshot requires the complete original disbursement");
  for(const key of ["origin","tenantName","tenantId","sourceWalletId","networkPassphrase"])if(snapshot.scope?.[key]!==scope[key])add("scope_mismatch",{field:key,expected:scope[key],actual:snapshot.scope?.[key]??null});
  if(!snapshot.complete)add("incomplete_capture");
  if(d.source_wallet_id!==scope.sourceWalletId)add("source_wallet_mismatch");
  if(!assetMatches(d.asset,scope.asset))add("asset_mismatch");
  if(d.name!==prepared.request.name)add("disbursement_name_mismatch");
  if(d.registration_contact_type!==prepared.request.registration_contact_type)add("registration_contact_type_mismatch");
  if(prepared.request.wallet_id&&d.wallet?.id!==prepared.request.wallet_id)add("registration_wallet_mismatch");
  if((d.verification_field??"")!==(prepared.request.verification_field??""))add("verification_field_mismatch");
  const instructions=inspectInstructions(prepared,snapshot.instructions??"");
  for(const detail of instructions.differences)add("instruction_mismatch",detail);
  if(!Array.isArray(snapshot.payments)||!Array.isArray(snapshot.receivers))fail("INVALID_SNAPSHOT","Complete payment and receiver arrays are required");
  const selected=snapshot.payments.filter(p=>p.disbursement?.id===d.id),byPayment=new Map(),providerIDs=new Set(),providerIDCounts=new Map();
  for(const p of selected)providerIDCounts.set(p.id,(providerIDCounts.get(p.id)??0)+1);
  for(const p of selected){
    if(typeof p.id!=="string"||providerIDs.has(p.id))add("duplicate_provider_payment",{paymentId:p.id??null});
    providerIDs.add(p.id);
    const key=p.external_payment_id;
    if(!key||byPayment.has(key))add("duplicate_or_missing_external_payment_id",{paymentId:p.id,paymentID:key??null});
    else byPayment.set(key,p);
  }
  const receiverIDs=new Set(),receiverByPayment=new Map();
  for(const r of snapshot.receivers){
    if(!r||typeof r.id!=="string"||receiverIDs.has(r.id))add("duplicate_or_missing_receiver_id",{receiverId:r?.id??null});
    else receiverIDs.add(r.id);
    const paymentId=r?.payment?.id;
    if(typeof paymentId!=="string"||receiverByPayment.has(paymentId))add("duplicate_or_missing_receiver_payment",{receiverId:r?.id??null,paymentId:paymentId??null});
    else receiverByPayment.set(paymentId,r);
  }
  let successful=0n,pending=0n,failed=0n,canceled=0n,missing=0n,unclassified=0n;
  const providerTotals={successful:0n,pending:0n,failed:0n,canceled:0n},providerAmountRows=[];
  for(const payment of selected){
    const excluded=[];
    if(typeof payment.id!=="string"||!payment.id||providerIDCounts.get(payment.id)!==1)excluded.push("ambiguous_provider_payment_id");
    if(payment.source_wallet_id!==scope.sourceWalletId)excluded.push("source_wallet_mismatch");
    if(!assetMatches(payment.asset,scope.asset))excluded.push("asset_mismatch");
    let amount;try{amount=decimalUnits(payment.amount);}catch{excluded.push("invalid_amount");}
    if(!PAYMENT_STATES.includes(payment.status))excluded.push("unknown_payment_status");
    const category=payment.status==="SUCCESS"?"successful":payment.status==="FAILED"?"failed":payment.status==="CANCELED"?"canceled":"pending";
    if(!excluded.length)providerTotals[category]+=amount;
    providerAmountRows.push({paymentId:payment.id??null,paymentID:payment.external_payment_id??null,providerAmount:payment.amount??null,status:payment.status??null,included:excluded.length===0,category:excluded.length?null:category,excluded});
    for(const reason of excluded)add("provider_amount_excluded",{paymentId:payment.id??null,paymentID:payment.external_payment_id??null,reason});
  }
  for(const expected of prepared.items){
    const payment=byPayment.get(expected.paymentID),problems=[];
    if(!payment){missing+=decimalUnits(expected.amount);add("missing_payment",{paymentID:expected.paymentID});items.push({paymentID:expected.paymentID,recipientExternalId:expected.id,expectedAmount:expected.amount,status:"MISSING",problems:["missing_payment"]});continue;}
    byPayment.delete(expected.paymentID);
    if(payment.source_wallet_id!==scope.sourceWalletId)problems.push("source_wallet_mismatch");
    if(!assetMatches(payment.asset,scope.asset))problems.push("asset_mismatch");
    let actualAmount;try{actualAmount=decimalUnits(payment.amount);}catch{problems.push("invalid_amount");}
    if(actualAmount!==decimalUnits(expected.amount))problems.push("amount_mismatch");
    if(!PAYMENT_STATES.includes(payment.status))problems.push("unknown_payment_status");
    const wallet=payment.receiver_wallet;
    if(!wallet?.id)problems.push("missing_receiver_wallet");
    if(expected.walletAddress&&wallet?.stellar_address!==expected.walletAddress)problems.push("wallet_address_mismatch");
    if(expected.walletAddress && (wallet?.stellar_memo??"")!==(expected.walletAddressMemo??""))problems.push("wallet_memo_mismatch");
    const receiver=receiverByPayment.get(payment.id);
    if(!receiver)problems.push("missing_payment_receiver");
    else {
      receiverByPayment.delete(payment.id);
      const field=expected.email?"email":"phone_number",contact=expected.email??expected.phone;
      if(receiver[field]!==contact)problems.push("receiver_contact_mismatch");
      // An existing contact keeps its earlier external_id. Show that mapping; never
      // silently overwrite it or use it as the sole payment-to-payroll join.
      if(receiver.receiver_wallet?.id!==wallet?.id||wallet?.receiver?.id!==receiver.id)problems.push("receiver_wallet_binding_mismatch");
      if(receiver.payment?.external_payment_id!==expected.paymentID)problems.push("receiver_payment_binding_mismatch");
      if(receiver.payment?.status!==payment.status||receiver.payment?.amount!==payment.amount)problems.push("receiver_payment_changed_during_capture");
      if(receiver.receiver_wallet?.stellar_address!==wallet?.stellar_address||(receiver.receiver_wallet?.stellar_memo??"")!==(wallet?.stellar_memo??""))problems.push("receiver_wallet_changed_during_capture");
    }
    const transaction=payment.stellar_transaction_id??"";
    if(payment.status==="SUCCESS"&&!/^[0-9a-fA-F]{64}$/.test(transaction))problems.push("successful_payment_missing_transaction");
    for(const kind of problems)add(kind,{paymentID:expected.paymentID,paymentId:payment.id});
    const units=decimalUnits(expected.amount);
    if(payment.status==="SUCCESS")successful+=units;
    else if(payment.status==="FAILED")failed+=units;
    else if(payment.status==="CANCELED")canceled+=units;
    else if(PAYMENT_STATES.includes(payment.status))pending+=units;
    else unclassified+=units;
    items.push({paymentID:expected.paymentID,recipientExternalId:expected.id,paymentId:payment.id,receiverWalletId:wallet?.id??null,receiverId:receiver?.id??null,providerRecipientExternalId:receiver?.external_id??null,externalRecipientIdMatches:receiver?.external_id===expected.id,expectedContact:expected.email??expected.phone,expectedAmount:expected.amount,providerAmount:payment.amount,status:payment.status,stellarTransactionId:transaction,stellarOperationId:payment.stellar_operation_id??"",problems});
  }
  for(const [paymentId,receiver] of receiverByPayment)add("unexpected_receiver_payment",{paymentId,receiverId:receiver.id});
  for(const payment of byPayment.values())add("unexpected_payment",{paymentId:payment.id,paymentID:payment.external_payment_id});
  if(d.total_payments!==undefined&&String(d.total_payments)!==String(selected.length))add("provider_count_mismatch",{declared:d.total_payments,observed:selected.length});
  return {schema:"commons.sdp.reconciliation.v1",operationId:prepared.operationId,disbursementId:d.id,providerStatus:d.status,capturedAt:snapshot.finishedAt,complete:snapshot.complete===true,instructions,counts:{expected:prepared.items.length,payments:selected.length,receivers:receiverIDs.size},amounts:{expected:prepared.totalAmount,providerSuccessful:unitsDecimal(providerTotals.successful),providerPending:unitsDecimal(providerTotals.pending),providerFailed:unitsDecimal(providerTotals.failed),providerCanceled:unitsDecimal(providerTotals.canceled),missing:unitsDecimal(missing)},obligationAmounts:{successful:unitsDecimal(successful),pending:unitsDecimal(pending),failed:unitsDecimal(failed),canceled:unitsDecimal(canceled),missing:unitsDecimal(missing),unclassified:unitsDecimal(unclassified)},providerAmountRows,items,findings,requiresReview:findings.length>0,chainConfirmationRequired:items.filter(x=>x.status==="SUCCESS").map(x=>({paymentID:x.paymentID,transactionHash:x.stellarTransactionId,operationId:x.stellarOperationId})),interpretation:"Provider SUCCESS is a provider observation. Match each full transaction through the original Horizon reconciliation and the existing payroll transaction before crediting or closing a ledger item."};
}
