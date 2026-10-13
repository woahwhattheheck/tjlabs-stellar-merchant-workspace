// MIT. Metadata only; the native invoice workspace opens through the provider's lazy hook.
import { MAX_RETAINED_CHUNK_BYTES } from '../retained-file-contracts.mjs';
export const INVOICE_NATIVE_METHODS = Object.freeze([
  {
    "method": "workspace.describe",
    "mutates": false,
    "required": [],
    "description": "Read current invoice programmes, native source captures, delivery queues and reconciliations."
  },
  {
    "method": "workspace.profile",
    "mutates": true,
    "required": [
      "profile"
    ],
    "description": "Save the organization and operator profile."
  },
  {
    "method": "workspace.history",
    "mutates": false,
    "required": [],
    "description": "Read retained original transitions in complete revision order."
  },
  {
    "method": "request.status",
    "mutates": false,
    "required": [
      "requestId"
    ],
    "description": "Recover the recorded result of an original operator request."
  },
  {
    "method": "programme.save",
    "mutates": true,
    "required": [
      "definition"
    ],
    "description": "Save an immutable programme version with exact assets, invoices and settlement rules."
  },
  {
    "method": "programme.read",
    "mutates": false,
    "required": [
      "programmeId"
    ],
    "description": "Read a selected original programme version."
  },
  {
    "method": "source.catalog",
    "mutates": false,
    "required": [],
    "description": "Read actual configured ElementPay, EVM, Horizon and SDP routes and their filter schemas."
  },
  {
    "method": "source.project",
    "mutates": true,
    "required": [
      "sourceId",
      "recordsPath"
    ],
    "description": "Append a new interpretation of an already retained original source."
  },
  {
    "method": "source.read",
    "mutates": false,
    "required": [
      "sourceId"
    ],
    "description": "Read an original source and all normalized records."
  },
  {
    "method": "source.file",
    "mutates": false,
    "required": [
      "sourceId"
    ],
    "description": "Read an exact byte range of an original source or projection."
  },
  {
    "method": "capture.start",
    "mutates": true,
    "required": [
      "programmeId",
      "connectionAlias",
      "read"
    ],
    "description": "Freeze a programme, original connection, native route and read selection."
  },
  {
    "method": "capture.next",
    "mutates": true,
    "required": [
      "captureId"
    ],
    "description": "Read and retain the next original native response."
  },
  {
    "method": "capture.run",
    "mutates": true,
    "required": [
      "captureId"
    ],
    "description": "Continue the complete original capture through all selected native pages."
  },
  {
    "method": "capture.pause",
    "mutates": true,
    "required": [
      "captureId"
    ],
    "description": "Pause a native capture while preserving its original pending request."
  },
  {
    "method": "capture.resume",
    "mutates": true,
    "required": [
      "captureId"
    ],
    "description": "Resume the retained source selection on the same private connection."
  },
  {
    "method": "receipt.read",
    "mutates": false,
    "required": [
      "receiptId"
    ],
    "description": "Read every authenticated customer webhook attempt and its retained original source."
  },
  {
    "method": "delivery.prepare",
    "mutates": true,
    "required": [
      "programmeId",
      "connectionAlias"
    ],
    "description": "Prepare original listener event bodies from retained EVM events."
  },
  {
    "method": "delivery.read",
    "mutates": false,
    "required": [
      "deliveryId"
    ],
    "description": "Read an original outbound intent and complete backend response attempts."
  },
  {
    "method": "delivery.file",
    "mutates": false,
    "required": [
      "deliveryId"
    ],
    "description": "Read exact original listener request, response or attempt bytes."
  },
  {
    "method": "delivery.next",
    "mutates": true,
    "required": [
      "deliveryId"
    ],
    "description": "Dispatch one ready original listener body or recover its existing pending attempt."
  },
  {
    "method": "delivery.pause",
    "mutates": true,
    "required": [
      "deliveryId"
    ],
    "description": "Pause an outbound job without changing its original delivery outcome."
  },
  {
    "method": "delivery.resume",
    "mutates": true,
    "required": [
      "deliveryId"
    ],
    "description": "Resume an outbound job on the same original backend."
  },
  {
    "method": "delivery.resolve",
    "mutates": true,
    "required": [
      "deliveryId",
      "outcome",
      "actor",
      "reason"
    ],
    "description": "Resolve a retained outcome from matching original order records, or explicitly retry/cancel it."
  },
  {
    "method": "delivery.run",
    "mutates": true,
    "required": [],
    "description": "Process a frozen complete selection of ready listener jobs, retaining each response independently."
  },
  {
    "method": "delivery.run.pause",
    "mutates": true,
    "required": [
      "runId"
    ],
    "description": "Pause the selected original outbound run."
  },
  {
    "method": "delivery.run.resume",
    "mutates": true,
    "required": [
      "runId"
    ],
    "description": "Resume the same retained outbound run and pending job selection."
  },
  {
    "method": "horizon.review",
    "mutates": false,
    "required": [
      "programmeId",
      "programmeVersion",
      "registerSourceId",
      "sourceIds"
    ],
    "description": "Compare complete original Horizon deposits with explicit invoice account, memo, asset and sender mappings."
  },
  {
    "method": "horizon.apply",
    "mutates": true,
    "required": [
      "programmeId",
      "programmeVersion",
      "registerSourceId",
      "sourceIds",
      "reviewSha256",
      "choices",
      "actor"
    ],
    "description": "Save individually reviewed deposit links through the original decision writer in one transaction."
  },
  {
    "method": "decision.save",
    "mutates": true,
    "required": [
      "programmeId",
      "recordId",
      "action",
      "actor",
      "reason"
    ],
    "description": "Append an explained original-record link, exclusion or corrective decision."
  },
  {
    "method": "decision.read",
    "mutates": false,
    "required": [
      "decisionId"
    ],
    "description": "Read an immutable original reconciliation decision."
  },
  {
    "method": "reconciliation.create",
    "mutates": true,
    "required": [
      "programmeId"
    ],
    "description": "Reconcile selected original orders, chain events, payouts and decisions against invoices."
  },
  {
    "method": "edition.read",
    "mutates": false,
    "required": [
      "reconciliationId"
    ],
    "description": "Read a complete retained reconciliation edition."
  },
  {
    "method": "reconciliation.compare",
    "mutates": false,
    "required": [
      "leftId",
      "rightId"
    ],
    "description": "Compare baseline and following invoice/order balances and original references."
  },
  {
    "method": "report.create",
    "mutates": true,
    "required": [
      "reconciliationId"
    ],
    "description": "Render complete scoped invoice/settlement reports in HTML, JSON and CSV."
  },
  {
    "method": "report.read",
    "mutates": false,
    "required": [
      "reportId"
    ],
    "description": "Read the original report manifest and all complete member descriptors."
  },
  {
    "method": "report.file",
    "mutates": false,
    "required": [
      "reportId"
    ],
    "description": "Read an exact original report byte range."
  }
]);
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
const uuid={type:'string',pattern:'^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$'};
const hash={type:'string',pattern:'^[a-f0-9]{64}$'},revision={type:'integer',minimum:0};
const selected={workspace:alias},read={readOnly:true,idempotent:true},change={idempotent:false};
export const definitions=[
 ['merchant_invoice_workspaces','List host-declared invoice workspace aliases and their owned runtime state.',{},[],read],
 ['merchant_invoice_open','Open the original native workspace with host-private source connections.',selected,['workspace'],{idempotent:true}],
 ['merchant_invoice_close','Drain the exact currently owned native operator and file reads.',{...selected,instanceId:uuid},['workspace','instanceId'],change],
 ['merchant_invoice_status','Read the original native identity, revision, source/capture/delivery/report state.',selected,['workspace'],read],
 ['merchant_invoice_methods','Read complete native method declarations and original required fields.',selected,['workspace'],read],
 ['merchant_invoice_read','Invoke an original native read method with its complete original arguments.',{...selected,method:{type:'string',enum:INVOICE_NATIVE_METHODS.filter(x=>!x.mutates).map(x=>x.method)},args:{type:'object'}},['workspace','method','args'],read],
 ['merchant_invoice_change','Invoke one original native change; preserve its request UUID, expected revision and arguments.',{...selected,method:{type:'string',enum:INVOICE_NATIVE_METHODS.filter(x=>x.mutates).map(x=>x.method)},args:{type:'object'}},['workspace','method','args'],change],
 ['merchant_invoice_inputs','List configured original input aliases, or inspect complete bytes/SHA256 of one input.',{...selected,input:alias},['workspace'],read],
 ['merchant_invoice_import','Import complete hash-pinned bytes from a configured original source alias through source.import.',{...selected,input:alias,expectedSha256:hash,args:{type:'object'}},['workspace','input','expectedSha256','args'],change],
 ['merchant_invoice_export','Export a complete source-inclusive workspace or original report to the host private export root.',{...selected,requestId:uuid,expectedRevision:revision,kind:{type:'string',enum:['workspace','report']},reportId:uuid,includeApplication:{type:'boolean'}},['workspace','requestId','expectedRevision','kind'],change],
 ['merchant_invoice_files','List every immutable original package member, including its native manifest.',{...selected,publicationId:uuid},['workspace','publicationId'],read],
 ['merchant_invoice_file_read','Read an exact listed original member in retained Base64 chunks.',{...selected,publicationId:uuid,file:{type:'string',minLength:1,maxLength:1024},expectedSha256:hash,readId:uuid,offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:MAX_RETAINED_CHUNK_BYTES}},['workspace','publicationId','file','expectedSha256'],read],
 ['merchant_invoice_file_release','Release the original retained file snapshot.',{...selected,readId:uuid},['workspace','readId'],read]
];
export const invoiceSettlementTools=tool=>definitions.map(row=>tool(...row));
