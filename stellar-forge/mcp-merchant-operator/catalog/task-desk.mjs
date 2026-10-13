import {MAX_RETAINED_CHUNK_BYTES} from '../retained-file-contracts.mjs';
// MIT. Original InboxTask operations through an existing desk controller.
const text={type:'string',minLength:1,maxLength:512};
const sha={type:'string',pattern:'^[a-f0-9]{64}$'};
const uuid={type:'string',pattern:'^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$'};
const desk={type:'string',pattern:'^[a-z][a-z0-9_-]{0,63}$'};
const read={readOnly:true,idempotent:true};
const base={desk};
const selected={desk,taskId:sha,expectedTaskSha256:sha};
const live={expectedInstanceId:uuid};
const rpc={readId:text,responseSha256:sha};
const nullable={anyOf:[text,{type:'null'}]};
const selection={type:'object',properties:{intentId:text,role:text,sourceEdition:nullable,
 facilitator:nullable,decisionRef:nullable,reservationRef:nullable,
 rpcResult:{type:'object',properties:rpc,required:['readId','responseSha256'],additionalProperties:false}},
 required:['intentId','role'],additionalProperties:false};
const task={type:'object',properties:Object.fromEntries(['system','id','revision','title','purpose','service'].map(k=>[k,text])),
 required:['system','id','revision','title','purpose','service'],additionalProperties:false};
const draft={task,selections:{type:'array',minItems:1,maxItems:256,items:selection},predecessorId:sha};
export function taskDeskTools(tool){
 return [
  tool('merchant_task_desks','List host-configured original InboxTask desk aliases. Does not start another desk.',{},[],read),
  tool('merchant_task_desk_status','Read the selected original desk instance and roots without exposing its session token.',base,['desk'],read),
  tool('merchant_task_desk_jobs','Read original Inbox jobs and their native process result.',base,['desk'],read),
  tool('merchant_task_desk_rpc_reads','List the original intent’s separately timed saved RPC reads in the configured commerce root.',
    {...base,intentId:text},['desk','intentId'],read),
  tool('merchant_task_desk_rpc_inspect','Verify one exact saved RPC response while preserving its original uncertain attempt and recovery.',
    {...base,intentId:text,...rpc},['desk','intentId','readId','responseSha256'],read),
  tool('merchant_task_desk_tasks','List saved caller-task revisions, locations and original inspection issues.',base,['desk'],read),
  tool('merchant_task_desk_preview','Preview a complete caller-task selection using original Inbox jobs. RPC selections inherit only the configured commerce root.',
    {...base,...live,...draft},['desk','expectedInstanceId','task','selections'],read),
  tool('merchant_task_desk_create','Save the exact previewed caller-task revision; original task identity and preview hash remain authoritative.',
    {...base,...live,...draft,expectedPreviewSha256:sha},['desk','expectedInstanceId','task','selections','expectedPreviewSha256'],{idempotent:true}),
  tool('merchant_task_desk_inspect','Open a saved task and require its exact original task hash.',selected,['desk','taskId','expectedTaskSha256'],read),
  tool('merchant_task_desk_compare','Compare two immutable saved task records, including selected original RPC read changes.',
    {...selected,previousId:sha,expectedPreviousTaskSha256:sha},
    ['desk','taskId','expectedTaskSha256','previousId','expectedPreviousTaskSha256'],read),
  tool('merchant_task_desk_review','Obtain the original native Inbox review and its desk-held review ID for the selected intent.',
    {...selected,...live,intentId:text},['desk','taskId','expectedTaskSha256','expectedInstanceId','intentId'],{readOnly:true}),
  tool('merchant_task_desk_execute','Explicitly execute the original reviewed intent once. Retain this requestId; inspect it after a lost response. Native outcome remains separate from command completion.',
    {...selected,...live,intentId:text,reviewId:text,requestId:text},
    ['desk','taskId','expectedTaskSha256','expectedInstanceId','intentId','reviewId','requestId'],{idempotent:true,openWorld:true}),
  tool('merchant_task_desk_recover','Recover the original intent through its existing native operation. This does not create a replacement purchase.',
    {...selected,...live,intentId:text,requestId:text},
    ['desk','taskId','expectedTaskSha256','expectedInstanceId','intentId','requestId'],{idempotent:true,openWorld:true}),
  tool('merchant_task_desk_receive','Continue the same task’s original receiving destination, retaining this request ID. Delivered moved packets remain read-only.',
    {...selected,...live,requestId:text},
    ['desk','taskId','expectedTaskSha256','expectedInstanceId','requestId'],{idempotent:true}),
  tool('merchant_task_desk_operations','Read retained operations; optionally select one original request ID or filter by task. Never dispatches a command.',
    {...base,operationId:text,taskId:sha},['desk'],read),
  tool('merchant_task_desk_packet','Open and fully verify the selected complete packet and original outcomes.',selected,
    ['desk','taskId','expectedTaskSha256'],read),
  tool('merchant_task_desk_packet_file','Read complete original response or whole packet TAR in SHA-pinned chunks. The first read streams to one private descriptor; later chunks do not re-export or require a live desk.',
    {...selected,...live,kind:{type:'string',enum:['response','archive']},intentId:text,
      readId:text,expectedSha256:sha,offset:{type:'integer',minimum:0},
      limit:{type:'integer',minimum:1,maximum:MAX_RETAINED_CHUNK_BYTES}},
    ['desk','taskId','expectedTaskSha256','kind'],read),
  tool('merchant_task_desk_rpc_file','Read one exact full saved RPC response in original SHA-pinned chunks. Retain sourceReadId separately from the temporary file readId.',
    {...base,...live,intentId:text,sourceReadId:text,responseSha256:sha,readId:text,
      expectedSha256:sha,offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:MAX_RETAINED_CHUNK_BYTES}},
    ['desk','intentId','sourceReadId','responseSha256'],read),
  tool('merchant_task_desk_file_release','Release this bridge’s temporary full-file read. The original desk and its saved task/packet remain open.',
    {...base,readId:text},['desk','readId'],read),
 ];
}
