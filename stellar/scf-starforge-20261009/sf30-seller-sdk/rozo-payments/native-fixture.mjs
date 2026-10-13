import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync, openSync, closeSync, fsyncSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { canonical, digest, clone, assert } from './model.mjs';
import { sourcePath } from './source.mjs';

/** Controlled local HTTP source for the original native receiving operation.
 * Checkout responses derive from the publisher's retained fixture bytes.
 * Merchant rows exercise the documented keyed contract and are labelled local.
 * Nothing in this module contacts a public provider or submits a transaction.
 */
export function saveNative(path,value){
  const temp=path+'.writing',raw=Buffer.from(canonical(value)+'\n'),fd=openSync(temp,'w',0o600);
  try{writeFileSync(fd,raw);fsyncSync(fd);}finally{closeSync(fd);}renameSync(temp,path);return value;
}
const ASSET='Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const TARGET='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const FIXTURE_ASSETS=[
  {chainId:'900',network:'Controlled local Solana fixture; no network transfer',tokenSymbol:'USDT',tokenAddress:ASSET,decimals:6},
  {chainId:'8453',network:'Controlled local Base fixture; no network transfer',tokenSymbol:'USDC',tokenAddress:TARGET,decimals:6}
];
export const FIXTURE_APP='merchant_native_rozo_receiving';
export const FIXTURE_WALLET={chainId:'8453',network:FIXTURE_ASSETS[1].network,tokenAddress:TARGET,address:'0x1111111111111111111111111111111111111111',sourceRef:'native-fixture.mjs / controlled local receiver'};
export const FIXTURE_KEY='rozo-local-development-key';
export const FIXTURE_SECRET='rozo-local-development-callback-secret';
export function fixturePayment(index,at){
  const id='rozo-local-'+String(index).padStart(4,'0'),createdAt=new Date(Date.parse(at)-index*1000).toISOString();
  const statuses=['payment_unpaid','payment_payin_completed','payment_payout_completed','payment_expired','payment_bounced','payment_refunded'],status=statuses[index%statuses.length],confirmed=['payment_payin_completed','payment_payout_completed','payment_bounced','payment_refunded'].includes(status);
  return {id,appId:FIXTURE_APP,orderId:'source-order-'+index,type:'exactIn',status,createdAt,updatedAt:createdAt,expiresAt:new Date(Date.parse(at)+86400000).toISOString(),
    display:{name:'Controlled native source order '+index},source:{chainId:'900',tokenSymbol:'USDT',tokenAddress:ASSET,amount:'5.000000',amountReceived:confirmed?'5.000000':null,fee:'0.005000',receiverAddress:'9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',receiverMemo:'local-'+index,senderAddress:null,txHash:confirmed?digest('controlled-payin-'+index):null,confirmedAt:confirmed?createdAt:null},
    destination:{chainId:'8453',tokenSymbol:'USDC',tokenAddress:TARGET,amount:'4.995000',receiverAddress:FIXTURE_WALLET.address,receiverMemo:null,txHash:status==='payment_payout_completed'?digest('controlled-payout-'+index):null,confirmedAt:status==='payment_payout_completed'?createdAt:null},
    metadata:{dataContext:'DEVELOPMENT',operation:'ROZO-MERCHANT-SETTLEMENT-COMMISSIONING-20261012',source:'controlled local keyed API contract'}};
}
export async function startNativeFixture({directory,checkoutSource}){
  mkdirSync(directory,{recursive:true,mode:0o700});const stateFile=join(directory,'provider-state.json'),logFile=join(directory,'provider-requests.json');
  let state;if(existsSync(stateFile))state=JSON.parse(readFileSync(stateFile));else{
    const at=new Date().toISOString(),fixtures={};
    for(const name of ['create-response.json','quote-snapshot.json','invoice-status-payable.json','payment-unpaid-solana.json']){
      const path='test/fixtures/'+name,raw=readFileSync(sourcePath(checkoutSource,path));fixtures[name]={path,bytes:raw.length,sha256:digest(raw),base64:raw.toString('base64'),value:JSON.parse(raw)};
    }
    const expiry=new Date(Date.parse(at)+7*86400000).toISOString(),expirySeconds=String(Math.floor(Date.parse(expiry)/1000));
    const create=clone(fixtures['create-response.json'].value),snapshot=clone(fixtures['quote-snapshot.json'].value),invoice=clone(fixtures['invoice-status-payable.json'].value),payment=clone(fixtures['payment-unpaid-solana.json'].value);
    create.expiresAt=expiry;payment.createdAt=at;payment.updatedAt=at;payment.expiresAt=expiry;payment.destination.tokenAddress=TARGET;
    invoice.rozoPayment.expiresAt=expiry;invoice.coinbase.preApprovalExpiry=expirySeconds;snapshot.coinbase.preApprovalExpiry=expirySeconds;
    const quote={linkId:snapshot.linkId,protocolVersion:snapshot.protocolVersion,merchant:snapshot.merchant,invoice:{amount:snapshot.original,fiat:snapshot.fiat},quote:{callerPays:snapshot.callerPays},quoteReceipt:'controlled-native-quote-receipt',coinbasePayment:snapshot.coinbase};
    state={schema:'stellar-forge.rozo-native-provider-fixture.v1',dataContext:'DEVELOPMENT',createdAt:at,port:null,fixtures,overrides:{reason:'Current local exercise uses future expiry and original fixture identities; no public invoice is operated.',at,expiry,expirySeconds,fields:['create.expiresAt','payment.createdAt','payment.updatedAt','payment.expiresAt','payment.destination.tokenAddress','invoice.rozoPayment.expiresAt','invoice.coinbase.preApprovalExpiry','quote.coinbasePayment.preApprovalExpiry']},checkout:{create,quote,invoice,payment,postCount:0,dropFirstCreate:true},payments:Object.fromEntries(Array.from({length:105},(_,i)=>{const p=fixturePayment(i+1,at);return[p.id,p];})),merchantPostCount:0,merchantRejectedCount:0,rejectFirstMerchant:true,dropFirstMerchant:true,registerCount:0,listOffsets:[],requests:0};
    saveNative(stateFile,state);
  }
  assert(state.schema==='stellar-forge.rozo-native-provider-fixture.v1','NATIVE_FIXTURE','Select the original saved local fixture.',409);
  const logs=existsSync(logFile)?JSON.parse(readFileSync(logFile)):[];
  const save=()=>{saveNative(stateFile,state);saveNative(logFile,logs);};
  const server=createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://127.0.0.1'),chunks=[];for await(const c of req)chunks.push(c);const raw=Buffer.concat(chunks),body=raw.length?JSON.parse(raw):null;
      state.requests++;logs.push({sequence:state.requests,at:new Date().toISOString(),method:req.method,path:url.pathname,query:[...url.searchParams],bodyBytes:raw.length,bodySha256:digest(raw),bodyText:raw.toString('utf8'),authentication:req.headers['x-api-key']===FIXTURE_KEY?'local-development-key':req.headers.authorization?'supplied-native-sdk-header':'none'});
      const answer=(status,value)=>{save();const text=canonical(value);res.writeHead(status,{'Content-Type':'application/json','Content-Length':Buffer.byteLength(text)});res.end(text);};
      if(url.pathname==='/merchant'||url.pathname.startsWith('/merchant/')){
        if(req.headers['x-api-key']!==FIXTURE_KEY)return answer(401,{error:{code:'LOCAL_KEY',message:'Wrong controlled key'}});
        if(req.method==='POST'&&url.pathname==='/merchant'){
          assert(body.type==='exactIn'&&body.orderId&&body.source?.amount,'NATIVE_INPUT','The original merchant body differs.');
          state.merchantPostCount++;
          if(state.rejectFirstMerchant){state.rejectFirstMerchant=false;state.merchantRejectedCount++;return answer(429,{error:{code:'LOCAL_CREATE_LIMIT',message:'Controlled definitive first-create rejection; no payment was created.'}});}
          let p=Object.values(state.payments).find(p=>p.orderId===body.orderId);
          if(!p){p=fixturePayment(0,state.createdAt);p.id='rozo-local-created';p.orderId=body.orderId;p.display=clone(body.display);p.source={...p.source,...clone(body.source)};state.payments[p.id]=p;}
          if(state.dropFirstMerchant){state.dropFirstMerchant=false;save();req.socket.destroy();return;}
          return answer(201,p);
        }
        if(req.method==='GET'&&url.pathname.startsWith('/merchant/payments/order/')){
          const parts=url.pathname.slice('/merchant/payments/order/'.length).split('/').map(decodeURIComponent),p=Object.values(state.payments).find(p=>p.appId===parts[0]&&p.orderId===parts[1]);return answer(p?200:404,p??{error:{code:'NOT_FOUND'}});
        }
        if(req.method==='GET'&&url.pathname==='/merchant/payments'){
          const offset=Number(url.searchParams.get('offset')),limit=Number(url.searchParams.get('limit')),from=Date.parse(url.searchParams.get('fromDate')),to=Date.parse(url.searchParams.get('toDate')),status=url.searchParams.get('status');
          assert(Number.isSafeInteger(offset)&&offset>=0&&limit>=1&&limit<=100,'NATIVE_PAGE','Use the original keyed pagination.');
          const values=Object.values(state.payments).filter(p=>Date.parse(p.createdAt)>=from&&Date.parse(p.createdAt)<=to&&(!status||p.status===status)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
          state.listOffsets.push(offset);return answer(200,{data:values.slice(offset,offset+limit),pagination:{total:values.length,offset,limit}});
        }
        if(req.method==='GET'&&url.pathname==='/merchant/payments/check'){
          const p=Object.values(state.payments).find(p=>[url.searchParams.get('txHash'),url.searchParams.get('sourceTxHash')].filter(Boolean).includes(p.source.txHash)||url.searchParams.get('destinationTxHash')&&url.searchParams.get('destinationTxHash')===p.destination.txHash||url.searchParams.get('receiverAddress')===p.source.receiverAddress&&url.searchParams.get('receiverMemo')===p.source.receiverMemo);
          return answer(p?200:404,p??{error:{code:'NOT_FOUND'}});
        }
        const match=url.pathname.match(/^\/merchant\/payments\/([^/]+)(\/payin)?$/),p=match?state.payments[decodeURIComponent(match[1])]:null;
        if(p&&req.method==='GET'&&!match[2])return answer(200,p);
        if(p&&req.method==='POST'&&match[2]){assert(body.txHash&&body.fromAddress,'NATIVE_PAYIN','Use the original registration body.');state.registerCount++;p.source.txHash=body.txHash;p.source.senderAddress=body.fromAddress;p.updatedAt=new Date().toISOString();return answer(200,p);}
        return answer(404,{error:{code:'NOT_FOUND'}});
      }
      if(req.method==='POST'&&url.pathname==='/mpp/quote-invoice')return answer(200,state.checkout.quote);
      if(req.method==='POST'&&url.pathname==='/mpp/create-invoice'){
        assert(body.quoteReceipt==='controlled-native-quote-receipt'&&body.client==='rozo-checkout-cli/0.1.21'&&body.source?.chainId==='900'&&body.source.tokenSymbol==='USDT','NATIVE_CHECKOUT_BODY','The original MPP create body differs.');
        state.checkout.postCount++;
        if(state.checkout.dropFirstCreate){state.checkout.dropFirstCreate=false;save();req.socket.destroy();return;}
        return answer(200,state.checkout.create);
      }
      if(req.method==='GET'&&url.pathname==='/mpp/invoice-status'){
        const selected=url.searchParams.get('rozo_payment_id'),link=url.searchParams.get('payment_id');
        if(selected&&selected!==state.checkout.payment.id||link&&link!==state.checkout.create.linkId)return answer(404,{error:{code:'NOT_FOUND'}});
        return answer(200,state.checkout.invoice);
      }
      if(req.method==='GET'&&url.pathname==='/intents/payments/'+state.checkout.payment.id)return answer(200,state.checkout.payment);
      return answer(404,{error:{code:'LOCAL_ROUTE_MISSING',path:url.pathname}});
    }catch(error){if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:error.code??'LOCAL_FIXTURE',message:error.message}}));}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(state.port??0,'127.0.0.1',resolve);});
  if(state.port===null){state.port=server.address().port;save();}
  return {server,origin:'http://127.0.0.1:'+state.port,state:()=>clone(state),save,updatePayment(id,patch){const p=state.payments[id];assert(p,'NATIVE_PAYMENT','Select a retained controlled payment.');Object.assign(p,clone(patch));save();return clone(p);},callback(paymentId,{eventId,type='payment_payout_completed',at=new Date().toISOString(),payment}={}){
    const data=payment??state.payments[paymentId],event={event_id:eventId,type,timestamp:at,data:clone(data)},raw=Buffer.from(canonical(event)),timestamp=String(Date.now()),signature='sha256='+createHmac('sha256',FIXTURE_SECRET).update(timestamp+'.').update(raw).digest('hex');return {raw,timestamp,signature,event};
  },close:()=>new Promise(resolve=>server.close(resolve))};
}
