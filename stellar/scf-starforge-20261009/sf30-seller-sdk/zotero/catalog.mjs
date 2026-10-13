// MIT. Customer-agent tools for the original Zotero workspace.
import {ZOTERO_AGENT_ACTIONS,ZOTERO_AGENT_VIEWS} from './agent-requests.mjs';
export {ZOTERO_AGENT_ACTIONS,ZOTERO_AGENT_VIEWS};
const string={type:'string'},object={type:'object'},uuid={type:'string',format:'uuid'};
export function zoteroTools(tool){
 const rows=[],add=(name,description,properties,required=[])=>rows.push(tool(name,description,properties,required));
 const workspace={workspace:string};
 add('merchant_zotero_workspaces','List configured original Zotero workspaces, admitted/cleanup state, and source-file aliases.',{});
 add('merchant_zotero_open','Attach to the exact saved original workspace and current listener; owned mode starts its original server.',workspace,['workspace']);
 add('merchant_zotero_view','Read an original native page/record/history, project, capture, or Research preview. Use paged project.page for large libraries.',{...workspace,method:{enum:ZOTERO_AGENT_VIEWS},input:object},['workspace','method']);
 add('merchant_zotero_save','Save and start an exact original mutation UUID in the project. Poll request; capture.prepare completion means capture was started, so inspect capture.get for source completion.',{...workspace,request:{type:'object',properties:{requestId:uuid,method:{enum:ZOTERO_AGENT_ACTIONS.filter(x=>x!=='documents.import')},input:object},required:['requestId','method','input'],additionalProperties:false}},['workspace','request']);
 add('merchant_zotero_request','Read the saved exact request, original outcome and restart status.',{...workspace,requestId:uuid},['workspace','requestId']);
 add('merchant_zotero_resume','Resume that exact retained original request and imported bytes; never replace an uncertain request UUID.',{...workspace,requestId:uuid},['workspace','requestId']);
 add('merchant_zotero_cancel','Save an original capture cancellation with its own UUID. The original engine preserves capture-attempt identity; this works while other tool work is pending.',{...workspace,requestId:uuid,captureId:string},['workspace','requestId','captureId']);
 add('merchant_zotero_import','Import one configured complete original document-set file against its exact profile revision. Its full bytes and identity remain in the project.',{...workspace,requestId:uuid,profileId:string,profileRevision:{type:'integer',minimum:1},sourceFile:string},['workspace','requestId','profileId','profileRevision','sourceFile']);
 add('merchant_zotero_export','Freeze and receive a complete original workspace or record/document export. Repeating exportId preserves the same selection/revision and complete bytes.',{...workspace,exportId:uuid,selection:{type:'object',properties:{kind:{enum:['workspace','record']},record:object},required:['kind'],additionalProperties:false}},['workspace','exportId','selection']);
 add('merchant_zotero_file_read','Read bounded original bytes from an already received complete export. Resume by original SHA256 and byte offset.',{...workspace,exportId:uuid,readId:uuid,expectedSha256:{type:'string',pattern:'^[a-f0-9]{64}$'},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:196608}},['workspace','exportId']);
 add('merchant_zotero_file_release','Release the same owned retained file descriptor.',{...workspace,readId:uuid},['workspace','readId']);
 add('merchant_zotero_receive','Receive a configured full original JSON workspace into the original named child; all saved sources/history and linked Research dossiers remain editable.',{...workspace,requestId:uuid,name:string,sourceFile:string},['workspace','requestId','name','sourceFile']);
 add('merchant_zotero_receiver','Reopen the original completed named receiver and return its real workspace/listener identities.',{...workspace,name:string},['workspace','name']);
 add('merchant_zotero_close','Close this exact returned instance. Managed mode detaches; owned mode drains the original listener, native source work and named children. Retry same-instance cleanup when needed.',{...workspace,instanceId:uuid},['workspace','instanceId']);
 return rows;
}
