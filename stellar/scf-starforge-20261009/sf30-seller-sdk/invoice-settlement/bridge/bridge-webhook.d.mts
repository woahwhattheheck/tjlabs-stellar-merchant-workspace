import type {OriginalEndpointBinding,WebhookObservation,Json} from './bridge-provider.mjs';
export function parseProviderJSON(text:string,options?:{maxDepth?:number;maxNodes?:number}):Json;
export interface BridgeDeliveryOptions {
  rawBody:Uint8Array;
  signatureHeader:string;
  publicKeyPem:string;
  endpointId:string;
  binding:OriginalEndpointBinding;
  receivedAtMs:number;
  maxAgeMs?:number;
  maxFutureSkewMs?:number;
  maxBodyBytes?:number;
}
export interface VerifiedDelivery {
  schema:'bloccpay.bridge-verified-delivery.v1';endpointId:string;
  endpointKeySha256:string;receivedAtMs:number;signedAtMs:number;
  signature:{algorithm:'RSA-PKCS1-v1_5-SHA256-of-SHA256';header:string};
  source:{bytes:number;sha256:string;encoding:'utf-8'};
  rawBody:Uint8Array;document:Json;event:WebhookObservation;
  ledgerAction:'NONE';status:'VERIFIED_NOT_COMMITTED';
}
export function verifyBridgeDelivery(options:BridgeDeliveryOptions):VerifiedDelivery;
