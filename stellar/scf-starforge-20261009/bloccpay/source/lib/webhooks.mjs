import {createHash,createPublicKey,createHmac,timingSafeEqual,verify,constants} from 'node:crypto';
import {invariant,parseSourceJSON,sha256} from './source-json.mjs';
export function verifyWebhook({provider,rawBody,headers,configuration,receivedAt}) {
 if(provider==='sdp')return verifySDPWebhook({rawBody,headers,configuration,receivedAt});
 invariant(provider==='bridge','PROVIDER_WEBHOOK_NOT_CONFIGURED');
 invariant(configuration&&typeof configuration.publicKey==='string'&&configuration.publicKey.length,'BRIDGE_ENDPOINT_PUBLIC_KEY_REQUIRED');
 invariant(typeof configuration.developerId==='string'&&configuration.developerId.length,'BRIDGE_ENDPOINT_DEVELOPER_REQUIRED');
 const raw=Buffer.isBuffer(rawBody)?rawBody:Buffer.from(rawBody);
 const selected=Object.entries(headers??{}).filter(([key])=>key.toLowerCase()==='x-webhook-signature');
 invariant(selected.length===1&&typeof selected[0][1]==='string','BRIDGE_SIGNATURE_HEADER_REQUIRED');
 const match=/^t=(\d+),v0=([A-Za-z0-9+/]+={0,2})$/.exec(selected[0][1]);
 invariant(match,'BRIDGE_SIGNATURE_HEADER_INVALID');
 const timestamp=Number(match[1]),received=Date.parse(receivedAt);
 const maxAge=configuration.maxAgeMs??600000,future=configuration.futureToleranceMs??60000;
 invariant(Number.isSafeInteger(timestamp)&&Number.isFinite(received)&&Number.isSafeInteger(maxAge)&&maxAge>0&&
  Number.isSafeInteger(future)&&future>=0,'BRIDGE_SIGNATURE_TIME_INVALID');
 invariant(timestamp>=received-maxAge&&timestamp<=received+future,'BRIDGE_SIGNATURE_TIME_WINDOW');
 const signature=Buffer.from(match[2],'base64');
 invariant(signature.toString('base64')===match[2]&&signature.length>0,'BRIDGE_SIGNATURE_BASE64_INVALID');
 const key=createPublicKey(configuration.publicKey);
 invariant(key.asymmetricKeyType==='rsa','BRIDGE_SIGNATURE_RSA_KEY_REQUIRED');
 const digest=createHash('sha256').update(match[1]+'.').update(raw).digest();
 invariant(verify('sha256',digest,{key,padding:constants.RSA_PKCS1_PADDING},signature),'BRIDGE_SIGNATURE_MISMATCH');
 const parsed=parseSourceJSON(raw),value=parsed.value;
 invariant(value&&typeof value==='object'&&!Array.isArray(value),'BRIDGE_EVENT_OBJECT_REQUIRED');
 invariant(typeof value.event_id==='string'&&value.event_id.length&&
  typeof value.event_category==='string'&&typeof value.event_type==='string'&&
  value.event_type.startsWith(value.event_category+'.'),'BRIDGE_EVENT_IDENTITY_REQUIRED');
 invariant(value.event_developer_id===configuration.developerId,'BRIDGE_EVENT_DEVELOPER_MISMATCH');
 invariant(value.event_object&&typeof value.event_object==='object'&&!Array.isArray(value.event_object)&&
  String(value.event_object.id)===String(value.event_object_id),'BRIDGE_EVENT_RESOURCE_MISMATCH');
 return{verified:true,provider:'bridge',eventId:value.event_id,eventType:value.event_type,
  value,numberTokens:parsed.numberTokens,rawSha256:sha256(raw),bytes:raw.length,
  signatureTimestamp:match[1],receivedAt,developerId:value.event_developer_id};
}

export const SDP_EVENT_TYPES = Object.freeze([
 'disbursement.created','disbursement.approved','disbursement.rejected',
 'disbursement.submitted','disbursement.completed','disbursement.failed','disbursement.paused',
 'wallet.created','wallet.archived','wallet.promoted_to_default','wallet.membership_granted','wallet.membership_revoked',
]);
function sdpText(value,label) {
 invariant(typeof value==='string'&&value.length>0&&value.length<=255&&!/[\x00-\x20\x7f/?#\\]/.test(value),
  'SDP_EVENT_TEXT_REQUIRED',{field:label});return value;
}
function sdpHeader(headers,name) {
 const selected=Object.entries(headers??{}).filter(([key])=>key.toLowerCase()===name.toLowerCase());
 invariant(selected.length===1&&typeof selected[0][1]==='string','SDP_SIGNATURE_HEADER_REQUIRED',{header:name});
 return selected[0][1];
}
export function verifySDPWebhook({rawBody,headers,configuration,receivedAt}) {
 invariant(configuration&&typeof configuration.secret==='string'&&configuration.secret.length>0,'SDP_ENDPOINT_SECRET_REQUIRED');
 const tenantId=sdpText(configuration.tenantId,'tenantId'),sourceWalletId=sdpText(configuration.sourceWalletId,'sourceWalletId');
 const origin=configuration.origin;
 invariant(typeof origin==='string'&&origin.length>0,'SDP_ENDPOINT_ORIGIN_INVALID');
 const url=new URL(origin);
 invariant(url.href.replace(/\/+$/,'')===origin&&!url.username&&!url.password&&!url.search&&!url.hash&&
  (url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)),
  'SDP_ENDPOINT_ORIGIN_INVALID');
 invariant(configuration.singleTenant===undefined||typeof configuration.singleTenant==='boolean','SDP_SINGLE_TENANT_SELECTION_INVALID');
 const raw=Buffer.isBuffer(rawBody)?rawBody:Buffer.from(rawBody);
 invariant(raw.length<=5*1024*1024,'SDP_EVENT_BODY_LIMIT');
 const timestamp=sdpHeader(headers,'X-SDP-Timestamp'),signature=sdpHeader(headers,'X-SDP-Signature');
 invariant(/^(?:0|[1-9]\d{0,12})$/.test(timestamp)&&/^sha256=[a-f0-9]{64}$/.test(signature),'SDP_SIGNATURE_HEADER_INVALID');
 const seconds=Number(timestamp),received=Date.parse(receivedAt),tolerance=configuration.toleranceSeconds??300;
 invariant(Number.isSafeInteger(seconds)&&Number.isFinite(received)&&Number.isSafeInteger(tolerance)&&tolerance>=0&&tolerance<=3600,
  'SDP_SIGNATURE_TIME_INVALID');
 invariant(Math.abs(Math.floor(received/1000)-seconds)<=tolerance,'SDP_SIGNATURE_TIME_WINDOW');
 const expected=createHmac('sha256',configuration.secret).update(timestamp+'.').update(raw).digest();
 invariant(timingSafeEqual(expected,Buffer.from(signature.slice(7),'hex')),'SDP_SIGNATURE_MISMATCH');
 const parsed=parseSourceJSON(raw),value=parsed.value;
 invariant(value&&typeof value==='object'&&!Array.isArray(value)&&value.schema_version===1,'SDP_EVENT_SCHEMA');
 const eventId=sdpText(value.event_id,'event_id'),eventType=sdpText(value.event_type,'event_type');
 invariant(SDP_EVENT_TYPES.includes(eventType),'SDP_EVENT_TYPE_UNSUPPORTED');
 invariant(typeof value.occurred_at==='string'&&Number.isFinite(Date.parse(value.occurred_at)),'SDP_EVENT_TIME_INVALID');
 invariant(value.tenant_id===tenantId||(value.tenant_id===undefined&&configuration.singleTenant===true),'SDP_EVENT_TENANT_MISMATCH');
 invariant(value.source_wallet_id===sourceWalletId,'SDP_EVENT_SOURCE_WALLET_MISMATCH');
 invariant(value.data&&typeof value.data==='object'&&!Array.isArray(value.data),'SDP_EVENT_DATA_REQUIRED');
 let readback;
 if(eventType.startsWith('disbursement.')) {
  const id=sdpText(value.data.disbursement_id,'data.disbursement_id');
  readback={action:'sdp.disbursement.get',input:{params:{id}},resourceKind:'sdp-disbursement',resourceId:id};
 }else{
  const id=sdpText(value.data.wallet_id,'data.wallet_id');
  invariant(id===sourceWalletId,'SDP_EVENT_WALLET_MISMATCH');
  readback={action:'sdp.distribution-wallet.get',input:{params:{id}},resourceKind:'sdp-distribution-wallet',resourceId:id};
 }
 // Metadata is not a complete native resource. Only the selected original GET can project it.
 return {verified:true,provider:'sdp',eventId,eventType,value,numberTokens:parsed.numberTokens,
  rawSha256:sha256(raw),bytes:raw.length,signatureTimestamp:timestamp,receivedAt,
  signatureHeaders:{'X-SDP-Timestamp':timestamp,'X-SDP-Signature':signature},
  scope:{tenantId,sourceWalletId,origin},readback,ledgerAction:'NONE'};
}
