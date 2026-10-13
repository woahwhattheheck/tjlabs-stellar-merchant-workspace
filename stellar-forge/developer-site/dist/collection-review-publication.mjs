// MIT. Passive publication gate; original private collection custody stays unchanged.
export const COLLECTION_PUBLICATION_SCHEMA='stellar-forge.collection-publication-inspection.v1';
const encoder=new TextEncoder(), decoder=new TextDecoder('utf-8',{fatal:true});
const LIMIT=64*1024*1024;
function failure(code,message){return Object.assign(new Error(message),{code});}
export function inspectCollectionPublication(input){
 let text;
 try{
  text=typeof input==='string'?input:input instanceof Uint8Array?decoder.decode(input):JSON.stringify(input);
 }catch{throw failure('COLLECTION_PUBLICATION_INPUT','Inspect a complete UTF-8 or JSON publication artifact.');}
 if(typeof text!=='string'||encoder.encode(text).length>LIMIT)
  throw failure('COLLECTION_PUBLICATION_SIZE','Inspect a complete publication artifact of at most 64 MiB.');
 // Decode JSON string escapes before inspecting string fields. An HTML/source
 // string remains inert data; no source script, URL or candidate is evaluated.
 let value;try{value=JSON.parse(text);}catch{value=text;}
 const pending=[value];let examined=0,detected=false;
 const candidate=/AIza[0-9A-Za-z_-]{35}/;
 while(pending.length){
  if(++examined>1000000)throw failure('COLLECTION_PUBLICATION_SIZE','The publication artifact exceeds the inspection node limit.');
  const current=pending.pop();
  if(typeof current==='string'){if(candidate.test(current))detected=true;}
  else if(current&&typeof current==='object'){
   if(Array.isArray(current))for(const item of current)pending.push(item);
   else for(const [key,item] of Object.entries(current)){pending.push(key);pending.push(item);}
  }
 }
 return {schema:COLLECTION_PUBLICATION_SCHEMA,status:detected?'BLOCKED':'PASSED',
  detector:'google-api-key-shape-v1',credentialCandidateDetected:detected,
  bytes:encoder.encode(text).length,onlineValidation:false,sourceModified:false};
}
export function assertCollectionPublication(input){
 const report=inspectCollectionPublication(input);
 if(report.credentialCandidateDetected)
  throw Object.assign(failure('COLLECTION_PUBLICATION_BLOCKED',
   'Publication contains a recognizable Google API key candidate. Keep the original private; create and validate an explicitly redacted derivative before publication. No credential value is logged or checked online.'),
   {publicationInspection:report});
 return report;
}
