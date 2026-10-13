// SPDX-License-Identifier: MIT
import {ACTIONS} from './contract.mjs';
const uuid={type:'string',pattern:'^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$'},sha={type:'string',pattern:'^[a-f0-9]{64}$'},
 alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'},integer={type:'integer',minimum:0},bound={workspace:alias,instanceId:uuid},required=['workspace','instanceId'];
const read={readOnly:true,idempotent:true},saved={idempotent:true};
export function pirateMerchantTools(tool){return [
 tool('merchant_pirate_workspaces','List host-selected Pirate Weather workspaces and source bindings.',{},[],read),
 tool('merchant_pirate_connect','Borrow the existing original listener and retain its current instance ID.',{workspace:alias},['workspace'],saved),
 tool('merchant_pirate_state','Read contract revisions, retained forecasts, reports, reviews, native releases, receiving and original requests.',bound,required,read),
 tool('merchant_pirate_read','Read an exact retained source, report page, comparison, native state or source-bound preview.',{...bound,method:{enum:['contract','capture','report','compare','operation','request-preview','source-preview','provider.recovery-preview','dataset.query','release.inspect','release.recovery-preview','buyer.inspect','project.preview']},input:{type:'object'}},[...required,'method'],read),
 tool('merchant_pirate_action','Execute one explicitly reviewed action with a stable original UUID and displayed workspace revision. Only capture.fetch makes a provider request. Native activation/start and Buyer intake remain explicit.',{...bound,operationId:uuid,expectedRevision:integer,action:{enum:ACTIONS},payload:{type:'object'}},[...required,'operationId','expectedRevision','action','payload'],{idempotent:true,openWorld:true}),
 tool('merchant_pirate_recover','Read the original saved request and accepted result after a lost reply. No replay.',{...bound,operationId:uuid},[...required,'operationId'],read),
 tool('merchant_pirate_resume','Resume the same accepted request. An unknown provider/native invocation requires original-source reconciliation and is never repeated.',{...bound,operationId:uuid},[...required,'operationId'],saved),
 tool('merchant_pirate_file_read','Read a verified original output using the maintained bounded file reader; preserve the read ID, exact digest and offset.',{...bound,id:sha,expectedSha256:sha,readId:uuid,offset:integer,limit:{type:'integer',minimum:1,maximum:1048576}},[...required,'id','expectedSha256'],read),
 tool('merchant_pirate_file_release','Release this operator’s retained immutable file handle.',{...bound,readId:uuid},[...required,'readId'],saved),
 tool('merchant_pirate_project_upload','Retain an exact source ZIP from the host-selected project input directory; receiving requires a separate reviewed request.',{...bound,id:uuid,filename:{type:'string',maxLength:244},expectedSha256:sha},[...required,'id','filename','expectedSha256'],saved),
 tool('merchant_pirate_project_open','Open the already received original workspace under the existing host owner, with its exact included-source verification.',{...bound,operationId:uuid},[...required,'operationId'],saved),
 tool('merchant_pirate_disconnect','Close this operator connection and its own file readers. Applications retains the workspace process.',bound,required,saved)
];}
