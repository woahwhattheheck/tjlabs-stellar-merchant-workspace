import { RozoFinanceService, ROZO_FINANCE_COMMANDS } from './finance-service.mjs';
import { VERSION, assert, fail, id, text, fields, integer, iso, canonical, jsonDigest, digest, clone, newId, validateProfile, validateOrder, validateDecision, merchantCreateBody, validatePayment, settlementRow, findAsset, PAYMENT_STATUSES } from './model.mjs';
import { connectionFor, connectionBinding, requireProfileConnection, merchantCall, readPayment, readOriginalOrder, paymentPage, receiveCallback, capturedHttp } from './provider.mjs';
import { nativeBinding, runNative, selectCheckoutLink } from './checkout.mjs';
import { acquireLease, withLease } from './lease.mjs';
import { createReport, reportFiles, compareReports } from './reports.mjs';
import { decoderBinding, stellarJobInput, captureStellar, contractProjection } from './stellar.mjs';

export const STATE_SCHEMA='stellar-forge.rozo-payments-state.v1';
export const COMMANDS=['profile.save','order.save','orders.import','decision.save','payment.attach','merchant.create','merchant.register','payment.refresh','payment.lookup','checkout.create','checkout.quote','checkout.status','checkout.resume','native.recover','sdk.fee','sdk.create','sdk.refresh','sdk.register','capture.payments','capture.active','capture.stellar','schedule.save','report.save','evidence.link','workspace.export','workspace.handover',...ROZO_FINANCE_COMMANDS];
const external=new Set(['merchant.create','merchant.register','payment.refresh','payment.lookup','checkout.create','checkout.quote','checkout.status','checkout.resume','native.recover','sdk.fee','sdk.create','sdk.refresh','sdk.register','capture.payments','capture.active','capture.stellar']);
const pending=(workspace,request,reason)=>({schema:'stellar-forge.rozo-pending-result.v1',state:'pending',workspaceId:workspace.meta().workspaceId,requestId:request.id,fingerprint:request.fingerprint,reason});
function fileBytes(file){
  fields(file,['name','base64','bytes','sha256'],'source file');text(file.name,'original file name',300);integer(file.bytes,'file bytes',0,32*1024*1024);
  const raw=Buffer.from(file.base64,'base64');assert(raw.toString('base64')===file.base64&&raw.length===file.bytes&&digest(raw)===file.sha256,'FILE_IDENTITY','The full original file bytes do not match their identity.');
  return raw;
}
export function parseCSV(bytes){
  const input=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');const rows=[];let row=[],field='',quoted=false,afterQuote=false;
  for(let i=0;i<input.length;i++){
    const c=input[i];
    if(quoted){if(c==='"'){if(input[i+1]==='"'){field+='"';i++;}else{quoted=false;afterQuote=true;}}else field+=c;continue;}
    if(c==='"'){assert(field.length===0&&!afterQuote,'CSV_QUOTE','An unquoted CSV value contains a quote.');quoted=true;continue;}
    if(c===','){row.push(field);field='';afterQuote=false;continue;}
    if(c==='\r'||c==='\n'){if(c==='\r'&&input[i+1]==='\n')i++;row.push(field);rows.push(row);row=[];field='';afterQuote=false;continue;}
    assert(!afterQuote,'CSV_QUOTE','Only a delimiter can follow a closed CSV quote.');field+=c;
  }
  assert(!quoted,'CSV_QUOTE','The original CSV ends inside a quoted value.');
  if(field!==''||row.length){row.push(field);rows.push(row);}
  assert(rows.length>0,'CSV_EMPTY','The original CSV is empty.');const headers=rows.shift();assert(new Set(headers).size===headers.length&&headers.every(Boolean),'CSV_HEADERS','Original CSV headers must be unique and nonempty.');
  return {headers,rows:rows.filter(r=>r.some(Boolean)).map((values,index)=>{assert(values.length===headers.length,'CSV_WIDTH','CSV row '+(index+2)+' has another column count.');return {line:index+2,values:Object.fromEntries(headers.map((h,i)=>[h,values[i]]))};})};
}
function nativeResultId(result){return result?.result?.paymentId??null;}
function definitivelyRejectedCreate(request){
  const result=request.result?.result;
  return request.envelope?.command==='merchant.create'&&request.state==='accepted'&&result?.outcome==='provider_rejected'&&[400,401,403,404,422,429].includes(result.nativeStatus);
}
function requestSummary(r){return {id:r.id,fingerprint:r.fingerprint,command:r.envelope.command,actor:r.envelope.actor,expectedRevision:r.envelope.expectedRevision,profileId:r.intent?.profile?.id??r.envelope.payload?.profileId??null,state:r.state,createdAt:r.createdAt,updatedAt:r.updatedAt,attempts:r.attempts.map(a=>({number:a.number,kind:a.kind,state:a.state,startedAt:a.startedAt,endedAt:a.endedAt})),resultRevision:r.result?.revision??null};}
function nativeCreateDispatched(workspace,requestId){
  return workspace.capturesFor(requestId).some(c=>c.kind==='native_dispatch'&&c.request.method==='POST'&&(/\/create-invoice(?:\?|$)/.test(c.request.url)||(/\/payment-api(?:\/payments)?(?:\?|$)/.test(c.request.url)&&!c.request.url.includes('dryrun'))));
}
export class RozoService {
  constructor({workspace,connections={},environment=process.env,publisherSelections={},fetchImpl=globalThis.fetch,sourceIdentity=null,delivery={},accounting=null,buyer=null,accountingId=null,buyerId=null}){
    this.finance=new RozoFinanceService({workspace,accounting,buyer,accountingId,buyerId});
    this.workspace=workspace;this.connections=connections;this.environment=environment;this.publisherSelections=publisherSelections;this.fetchImpl=fetchImpl;this.sourceIdentity=sourceIdentity;this.delivery=delivery;this.transferring=false;this.active=new Map();this.closed=false;this.stop=new AbortController();this.watchTimer=null;this.watchRunning=null;
  }
  profile(profileId){id(profileId,'profileId');const p=this.workspace.get('profile',profileId);assert(p,'PROFILE_MISSING','Save or select the original merchant profile.',404);return p;}
  connection(profile){const c=connectionFor(this.connections,profile.connection,this.environment);requireProfileConnection(profile,c);return c;}
  nativeSelection(profile,connection){const rows=this.publisherSelections[connection.publisher];assert(Array.isArray(rows)&&rows.length,'PUBLISHER_SELECTION','Configure the complete original publisher file selection.',409);return rows;}
  profileRequests(profileId){
    return this.workspace.db.prepare("SELECT id FROM requests WHERE json_extract(intent,'$.profile.id')=? ORDER BY created_at,id").all(profileId).map(r=>this.workspace.request(r.id));
  }
  rows(profileId){
    const profile=this.profile(profileId).value,observations=this.workspace.observations(profileId),orders=this.workspace.list('order',{all:true}).items.filter(x=>x.value.profileId===profileId),decisions=this.workspace.list('decision',{all:true}).items.filter(x=>x.value.profileId===profileId).map(x=>({...x.value,revision:x.workspaceRevision})),links=this.workspace.list('link',{all:true}).items.filter(x=>x.value.profileId===profileId);
    const nativeOrders=new Map(this.profileRequests(profileId).filter(r=>r.state==='accepted'&&r.intent?.order&&nativeResultId(r.result)).map(r=>[nativeResultId(r.result),r.intent.order]));
    const ids=new Set(observations.filter(o=>['payment','callback','checkout_receipt'].includes(o.kind)).map(o=>o.identity));
    for(const link of links)ids.add(link.value.paymentId);
    return [...ids].map(paymentId=>{
      const source=observations.filter(o=>o.identity===paymentId),native=source.filter(o=>o.kind==='payment').sort((a,b)=>b.sequence-a.sequence)[0]?.value,link=links.find(x=>x.value.paymentId===paymentId)?.value;
      const order=orders.find(x=>x.value.id===link?.orderId)?.value??nativeOrders.get(paymentId)??orders.find(x=>x.value.orderId===native?.orderId)?.value??null;
      const row=settlementRow({profile,order,paymentId,observations:source,decisions:decisions.filter(d=>d.paymentId===paymentId)});
      const linked=this.workspace.list('evidence-link',{all:true}).items.filter(x=>x.value.profileId===profileId&&x.value.paymentId===paymentId).map(x=>x.value);
      return {...row,contractLinks:linked};
    }).sort((a,b)=>(Date.parse(b.createdAt??'')||0)-(Date.parse(a.createdAt??'')||0)||a.paymentId.localeCompare(b.paymentId));
  }
  state({profileId=null,offset=0,limit=100,query='',status=null,unresolved=false}={}){
    integer(offset,'offset');integer(limit,'limit',1,200);const profiles=this.workspace.list('profile',{all:true}).items;
    let selected=null,rows=[];
    if(profileId){selected=this.profile(profileId);rows=this.rows(profileId);if(query)rows=rows.filter(r=>[r.paymentId,r.orderId,r.status].some(v=>String(v??'').toLowerCase().includes(query.toLowerCase())));if(status)rows=rows.filter(r=>r.status===status);if(unresolved)rows=rows.filter(r=>r.unresolved.length);}
    const requests=this.workspace.requests({limit:200}).items;
    return {schema:STATE_SCHEMA,workspace:this.workspace.meta(),sourceIdentity:this.sourceIdentity,finance:{accountingId:this.finance.accountingId,buyerId:this.finance.buyerId},profiles,selected,
      connections:Object.entries(this.connections).map(([alias,c])=>({alias,type:c.type,appId:c.appId??null,hasWebhookSecret:Boolean(c.webhookSecretEnv&&this.environment[c.webhookSecretEnv]),publisher:c.publisher??null})),
      payments:{total:rows.length,offset,limit,nextOffset:offset+limit<rows.length?offset+limit:null,items:rows.slice(offset,offset+limit)},
      orders:profileId?this.workspace.list('order',{all:true}).items.filter(r=>r.value.profileId===profileId):[],
      captures:profileId?this.workspace.list('capture',{all:true}).items.filter(r=>r.value.profileId===profileId):[],
      reports:profileId?this.workspace.list('report',{all:true}).items.filter(r=>r.value.profileId===profileId).map(r=>({id:r.value.id,title:r.value.title,period:r.value.period,sha256:r.value.sha256,createdAt:r.value.createdAt,actor:r.value.actor,counts:r.value.counts,files:r.value.files??[],version:r.version})):[],
      schedules:this.workspace.list('schedule',{all:true}).items.filter(r=>!profileId||r.value.profileId===profileId),
      requests:requests.map(requestSummary),requestPage:{total:this.workspace.requests({limit:1}).total,nextOffset:requests.length===200?200:null},
      control:this.workspace.get('control','operator')?.value??{id:'operator',mode:'active'},
      deliveries:this.workspace.list('delivery',{all:true}).items.map(r=>r.value),
      pending:this.workspace.db.prepare("SELECT id FROM requests WHERE state!='accepted' ORDER BY created_at").all().map(r=>requestSummary(this.workspace.request(r.id))),
      active:[...this.active.keys()]};
  }
  payment(profileId,paymentId){
    text(paymentId,'paymentId');const row=this.rows(profileId).find(r=>r.paymentId===paymentId);assert(row,'PAYMENT_MISSING','No original source is retained for this payment.',404);
    return {row,observations:this.workspace.observations(profileId,{identity:paymentId}),decisions:this.workspace.list('decision',{all:true}).items.filter(x=>x.value.profileId===profileId&&x.value.paymentId===paymentId)};
  }
  requestStatus(requestId){const request=this.workspace.request(requestId);return request?{state:request.state==='accepted'?'accepted':'pending',workspaceId:this.workspace.meta().workspaceId,requestId,request,fingerprint:request.fingerprint,result:request.result}:{state:'not_found',workspaceId:this.workspace.meta().workspaceId,requestId};}
  execute(envelope,options={}){
    assert(!this.closed,'SERVICE_CLOSED','This operator has closed.',409);
    assert(COMMANDS.includes(envelope.command),'COMMAND','Select a supported original operation.');
    const replay=this.workspace.replay(envelope);if(replay?.state==='accepted'){if(envelope.command.startsWith('workspace.'))return this.exportWorkspace(envelope);if(envelope.command==='native.recover')this.finalizeRecovery(replay);return Promise.resolve({...replay.result,reused:true});}
    if(this.active.has(envelope.requestId))return this.active.get(envelope.requestId);
    const transfer=['workspace.handover','workspace.export'].includes(envelope.command);
    assert(transfer||(!this.transferring&&this.workspace.get('control','operator')?.value.mode!=='sealed'),'WORKSPACE_SEALED','This workspace is handing over. Finish its original delivery or use the received owner.',409);
    const promise=Promise.resolve().then(()=>this.perform(envelope,options)).catch(error=>{
      const retained=this.workspace.request(envelope.requestId);
      if(retained?.state==='accepted'&&!envelope.command.startsWith('workspace.')){if(envelope.command==='native.recover')this.finalizeRecovery(retained);return {...retained.result,reused:true};}
      error.details={...error.details,requestId:envelope.requestId,requestState:retained?'pending':'rejected'};throw error;
    }).finally(()=>this.active.delete(envelope.requestId));
    this.active.set(envelope.requestId,promise);return promise;
  }
  async perform(envelope,options){
    const w=this.workspace,p=envelope.payload;
    if(envelope.command.startsWith('finance.'))return this.finance.execute(envelope);
    if(envelope.command.startsWith('workspace.'))return this.exportWorkspace(envelope);
    if(!external.has(envelope.command))return w.commit(envelope,context=>{
      switch(envelope.command){
        case 'profile.save':{
          const profile=validateProfile(p);const c=this.connection(profile);
          const old=w.get('profile',profile.id);if(old)assert(old.value.type===profile.type&&old.value.connection===profile.connection&&old.value.appId===profile.appId,'PROFILE_IDENTITY','A different provider/app/connection needs a distinct profile id.',409);
          return {profile:context.put('profile',profile),connection:connectionBinding(c)};
        }
        case 'order.save':{
          const profile=this.profile(p.profileId).value,order=validateOrder(p,profile);
          const existing=w.list('order',{all:true}).items.find(r=>r.value.profileId===profile.id&&r.value.orderId===order.orderId&&r.value.id!==order.id);assert(!existing,'ORDER_DUPLICATE','The original app/orderId is already retained as '+existing?.value.id+'.',409);
          return {order:context.put('order',order)};
        }
        case 'orders.import':{
          fields(p,['profileId','file','columns'],'order intake');const profile=this.profile(p.profileId).value;
          assert(profile.type==='merchant-key-v2','ORDER_INTAKE_PROFILE','This CSV format receives original keyed merchant orders. Native Checkout retains invoice-specific inputs separately.');
          const raw=fileBytes(p.file),csv=parseCSV(raw);fields(p.columns,['orderId','title','chainId','tokenSymbol','amount','fulfilmentRef'],'columns');
          for(const k of ['orderId','title','chainId','tokenSymbol','amount'])assert(csv.headers.includes(p.columns[k]),'COLUMN_MISSING','Map the original '+k+' column.');
          assert(csv.rows.length<=100000,'INTAKE_LIMIT','Receive at most 100,000 original rows per explicit intake.');
          const orders=csv.rows.map(row=>{const v=row.values,c=p.columns;return validateOrder({id:'order-'+jsonDigest({profileId:profile.id,orderId:v[c.orderId]}),profileId:profile.id,orderId:v[c.orderId],title:v[c.title],source:{chainId:v[c.chainId],tokenSymbol:v[c.tokenSymbol],amount:v[c.amount]},...(c.fulfilmentRef&&v[c.fulfilmentRef]?{fulfilmentRef:v[c.fulfilmentRef]}:{})},profile);});
          assert(new Set(orders.map(o=>o.orderId)).size===orders.length,'ORDER_DUPLICATE','The selected intake repeats an original orderId.');
          const existingOrders=new Map(w.list('order',{all:true}).items.filter(x=>x.value.profileId===profile.id).map(x=>[x.value.orderId,x]));
          for(const order of orders){const old=existingOrders.get(order.orderId);assert(!old||canonical(old.value)===canonical(order),'ORDER_INTAKE_CONFLICT','Review existing order '+order.orderId+' through its original saved record.',409);if(!old)context.put('order',order);}
          const source=w.object(raw,'text/csv');return {source:{name:p.file.name,...source},rows:orders.length,orderIds:orders.map(o=>o.id),columns:clone(p.columns)};
        }
        case 'payment.attach':{
          fields(p,['profileId','paymentId','orderId'],'payment attachment');this.profile(p.profileId);text(p.paymentId,'paymentId');
          const order=w.get('order',p.orderId);assert(order?.value.profileId===p.profileId,'ORDER_MISSING','Choose this profile’s retained original order.');
          const old=w.get('link','link-'+jsonDigest({profileId:p.profileId,paymentId:p.paymentId}));assert(!old||old.value.orderId===p.orderId,'PAYMENT_LINK','The original payment is already linked to another order.',409);
          return {link:context.put('link',{id:'link-'+jsonDigest({profileId:p.profileId,paymentId:p.paymentId}),profileId:p.profileId,paymentId:p.paymentId,orderId:p.orderId})};
        }
        case 'evidence.link':{
          fields(p,['id','profileId','paymentId','observationId','side','reason'],'contract evidence link');id(p.id);text(p.reason,'evidence reason',4000);
          assert(['source','destination'].includes(p.side),'EVIDENCE_SIDE','Select the actual payment side.');
          const row=this.payment(p.profileId,p.paymentId).row,observation=w.observation(p.observationId);
          assert(observation?.profileId===p.profileId&&['stellar_event','stellar_transaction'].includes(observation.kind),'EVIDENCE_SOURCE','Select an original retained Stellar source from this profile.');
          const expected=p.side==='source'?row.sourcePayment.txHash:row.destinationPayout.txHash;
          const value=observation.value,actual=value.hash??value.proof?.hash??value.txHash??value.raw?.txHash??value.decoded?.txHash??observation.identity;
          assert(expected&&actual===expected,'EVIDENCE_TRANSACTION','The original evidence must name this exact observed transaction.',409);
          assert(!w.get('evidence-link',p.id),'EVIDENCE_EXISTS','An evidence link is immutable.',409);
          return {link:context.put('evidence-link',{...clone(p),observationSha256:observation.sha256,paymentBasisSha256:row.sourceSha256,actor:context.actor,createdAt:context.at})};
        }
        case 'decision.save':{
          const row=this.payment(p.profileId,p.paymentId).row,decision=validateDecision(p,row);
          assert(!w.get('decision',decision.id),'DECISION_EXISTS','Each retained correction has its own immutable identity.',409);
          if(decision.supersedes){const prior=w.get('decision',decision.supersedes);assert(prior?.value.profileId===p.profileId&&prior.value.paymentId===p.paymentId,'DECISION_PREDECESSOR','Select a decision for this exact payment.');assert(!w.list('decision',{all:true}).items.some(x=>x.value.supersedes===decision.supersedes),'DECISION_SUPERSEDED','This decision already has a following edition.',409);}
          return {decision:context.put('decision',{...decision,actor:context.actor,createdAt:context.at,revision:context.revision})};
        }
        case 'schedule.save':{
          fields(p,['id','profileId','enabled','intervalSeconds','lookbackHours'],'recurring catch-up');id(p.id);const profile=this.profile(p.profileId).value;assert(profile.type==='merchant-key-v2','SCHEDULE_PROFILE','Whole-period catch-up uses the original keyed merchant list. Native Checkout can be refreshed explicitly by its original identifiers.');
          integer(p.intervalSeconds,'intervalSeconds',15,86400);integer(p.lookbackHours,'lookbackHours',1,24*366);assert(typeof p.enabled==='boolean','SCHEDULE_ENABLED','Choose an explicit catch-up state.');
          const prior=w.get('schedule',p.id);if(prior)assert(prior.value.profileId===p.profileId,'SCHEDULE_IDENTITY','A schedule id belongs to its original profile.');
          return {schedule:context.put('schedule',{...clone(p),generation:context.revision,nextRunAt:context.at,lastRequestId:prior?.value.lastRequestId??null})};
        }
        case 'report.save':{
          const profile=this.profile(p.profileId),report=createReport({workspace:w,profile,rows:this.rows(p.profileId),input:p,actor:context.actor,revision:context.revision,now:context.at});
          const files=reportFiles(w,report);return {report:context.put('report',{...report,files}),files};
        }
        default:fail('COMMAND','Unknown local operation.');
      }
    });
    let request=w.replay(envelope);
    if(!request){const intent=await this.prepareIntent(envelope);request=w.prepare(envelope,intent);}
    return withLease(w,'request:'+request.id,async()=>{
      const current=w.request(request.id);if(current.state==='accepted')return current.result;
      const profile=current.intent.profile,c=this.connection(profile);
      if(current.intent.connection)assert(canonical(connectionBinding(c))===canonical(current.intent.connection),'CONNECTION_CHANGED','Restore the original provider binding before resuming this saved request.',409);
      const opts={signal:this.stop.signal,fetchImpl:this.fetchImpl};
      switch(envelope.command){
        case 'merchant.create':return withLease(w,'merchant:'+profile.connection,()=>this.createMerchant(current,profile,c,options,opts));
        case 'merchant.register':return withLease(w,'merchant:'+profile.connection,()=>this.registerMerchant(current,profile,c,options,opts));
        case 'payment.refresh':return this.refresh(current,profile,c,opts);
        case 'payment.lookup':return this.lookup(current,profile,c,opts);
        case 'capture.payments':return withLease(w,'merchant:'+profile.connection,()=>this.capturePayments(current,profile,c,opts));
        case 'capture.active':return withLease(w,'merchant:'+profile.connection,()=>this.captureActive(current,profile,c,opts));
        case 'capture.stellar':{
          const stellar=connectionFor(this.connections,profile.stellar.connection,this.environment);assert(canonical(connectionBinding(stellar))===canonical(current.intent.stellarConnection),'CONNECTION_CHANGED','Restore the original Stellar RPC connection.',409);
          return withLease(w,'stellar:'+profile.stellar.connection,()=>captureStellar(w,current,profile,stellar,opts));
        }
        default:{
          const nr=current.intent.nativeRequest;
          if(nr.mode==='create'&&nativeCreateDispatched(w,current.id))return pending(w,current,'The original native create has been dispatched. Retain its response/local state; use Native recovery with the actual original payment identity.');
          const result=await runNative(w,current,{profile,connection:c,publisherFiles:this.nativeSelection(profile,c),...nr,environment:this.environment,signal:this.stop.signal});
          if(envelope.command==='native.recover'&&result?.result)this.finalizeRecovery(w.request(current.id));
          return result;
        }
      }
    });
  }
  finalizeRecovery(request){
    const source=this.workspace.request(request.intent.originalRequestId),result=request.result.result,snapshot=result.native?.payload?.snapshot;
    assert(source&&snapshot?.rozoPaymentId===request.intent.nativeRequest.selection.rozoPaymentId&&snapshot?.originalBinding?.linkId===request.intent.expectedLinkId&&snapshot?.originalBinding?.paymentId===request.intent.nativeRequest.selection.rozoPaymentId&&snapshot?.authoritativeView,'NATIVE_RECOVERY_IDENTITY','The retained original native recovery does not prove the requested invoice/payment.',409);
    if(source.state==='accepted'){assert(source.result.result.paymentId===result.paymentId,'NATIVE_RECOVERY_IDENTITY','Another accepted original result has a different payment identity.',409);return source.result;}
    return this.workspace.complete(source.id,{...result,recoveredBy:request.id,originalRequestId:source.id});
  }
  async prepareIntent(envelope){
    const p=envelope.payload;fields(p,Object.keys(p),'payload');const profile=this.profile(p.profileId).value,c=this.connection(profile);
    const base={schema:VERSION+'.prepared-intent',profile:clone(profile),connection:connectionBinding(c),preparedAt:this.workspace.now()};
    if(['merchant.create','checkout.create','checkout.quote','sdk.create','sdk.fee'].includes(envelope.command)){
      fields(p,['profileId','orderId'],'create selection');const order=this.workspace.get('order',p.orderId);assert(order?.value.profileId===profile.id,'ORDER_MISSING','Select this profile’s saved original order.',404);
      base.order=clone(order.value);base.orderVersion=order.version;base.orderSha256=order.sha256;
      if(envelope.command.endsWith('.create')){
        const old=this.profileRequests(profile.id).find(r=>r.envelope.command.endsWith('.create')&&r.intent?.order?.id===order.value.id&&!definitivelyRejectedCreate(r));
        assert(!old,'ORIGINAL_CREATE_EXISTS','This saved order already has its original create operation.',409,{requestId:old?.id});
      }
      if(envelope.command==='merchant.create'){assert(profile.type==='merchant-key-v2','PROFILE_TYPE','Select the merchant Orders API profile.');return {...base,body:merchantCreateBody(profile,order.value)};}
      if(envelope.command.startsWith('checkout.')){
        assert(profile.type==='checkout-mpp-0.1.21','PROFILE_TYPE','Select the original Checkout profile.');const mode=envelope.command==='checkout.create'?'create':'quote';
        const argv=['--url',order.value.checkout.url];if(mode==='create')argv.push('--chain',order.value.source.chainId,'--token',order.value.source.tokenSymbol);
        if(mode==='create'&&order.value.checkout.email)argv.push('--email',order.value.checkout.email);if(mode==='create'&&order.value.checkout.utmSource)argv.push('--utm-source',order.value.checkout.utmSource);
        const originalLink=await selectCheckoutLink(c,this.nativeSelection(profile,c),order.value.checkout.url);
        return {...base,originalLinkId:originalLink.linkId,nativeBinding:nativeBinding(c,this.nativeSelection(profile,c)),nativeRequest:{mode,argv,selection:{},args:[]}};
      }
      assert(profile.type==='intent-common-0.1.43','PROFILE_TYPE','Select the original Common SDK.');
      const to=order.value.expectedDestination,sourceAsset=findAsset(profile,order.value.source);assert(to?.chainId&&to?.amount&&to?.receiverAddress,'SDK_DESTINATION','The original SDK requires an explicit destination chain, amount and address.');
      const targetAsset=findAsset(profile,to);assert(targetAsset,'SDK_DESTINATION','Select one exact original destination asset.');
      const params={toChain:Number(to.chainId),toToken:targetAsset.tokenAddress,toAddress:to.receiverAddress,toUnits:to.amount,preferredChain:Number(order.value.source.chainId),preferredTokenAddress:sourceAsset.tokenAddress,preferredAmountUnits:order.value.source.amount,appId:profile.appId,orderId:order.value.orderId,title:order.value.title,feeType:'exactIn',...(to.receiverMemo?{receiverMemo:to.receiverMemo}:{})};text(params.appId,'original SDK appId');
      return {...base,nativeBinding:nativeBinding(c,this.nativeSelection(profile,c)),nativeRequest:{mode:envelope.command==='sdk.create'?'create':'quote',method:envelope.command==='sdk.create'?'createPayment':'getFee',args:[params],argv:[],selection:{},sdkVersion:'v2'}};
    }
    if(envelope.command==='merchant.register'){
      fields(p,['profileId','paymentId','txHash','fromAddress'],'payin registration');assert(profile.type==='merchant-key-v2','PROFILE_TYPE','Select the merchant Orders API.');
      for(const k of ['paymentId','txHash','fromAddress'])text(p[k],k,500);return {...base,paymentId:p.paymentId,body:{txHash:p.txHash,fromAddress:p.fromAddress}};
    }
    if(envelope.command==='payment.refresh'){
      fields(p,['profileId','paymentId'],'payment refresh');text(p.paymentId,'paymentId');assert(['merchant-key-v2','rozo-testnet-v1'].includes(profile.type),'PROFILE_TYPE','Use the original native status action for Checkout or Common SDK.');
      return {...base,paymentId:p.paymentId};
    }
    if(envelope.command==='payment.lookup'){
      fields(p,['profileId','sourceTxHash','destinationTxHash','txHash','receiverAddress','receiverMemo'],'original lookup');assert(profile.type==='merchant-key-v2','PROFILE_TYPE','Select the merchant Orders API.');
      const hashes=['sourceTxHash','destinationTxHash','txHash'].filter(k=>p[k]);assert(hashes.length===1||(!hashes.length&&p.receiverAddress&&p.receiverMemo),'LOOKUP_INPUT','Select one original transaction hash, or the original address and memo pair.');
      const query=Object.fromEntries(Object.entries(p).filter(([k])=>k!=='profileId'));for(const [k,v]of Object.entries(query))text(v,k,500);return {...base,query};
    }
    if(envelope.command==='capture.payments'||envelope.command==='capture.active'){
      fields(p,envelope.command==='capture.payments'?['id','profileId','fromDate','toDate','limit','status']:['id','profileId'],'payment capture');assert(profile.type==='merchant-key-v2','PROFILE_TYPE','Whole capture uses the original keyed merchant list.');id(p.id,'capture id');assert(!this.workspace.get('capture',p.id),'CAPTURE_EXISTS','Reuse the original capture request, or choose a following capture id.',409);
      if(envelope.command==='capture.active')return {...base,job:{id:p.id,profileId:profile.id,paymentIds:this.rows(profile.id).map(r=>r.paymentId)}};
      const fromDate=iso(p.fromDate,'fromDate'),toDate=iso(p.toDate,'toDate');assert(fromDate<=toDate,'CAPTURE_PERIOD','The capture end precedes its start.');integer(p.limit??100,'limit',1,100);if(p.status)text(p.status,'original provider status');
      return {...base,job:{id:p.id,profileId:profile.id,fromDate,toDate,limit:p.limit??100,status:p.status??null}};
    }
    if(envelope.command==='capture.stellar'){
      const job=stellarJobInput(p,profile),sc=connectionFor(this.connections,profile.stellar.connection,this.environment);
      return {...base,job,stellarConnection:connectionBinding(sc),decoder:decoderBinding(sc)};
    }
    if(['checkout.status','checkout.resume','sdk.refresh','sdk.register','native.recover'].includes(envelope.command)){
      const allowed=envelope.command==='native.recover'?['profileId','originalRequestId','paymentId','linkId','provider']:envelope.command==='sdk.register'?['profileId','paymentId','txHash','senderAddress']:['profileId','paymentId','linkId','provider'];
      fields(p,allowed,'native original selection');text(p.paymentId,'paymentId');
      const binding=nativeBinding(c,this.nativeSelection(profile,c));let nativeRequest;
      if(profile.type==='checkout-mpp-0.1.21'){
        assert(['checkout.status','checkout.resume','native.recover'].includes(envelope.command),'PROFILE_TYPE','Select a Checkout operation.');
        const selection={rozoPaymentId:p.paymentId,...(p.linkId?{linkId:p.linkId}:{}),...(p.provider?{provider:p.provider}:{})};
        nativeRequest=envelope.command==='checkout.resume'?{mode:'resume',argv:[p.paymentId],selection:{},args:[]}:{mode:'status',selection,argv:[],args:[]};
      }else{
        assert(profile.type==='intent-common-0.1.43'&&['sdk.refresh','sdk.register'].includes(envelope.command),'PROFILE_TYPE','Select the original Common SDK operation.');
        if(envelope.command==='sdk.register'){text(p.txHash,'txHash',500);if(p.senderAddress)text(p.senderAddress,'senderAddress',500);}
        nativeRequest={mode:envelope.command==='sdk.refresh'?'status':'register',method:envelope.command==='sdk.refresh'?'getPayment':'updatePaymentPayInTxHash',args:envelope.command==='sdk.refresh'?[p.paymentId,'v2']:[{paymentId:p.paymentId,txHash:p.txHash,...(p.senderAddress?{senderAddress:p.senderAddress}:{})}],argv:[],selection:{},sdkVersion:'v2'};
      }
      if(envelope.command==='native.recover'){
        const original=this.workspace.request(p.originalRequestId);assert(original?.intent?.profile?.id===profile.id&&original.envelope.command==='checkout.create'&&original.state!=='accepted','NATIVE_ORIGINAL','Select the actual pending original Checkout create.',409);
        const linkId=original.intent.originalLinkId;
        assert(linkId&&p.linkId===linkId,'NATIVE_RECOVERY_IDENTITY','Select the same original publisher-parsed invoice linkId.',409);
        return {...base,nativeBinding:binding,nativeRequest,originalRequestId:original.id,expectedLinkId:linkId};
      }
      return {...base,nativeBinding:binding,nativeRequest};
    }
    fail('COMMAND','Unsupported prepared operation.');
  }
  async createMerchant(request,profile,c,options,opts){
    const w=this.workspace,captures=w.capturesFor(request.id);
    for(const capture of captures.filter(c=>c.kind==='merchant_create'&&c.status>=200&&c.status<300&&c.body)){
      try{const value=JSON.parse(w.wholeObject(capture.body.sha256));validatePayment(profile,value,{orderId:request.intent.order.orderId});const observation=w.observe({profileId:profile.id,kind:'payment',identity:value.id,captureId:capture.id,value});return w.complete(request.id,{paymentId:value.id,observationId:observation.id,recoveredCaptureId:capture.id});}catch(error){if(error.code==='MERCHANT_IDENTITY'||error.code==='ORDER_IDENTITY')throw error;}
    }
    const lookupAttempt=w.beginAttempt(request.id,'original_order_lookup');
    try{
      const read=await readOriginalOrder(w,profile,c,request.intent.order.orderId,{requestId:request.id,...opts});
      w.finishAttempt(request.id,lookupAttempt,{state:'reconciled',details:{captureId:read.capture.id,paymentId:read.value.id}});
      return w.complete(request.id,{paymentId:read.value.id,observationId:read.observation.id,lookupCaptureId:read.capture.id,originalOrder:true});
    }catch(error){w.finishAttempt(request.id,lookupAttempt,{state:'failed',details:{code:error.code,nativeStatus:error.details?.nativeStatus??null,captureId:error.details?.captureId??null}});if(error.details?.nativeStatus!==404)throw error;}
    const dispatched=captures.some(c=>c.kind==='merchant_create_dispatch');
    if(dispatched&&!options.retry)return pending(w,request,'Original order lookup returned 404. That read does not settle the earlier create; review it and explicitly retry the same saved request if appropriate.');
    const attempt=w.beginAttempt(request.id,'merchant_create',{sameRequestRetry:dispatched});
    w.capture({requestId:request.id,profileId:profile.id,kind:'merchant_create_dispatch',request:{method:'POST',url:c.baseUrl,bodyText:canonical(request.intent.body),authAlias:c.alias}});
    try{
      const response=await merchantCall(w,profile,c,{requestId:request.id,path:'',method:'POST',body:request.intent.body,kind:'merchant_create',...opts});
      validatePayment(profile,response.value,{orderId:request.intent.order.orderId});
      const observation=w.observe({profileId:profile.id,kind:'payment',identity:response.value.id,captureId:response.capture.id,value:response.value});
      w.finishAttempt(request.id,attempt,{state:'returned',details:{captureId:response.capture.id,paymentId:response.value.id}});
      return w.complete(request.id,{paymentId:response.value.id,observationId:observation.id,createCaptureId:response.capture.id});
    }catch(error){
      const definite=!dispatched&&[400,401,403,404,422,429].includes(error.details?.nativeStatus);
      w.finishAttempt(request.id,attempt,{state:definite?'failed':'uncertain',details:{code:error.code,nativeStatus:error.details?.nativeStatus??null,captureId:error.details?.captureId??null}});
      if(definite)return w.complete(request.id,{outcome:'provider_rejected',nativeStatus:error.details.nativeStatus,captureId:error.details.captureId});
      throw error;
    }
  }
  async registerMerchant(request,profile,c,options,opts){
    const w=this.workspace,read=await readPayment(w,profile,c,request.intent.paymentId,{requestId:request.id,...opts});
    if(read.value.source?.txHash===request.intent.body.txHash)return w.complete(request.id,{paymentId:read.value.id,observationId:read.observation.id,registrationObserved:true});
    assert(!read.value.source?.txHash,'PAYIN_HASH_CONFLICT','The original payment already reports another source transaction. Retain both sources for review.',409);
    const prior=w.capturesFor(request.id).some(c=>c.kind==='payin_dispatch');
    if(prior&&!options.retry)return pending(w,request,'The earlier registration is not yet visible. Review and retry only the exact retained transaction registration.');
    const attempt=w.beginAttempt(request.id,'payin_register');w.capture({requestId:request.id,profileId:profile.id,kind:'payin_dispatch',request:{method:'POST',url:c.baseUrl+'/payments/'+encodeURIComponent(request.intent.paymentId)+'/payin',bodyText:canonical(request.intent.body),authAlias:c.alias}});
    try{const response=await merchantCall(w,profile,c,{requestId:request.id,path:'/payments/'+encodeURIComponent(request.intent.paymentId)+'/payin',method:'POST',body:request.intent.body,kind:'payin_register',...opts});validatePayment(profile,response.value,{paymentId:request.intent.paymentId});const observation=w.observe({profileId:profile.id,kind:'payment',identity:response.value.id,captureId:response.capture.id,value:response.value});w.finishAttempt(request.id,attempt,{state:'returned',details:{captureId:response.capture.id}});return w.complete(request.id,{paymentId:response.value.id,observationId:observation.id,registrationReturned:true});}
    catch(error){w.finishAttempt(request.id,attempt,{state:'uncertain',details:{code:error.code,captureId:error.details?.captureId??null}});throw error;}
  }
  async refresh(request,profile,c,opts){
    const attempt=this.workspace.beginAttempt(request.id,'payment_refresh');
    try{const r=await readPayment(this.workspace,profile,c,request.intent.paymentId,{requestId:request.id,...opts});this.workspace.finishAttempt(request.id,attempt,{state:'returned',details:{captureId:r.capture.id}});return this.workspace.complete(request.id,{paymentId:r.value.id,observationId:r.observation.id,captureId:r.capture.id});}
    catch(error){this.workspace.finishAttempt(request.id,attempt,{state:'failed',details:{code:error.code,captureId:error.details?.captureId??null}});throw error;}
  }
  async lookup(request,profile,c,opts){
    const query=new URLSearchParams(request.intent.query),r=await merchantCall(this.workspace,profile,c,{requestId:request.id,path:'/payments/check?'+query,kind:'payment_lookup',...opts});
    if(r.value?.id){validatePayment(profile,r.value);this.workspace.observe({profileId:profile.id,kind:'payment',identity:r.value.id,captureId:r.capture.id,value:r.value});}
    return this.workspace.complete(request.id,{native:r.value,captureId:r.capture.id});
  }
  async capturePayments(request,profile,c,opts){
    const w=this.workspace;let job=w.get('capture',request.intent.job.id)?.value??{...clone(request.intent.job),kind:'payments',state:'prepared',requestId:request.id,offset:0,pages:[],paymentIds:[],startedAt:w.now(),completedAt:null,sourceSemantics:'Original newest-first offset API; this retained capture is not a provider snapshot. Capture a following edition for changes during pagination.'};
    const seen=new Set(job.paymentIds);job.state='running';w.putProgress('capture',job,request.id);
    for(;;){
      if(this.stop.signal.aborted){job.state='paused';w.putProgress('capture',job,request.id);return pending(w,request,'The capture stopped after its last retained complete page.');}
      const page=await paymentPage(w,profile,c,{requestId:request.id,fromDate:job.fromDate,toDate:job.toDate,offset:job.offset,limit:job.limit,status:job.status??undefined,...opts});
      const data=page.value.data,pagination=page.value.pagination;for(const payment of data)seen.add(payment.id);
      job.pages.push({captureId:page.capture.id,offset:job.offset,total:pagination.total,limit:pagination.limit,rows:data.length,paymentIds:data.map(p=>p.id)});job.paymentIds=[...seen];job.lastReportedTotal=pagination.total;
      const next=job.offset+data.length;
      assert(data.length>0||job.offset>=pagination.total,'PROVIDER_PAGINATION','The provider returned an empty page before its stated total. Preserve this exact page and resume.',502,{captureId:page.capture.id});
      job.offset=next;
      if(next>=pagination.total){job.state='complete';job.completedAt=w.now();w.putProgress('capture',job,request.id);return w.complete(request.id,{capture:job});}
      w.putProgress('capture',job,request.id);
    }
  }
  async captureActive(request,profile,c,opts){
    const w=this.workspace;let job=w.get('capture',request.intent.job.id)?.value??{...clone(request.intent.job),kind:'active',state:'prepared',requestId:request.id,index:0,observations:[],startedAt:w.now()};
    for(;job.index<job.paymentIds.length;){
      if(this.stop.signal.aborted){job.state='paused';w.putProgress('capture',job,request.id);return pending(w,request,'The original payment refresh list remains retained.');}
      const paymentId=job.paymentIds[job.index],read=await readPayment(w,profile,c,paymentId,{requestId:request.id,...opts});job.observations.push({paymentId,captureId:read.capture.id,observationId:read.observation.id});job.index++;job.state='running';w.putProgress('capture',job,request.id);
    }
    job.state='complete';job.completedAt=w.now();w.putProgress('capture',job,request.id);return w.complete(request.id,{capture:job});
  }
  async resume(requestId,{retry=false}={}){
    const request=this.workspace.request(requestId);assert(request,'REQUEST_MISSING','No original prepared request exists for this id.',404);
    if(request.state==='accepted'&&!request.envelope.command.startsWith('workspace.'))return request.result;
    return this.execute(request.envelope,{retry});
  }
  callback(profileId,input){assert(!this.transferring&&this.workspace.get('control','operator')?.value.mode!=='sealed','WORKSPACE_SEALED','The original workspace is sealed for handover.',409);const profile=this.profile(profileId).value,c=this.connection(profile);return receiveCallback(this.workspace,profile,c,input);}
  contracts(profileId){this.profile(profileId);return contractProjection(this.workspace.observations(profileId));}
  compare(beforeId,afterId){const a=this.workspace.get('report',beforeId),b=this.workspace.get('report',afterId);assert(a&&b,'REPORT_MISSING','Select two retained reports.',404);return compareReports(a.value,b.value);}
  startWatchers(){
    if(this.watchTimer||this.watchRunning||this.closed||this.transferring||this.workspace.get('control','operator')?.value.mode==='sealed')return;
    const arm=()=>{if(!this.closed&&!this.transferring)this.watchTimer=setTimeout(()=>{this.watchTimer=null;this.watchRunning=this.pollSchedules().catch(()=>{}).finally(()=>{this.watchRunning=null;arm();});},1000);};arm();
  }
  async pollSchedules(){
    for(const record of this.workspace.list('schedule',{all:true}).items){
      if(this.closed||this.transferring||this.workspace.get('control','operator')?.value.mode==='sealed')break;const schedule=record.value;if(!schedule.enabled||Date.parse(schedule.nextRunAt)>Date.now())continue;
      let lease;try{lease=acquireLease(this.workspace,'schedule:'+schedule.id);}catch{continue;}
      try{
        const current=this.workspace.get('schedule',schedule.id);if(!current?.value.enabled||current.version!==record.version)continue;
        const pendingId=schedule.lastRequestId,previous=pendingId?this.workspace.request(pendingId):null;
        let requestId,result;
        if(previous&&previous.state!=='accepted'){requestId=previous.id;result=await this.resume(requestId);}
        else{
          const to=schedule.nextRunAt,from=new Date(Date.parse(to)-schedule.lookbackHours*3600000).toISOString();
          requestId='poll-'+jsonDigest({workspaceId:this.workspace.meta().workspaceId,scheduleId:schedule.id,generation:schedule.generation,to});
          const envelope={workspaceId:this.workspace.meta().workspaceId,requestId,expectedRevision:this.workspace.meta().revision,actor:'watch:'+schedule.id,command:'capture.payments',payload:{id:requestId,profileId:schedule.profileId,fromDate:from,toDate:to,limit:100}};
          const retained=this.workspace.request(requestId);
          const prepared=retained??this.workspace.prepare(envelope,await this.prepareIntent(envelope));
          this.workspace.putProgress('schedule',{...schedule,lastRequestId:requestId},prepared.id);
          result=await this.execute(prepared.envelope);
        }
        const latest=this.workspace.get('schedule',schedule.id)?.value;
        if(latest&&latest.generation===schedule.generation){
          const finished=this.workspace.request(requestId).state==='accepted',nextRunAt=new Date(Date.now()+(finished?schedule.intervalSeconds:Math.max(30,schedule.intervalSeconds))*1000).toISOString();
          this.workspace.putProgress('schedule',{...latest,lastRequestId:requestId,nextRunAt,lastState:finished?'complete':'pending'},requestId);
        }
      }catch(error){
        const latest=this.workspace.get('schedule',schedule.id)?.value;
        if(latest?.lastRequestId&&this.workspace.request(latest.lastRequestId))this.workspace.putProgress('schedule',{...latest,lastError:{code:error.code??'SCHEDULE_ERROR',message:error.message},nextRunAt:new Date(Date.now()+Math.max(30,schedule.intervalSeconds)*1000).toISOString()},latest.lastRequestId);
      }finally{lease.release();}
    }
  }
  async exportWorkspace(envelope){
    const w=this.workspace,prior=w.replay(envelope),mode=envelope.command==='workspace.handover'?'handover':'working';
    fields(envelope.payload,['id','title'],'workspace delivery');id(envelope.payload.id,'delivery id');text(envelope.payload.title,'delivery title',300);
    assert(this.sourceIdentity&&this.delivery.sourceRoot&&this.delivery.sourceManifest&&this.delivery.configuration,'DELIVERY_CONFIGURATION','Open the complete source-bound application to export and receive it.',409);
    const seal=w.get('control','operator')?.value;
    assert(!seal||seal.mode!=='sealed'||seal.requestId===envelope.requestId,'WORKSPACE_SEALED','Finish the original sealed handover. Use the received workspace for new operations.',409);
    const recorded=w.get('delivery',envelope.payload.id);assert(!recorded||recorded.value.requestId===envelope.requestId,'DELIVERY_EXISTS','A delivery id belongs to its original request.',409);
    const intent={deliveryId:envelope.payload.id,title:envelope.payload.title,mode,sourceSha256:this.sourceIdentity.manifestSha256,configurationSha256:this.delivery.configuration.configurationIdentity.sha256};
    const request=prior??w.prepare(envelope,intent);
    assert(canonical(request.intent)===canonical(intent),'DELIVERY_CHANGED','Finish the original source-bound delivery before selecting a new edition.',409);
    return withLease(w,'delivery:'+request.id,async()=>{
      if(mode==='handover'){
        this.transferring=true;clearTimeout(this.watchTimer);this.watchTimer=null;
        await Promise.allSettled([...this.active.entries()].filter(([key])=>key!==request.id).map(([,promise])=>promise));
        if(this.watchRunning)await this.watchRunning;
      }
      let accepted=w.request(request.id);
      if(accepted.state!=='accepted'){
        const barrier=acquireLease(w,'native-files');
        try{
          const other=w.get('control','operator')?.value;
          assert(mode==='working'||!other||other.mode!=='sealed'||other.requestId===request.id,'WORKSPACE_SEALED','Finish the existing original custody handover.',409);
          const record={id:intent.deliveryId,requestId:request.id,title:intent.title,mode,sourceSha256:intent.sourceSha256};
          const records=[['delivery',record]];
          if(mode==='handover')records.push(['control',{id:'operator',mode:'sealed',requestId:request.id,deliveryId:intent.deliveryId,sealedAt:w.now()}]);
          w.complete(request.id,{deliveryId:intent.deliveryId,mode,exportState:'source_prepared'}, {records});
        }finally{barrier.release();}
        accepted=w.request(request.id);
      }
      const {buildDelivery}=await import('./delivery.mjs');
      const delivery=await buildDelivery(w,accepted,{...this.delivery,sourceIdentity:this.sourceIdentity,publisherSelections:this.publisherSelections});
      return {...accepted.result,delivery};
    });
  }
  async close(){if(this.closed)return;this.closed=true;clearTimeout(this.watchTimer);this.watchTimer=null;this.stop.abort(new Error('Operator closing'));await Promise.allSettled([...this.active.values(),...(this.watchRunning?[this.watchRunning]:[])]);}
}
