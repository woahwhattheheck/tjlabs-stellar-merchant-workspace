// MIT. Exact whole-file transport for original research customer returns.
import { gzipSync, gunzipSync } from 'node:zlib';
import { need } from './model.mjs';
import { decodeResearchEditionDelivery } from './delivery.mjs';
import { validateResearchReturn } from './return-model.mjs';
export const MAX_RESEARCH_RETURN_BYTES=256*1024*1024;
export const MAX_RESEARCH_RETURN_JSON_BYTES=640*1024*1024;
export function decodeResearchReturn(bytes){
  need(bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=MAX_RESEARCH_RETURN_BYTES,
    'Open the complete original Research return within256MiB.','RESEARCH_RETURN_CAPACITY',413);
  let packet;
  try{const raw=gunzipSync(Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength),
      {maxOutputLength:MAX_RESEARCH_RETURN_JSON_BYTES});
    packet=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  }catch{need(false,'The complete Research return is not readable gzip JSON.','RESEARCH_RETURN_INVALID');}
  need(typeof packet?.originalPackage?.bodyBase64==='string','Keep the complete original received package.');
  const packageBytes=Buffer.from(packet.originalPackage.bodyBase64,'base64');
  const {delivery}=decodeResearchEditionDelivery(packageBytes);
  validateResearchReturn(packet,delivery);return {packet,delivery,packageBytes};
}
export function encodeResearchReturn(packet){
  const packageBytes=Buffer.from(packet?.originalPackage?.bodyBase64??'','base64');
  const {delivery}=decodeResearchEditionDelivery(packageBytes);validateResearchReturn(packet,delivery);
  const raw=Buffer.from(JSON.stringify(packet)+'\n');
  need(raw.length<=MAX_RESEARCH_RETURN_JSON_BYTES,'The whole selected research return exceeds640MiB.','RESEARCH_RETURN_CAPACITY',413);
  const bytes=gzipSync(raw,{level:6});
  need(bytes.length<=MAX_RESEARCH_RETURN_BYTES,'The compressed original return exceeds256MiB.','RESEARCH_RETURN_CAPACITY',413);
  return bytes;
}
