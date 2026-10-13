// MIT. Complete self-contained recipient page over the installed original review model.
const MODEL_EXPORT='export const {PACKET_SCHEMA,RETURN_SCHEMA,MAX_REVIEW_BYTES,outcomes,canonical,digest,serialize,decode,base64,validatePacket,validateObservation,newReturn,validateReturn}=ImplementationReviewModel;';
const script=s=>s.replace(/<\/script/gi,m=>'<\\/'+m.slice(2));
export function renderImplementationReviewHtml(prepared,{model,recipient,style}){
 if(!prepared?.packet||!/^[a-f0-9]{64}$/.test(prepared.packetSha256))throw Error('Select a complete prepared review packet.');
 for(const[name,value]of Object.entries({model,recipient,style}))if(typeof value!=='string'||!value||new TextEncoder().encode(value).length>2*1024*1024)throw Error('Keep the installed complete '+name+' asset.');
 if(model.split(MODEL_EXPORT).length!==2)throw Error('Keep the exact installed review model export contract.');
 if(/<\/style/i.test(style))throw Error('Keep the installed complete stylesheet.');
 const inlineModel=model.replace(MODEL_EXPORT,'');
 const input=JSON.stringify({packet:prepared.packet,packetSha256:prepared.packetSha256}).replace(/</g,'\\u003c');
 return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data: blob:; connect-src \'none\'; base-uri \'none\'; form-action \'none\'"><title>Implementation review</title><style>'+style+'</style></head><body><header><strong>Support implementation</strong><span>Saved recipient review</span></header><main id="implementation-review-recipient"></main><noscript>Enable JavaScript to review this complete saved implementation.</noscript><script id="implementation-review-input" type="application/json">'+input+'</script><script>\n'+script(inlineModel)+'\n</script><script>\n'+script(recipient)+'\n</script><footer>Original saved implementation · attributed recipient observations · native case receiving</footer></body></html>\n';
}
