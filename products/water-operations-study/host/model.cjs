// MIT. Whole editable-session transactions. Storage is injected by the sole private writer.
function createManagedModel({sessions:S,applyDomain,codec:C}){
 const copy=x=>JSON.parse(JSON.stringify(x)),hash=x=>C.hashText(JSON.stringify(x));
 const need=(v,code,message,status=409)=>{if(!v)throw Object.assign(Error(message),{code,status});};
 const text=(v,n)=>typeof v==="string"&&v.length>0&&v.length<=n;
 const receive=c=>S.receive(JSON.stringify(c));
 // Keep one complete successful carrier validation, keyed by its exact serialized bytes.
 // Mutable callers must serialize again; failures and oversized inputs are never retained.
 const CARRIER_VALIDATION_LIMIT=64*1024*1024;let validatedCarrierText=null;
 function validateCarrier(carrier){const serialized=JSON.stringify(carrier);if(serialized===validatedCarrierText)return;
  S.receive(serialized);validatedCarrierText=serialized.length*2<=CARRIER_VALIDATION_LIMIT?serialized:null;
 }
 function initial(installationId,carrier){
  need(text(installationId,120),"WATER_OPERATIONS_ID","Choose the installation identity.");carrier=S.pack(receive(carrier));
  return {schema:"stellar-forge.water-operations-state.v1",installationId,sequence:0,carrier:copy(carrier),receipts:[],rejections:[]};
 }
 function validate(state){
  need(state?.schema==="stellar-forge.water-operations-state.v1"&&text(state.installationId,120)&&Number.isSafeInteger(state.sequence)&&state.sequence>=0&&Array.isArray(state.receipts)&&Array.isArray(state.rejections),"WATER_OPERATIONS_STATE","Select the complete managed session.");
  validateCarrier(state.carrier);const ids=new Set();
  for(const row of [...state.receipts,...state.rejections]){need(text(row.id,120)&&/^[a-f0-9]{64}$/.test(row.requestSha256)&&/^[a-f0-9]{64}$/.test(row.recordSha256)&&!ids.has(row.id),"WATER_OPERATIONS_HISTORY","Original request history differs.");ids.add(row.id);}
  return state;
 }
 function view(state){validate(state);return {schema:"stellar-forge.water-operations-view.v1",installationId:state.installationId,sequence:state.sequence,sha256:hash(state),carrier:copy(state.carrier),receipts:copy(state.receipts),rejections:copy(state.rejections)};}
 function request(r,state){
  need(r?.schema==="stellar-forge.water-operations-request.v1"&&r.installationId===state.installationId&&text(r.id,120)&&text(r.actor,240)&&text(r.at,40)&&Number.isFinite(Date.parse(r.at))&&/^[a-f0-9]{64}$/.test(r.baseSha256||"")&&["save","action"].includes(r.kind),"WATER_OPERATIONS_REQUEST","Retain the installation, original request ID, base SHA, actor, time and full successor.",400);
  const allowed=["schema","installationId","id","baseSha256","actor","at","kind",r.kind==="save"?"carrier":"operation"];
  need(Object.keys(r).every(k=>allowed.includes(k))&&allowed.every(k=>Object.hasOwn(r,k)),"WATER_OPERATIONS_REQUEST","Use the complete declared request fields.",400);return hash(r);
 }
 function prior(state,r){const requestSha256=request(r,state),entry=[...state.receipts,...state.rejections].find(x=>x.id===r.id);
  if(entry)need(entry.requestSha256===requestSha256,"WATER_OPERATIONS_REQUEST_CHANGED","This request ID already names different original content.");return {requestSha256,entry};
 }
 function plan(state,r){
  validate(state);const found=prior(state,r);if(found.entry)return {existing:found.entry};
  need(hash(state)===r.baseSha256,"WATER_OPERATIONS_BASE_CHANGED","The selected saved edition changed. Retain this request, refresh and deliberately select the next edition.");
  let session;
  if(r.kind==="save")session=receive(r.carrier);
  else{
   session=receive(state.carrier);const op=r.operation;
   need(op?.id===r.id&&op?.actor===r.actor&&op?.at===r.at&&/^[a-f0-9]{64}$/.test(op.expectedHead||''),"WATER_OPERATIONS_OPERATION","Domain operation must retain the request actor, time and expected workspace head.",400);
   const result=applyDomain(session.workspace,op);session=S.advance(session,result.workspace,op);
  }
  const next=copy(state);next.sequence++;next.carrier=S.pack(session);
  const record={schema:"stellar-forge.water-operations-prepared-result.v1",request:copy(r),requestSha256:found.requestSha256,sequence:next.sequence,beforeSha256:hash(state),afterCarrierSha256:next.carrier.sha256,outcome:"PREPARED_SUCCESSOR"};
  const recordSha256=hash(record);next.receipts.push({id:r.id,requestSha256:found.requestSha256,recordSha256});
  return {record,recordSha256,next};
 }
 function reject(state,r,error){
  const found=prior(state,r);need(!found.entry,"WATER_OPERATIONS_EXISTING","Reconcile the original outcome first.");
  const record={schema:"stellar-forge.water-operations-prepared-rejection.v1",request:copy(r),requestSha256:found.requestSha256,outcome:"PREPARED_REJECTION",error:{code:error.code||"WATER_OPERATIONS_INVALID_SUCCESSOR",message:error.message}};
  const recordSha256=hash(record),next=copy(state);next.rejections.push({id:r.id,requestSha256:found.requestSha256,recordSha256});return {record,recordSha256,next};
 }
 function record(state,r,retained){const p=prior(state,r);need(p.entry&&hash(retained)===p.entry.recordSha256&&retained.requestSha256===p.requestSha256&&JSON.stringify(retained.request)===JSON.stringify(r),"WATER_OPERATIONS_RECEIPT","The retained original outcome differs.");const committed=state.receipts.some(x=>x.id===r.id);need(retained.outcome===(committed?"PREPARED_SUCCESSOR":"PREPARED_REJECTION"),"WATER_OPERATIONS_RECEIPT","The selected result kind differs.");return {outcome:committed?"COMMITTED":"REJECTED_NOT_COMMITTED",record:copy(retained),state:view(state),reused:true};}
 return {initial,validate,view,request,prior,plan,reject,record,hash,copy,need};
}
module.exports={createManagedModel};
