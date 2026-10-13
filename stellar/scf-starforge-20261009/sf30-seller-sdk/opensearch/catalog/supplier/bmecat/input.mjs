// MIT. Native streaming original BMEcat XML with a final byte identity.
import { createReadStream, constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createBMEcatParser, bmecatLimits, bmecatFailure } from './parser.mjs';
const fail=(code,message)=>{throw bmecatFailure(code,message);};
function abort(signal){if(signal?.aborted)throw signal.reason??bmecatFailure('ABORTED','Original source receiving was cancelled.');}
/** Product events remain provisional until complete. Consumers must stage them. */
export async function* readBMEcat(filename,{signal,expectedBytes,expectedSha256,limits:rawLimits={}}={}){
  const limits=bmecatLimits(rawLimits);
  if(expectedBytes!==undefined&&(!Number.isSafeInteger(expectedBytes)||expectedBytes<1||expectedBytes>limits.documentBytes))fail('IDENTITY','Declare a bounded original byte count.');
  if(expectedSha256!==undefined&&(typeof expectedSha256!=='string'||!/^[a-f0-9]{64}$/.test(expectedSha256)))fail('IDENTITY','Declare the original SHA-256.');
  abort(signal);
  const handle=await open(filename,constants.O_RDONLY|constants.O_NOFOLLOW);
  let stream;
  try{
    const initial=await handle.stat();
    if(!initial.isFile()||initial.size<1||initial.size>limits.documentBytes)fail('SOURCE_FILE','Choose a bounded original regular XML source.');
    if(expectedBytes!==undefined&&initial.size!==expectedBytes)fail('SOURCE_CHANGED','Original declared source length differs.');
    const hash=createHash('sha256'),decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
    let bytes=0,first=true,queue=[],complete=null;
    const parser=createBMEcatParser({limits,onEvent:event=>{if(event.type==='complete')complete=event;else queue.push(event);}});
    stream=createReadStream(filename,{fd:handle.fd,autoClose:false,highWaterMark:262144});
    for await(const chunk of stream){
      abort(signal);bytes+=chunk.length;if(bytes>limits.documentBytes||expectedBytes!==undefined&&bytes>expectedBytes)fail('SOURCE_LIMIT','Original source exceeded its declared byte limit.');
      hash.update(chunk);
      let text;try{text=decoder.decode(chunk,{stream:true});}catch{fail('UTF8','Original BMEcat input must contain valid UTF-8.');}
      if(first&&text.length){first=false;if(text[0]==='\uFEFF')text=text.slice(1);}
      parser.write(text);
      for(const event of queue)yield event;queue=[];
    }
    let tail;try{tail=decoder.decode();}catch{fail('UTF8','Original BMEcat input ends with incomplete UTF-8.');}
    parser.write(tail);parser.end();for(const event of queue)yield event;
    const final=await handle.stat(),sha256=hash.digest('hex');
    if(final.size!==initial.size||final.dev!==initial.dev||final.ino!==initial.ino||final.mtimeMs!==initial.mtimeMs||final.ctimeMs!==initial.ctimeMs||
       bytes!==initial.size||expectedBytes!==undefined&&bytes!==expectedBytes||expectedSha256!==undefined&&sha256!==expectedSha256)
      fail('SOURCE_CHANGED','Original XML byte identity changed while it was received.');
    if(!complete)fail('EOF','Original source has no complete parsing receipt.');
    yield {...complete,bytes,sha256};
  }finally{stream?.destroy();await handle.close();}
}
