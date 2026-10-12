// MIT. Original SF88 handoff reader used by the retained SF47 Operations host.
import {inspectHandoff,renderHandoff,MAX_BYTES,need} from '../../../scf-starforge-20261009/sf88-operator-buyer-cli/operations-handoff/contract.mjs';
import {inspectNodeOperations,renderNodeOperations,NODE_ACCOUNTING_EXPORT} from './node_buyer_handoff.mjs';
const chunks=[];let size=0;
try{
  for await(const chunk of process.stdin){size+=chunk.length;need(size<=MAX_BYTES,'BUYER_HANDOFF_SIZE');chunks.push(chunk);}
  const raw=Buffer.concat(chunks);
  let schema;try{schema=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw))?.schema;}catch{need(false,'BUYER_HANDOFF_JSON_INVALID');}
  const node=schema===NODE_ACCOUNTING_EXPORT,report=node?inspectNodeOperations(raw):inspectHandoff(raw);
  process.stdout.write(JSON.stringify({schema:'scf.operations.buyer-reader.v1',report,html:node?renderNodeOperations(report):renderHandoff(report)})+'\n');
}catch(error){process.stdout.write(JSON.stringify({error:{code:error.code??error.message??'BUYER_READER_FAILED'}})+'\n');process.exitCode=2;}
