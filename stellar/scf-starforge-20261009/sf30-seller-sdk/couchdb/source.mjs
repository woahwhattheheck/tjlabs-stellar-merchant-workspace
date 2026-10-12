// MIT. Reviewed original JSON-pointer fields join the existing dataset engine.
import { setImmediate } from 'node:timers/promises';
import { csvLine } from '../postgres/publisher/plan.mjs';
import { datasetExtractionOptions } from '../postgres/publisher/stream.mjs';
import { readCouchdbSourceFile } from './declaration.mjs';
import { readCouchdbCapture } from './capture.mjs';
import { sourceValue, object, need, identity, decimalCompare, HASH } from './common.mjs';

export function checkCouchdbColumnTypes(columns,types){
  need(Array.isArray(types),'COUCHDB_COLUMN_TYPES_MISSING');
  for(const [name,spec] of Object.entries(columns)){
    const source=types.find(column=>column.name===name);
    need(source&&source.type===spec.type&&Boolean(source.nullable)===Boolean(spec.nullable),'COUCHDB_COLUMN_TYPE_CHANGED','Use the reviewed source type and null mapping for '+name+'.');
  }
}
export function projectCouchdbValue(parsed,spec){
  const value=sourceValue(parsed,spec.pointer);
  if(!value.present){need(spec.missing==='null'&&spec.nullable,'COUCHDB_PUBLIC_FIELD_MISSING','The selected document has no original field at '+spec.pointer+'.');return null;}
  if(value.kind==='string'&&value.value===''&&spec.empty==='null'){need(spec.nullable,'COUCHDB_PUBLIC_NULL_NOT_ALLOWED');return null;}
  if(spec.encoding==='json')return value.text;
  if(value.kind==='null'){need(spec.nullable,'COUCHDB_PUBLIC_NULL_NOT_ALLOWED');return null;}
  if(spec.encoding==='decimal'){need(value.kind==='number','COUCHDB_PUBLIC_DECIMAL_REQUIRED');return value.text;}
  if(spec.type==='string'){need(value.kind==='string'&&value.value.isWellFormed(),'COUCHDB_PUBLIC_TEXT_REQUIRED','Choose exact JSON encoding for a non-text native field.');return value.value;}
  if(spec.type==='boolean'){need(value.kind==='boolean','COUCHDB_PUBLIC_BOOLEAN_REQUIRED');return value.value;}
  need(value.kind==='number','COUCHDB_PUBLIC_NUMBER_REQUIRED','Choose the original native number or an exact text encoding.');
  const number=Number(value.text);
  need(Number.isFinite(number)&&!Object.is(number,-0)&&(!Number.isInteger(number)||Number.isSafeInteger(number))&&decimalCompare(value.text,String(number))===0,'COUCHDB_PUBLIC_NUMBER_PRECISION','This original value needs Decimal text or Exact JSON encoding to preserve its precision.');
  if(spec.type==='integer')need(Number.isSafeInteger(number),'COUCHDB_PUBLIC_INTEGER_REQUIRED');
  return number;
}
function scalar(value,spec){
  if(value===null){need(spec.nullable,'COUCHDB_PUBLIC_NULL_NOT_ALLOWED');return '';}
  need(spec.type==='string'&&typeof value==='string'||spec.type==='boolean'&&typeof value==='boolean'||spec.type==='integer'&&Number.isSafeInteger(value)||spec.type==='number'&&typeof value==='number'&&Number.isFinite(value),'COUCHDB_PUBLIC_VALUE_CHANGED');
  const result=String(value);
  need(result.length||!spec.nullable,'COUCHDB_EMPTY_NULL_AMBIGUOUS','Select explicit empty-to-null or a non-nullable text column to preserve the original distinction.');
  return result;
}
export function encodeCouchdbRow(row,dataset){
  return csvLine(Object.entries(dataset.columns).map(([name,spec])=>{const value=scalar(row[name],spec);need(value.length<=dataset.maxCellChars,'COUCHDB_PUBLIC_CELL_TOO_LARGE');return value;}));
}
export function reviewedCouchdbDocuments(capture,query){
  const index=new Map(capture.documents.map(document=>[document.id,document]));
  const selected=query.documentIds?query.documentIds.map(id=>{const doc=index.get(id);need(doc,'COUCHDB_DOCUMENT_OUTSIDE_CAPTURE','This public selection names a document outside the reviewed capture.');return doc;}):capture.documents;
  const counts={selectedDocuments:selected.length,activeDocuments:selected.filter(d=>d.status==='DOCUMENT').length,deletedDocuments:selected.filter(d=>d.status==='DELETED').length,missingDocuments:selected.filter(d=>d.status==='MISSING').length,conflictDocuments:selected.filter(d=>d.conflicts.length||d.deletedConflicts.length||d.leafRevisions.length>1).length,concurrentChanges:capture.manifest.counts.concurrentChanges};
  need(!counts.deletedDocuments||query.review.allowDeletions===true,'COUCHDB_DELETION_REVIEW_REQUIRED','Review the native deleted documents before publishing the remaining winning revisions.');
  need(!counts.missingDocuments||query.review.allowMissing===true,'COUCHDB_MISSING_REVIEW_REQUIRED','Review the native missing-document rows before publishing the remaining winning revisions.');
  need(!counts.conflictDocuments||query.review.allowConflicts===true,'COUCHDB_CONFLICT_REVIEW_REQUIRED','Review the reported native leaf/conflict revisions before selecting their returned winning bodies.');
  need(!counts.concurrentChanges||query.review.allowConcurrentChanges===true,'COUCHDB_CONCURRENT_READ_REVIEW_REQUIRED','Review the original sequence interval across these native pages.');
  return {documents:selected.filter(d=>d.status==='DOCUMENT'),counts};
}
const queryDescription=query=>({sql:query.sql,columns:query.columns,parameters:{},parameterOrder:[],
  columnTypes:Object.entries(query.projection).map(([name,spec])=>({name,type:spec.type,nullable:spec.nullable})),
  source:{projection:query.projection,documentIds:query.documentIds,review:query.review}});
export function couchdbObservation(capture){
  return {schema:'stellar-forge.couchdb-source-observation.v1',provider:'couchdb',readOnly:true,kind:'RETAINED_NATIVE_REVISIONS',
    captureId:capture.manifest.id,sourceId:capture.manifest.sourceId,manifestSha256:capture.manifestSha256,
    engine:capture.manifest.engine,startedAt:capture.manifest.startedAt,completedAt:capture.manifest.completedAt,
    before:capture.manifest.before.updateSequence,after:capture.manifest.after.updateSequence,endSequence:capture.manifest.endSequence,counts:capture.manifest.counts};
}
export async function inspectCouchdbSource(filename){
  const selected=await readCouchdbSourceFile(filename),capture=await readCouchdbCapture(selected.captureFile,selected.config.capture.sha256);
  return {hash:selected.hash,bytes:selected.original.length,sourceName:'CouchDB',connectionKind:'retained-native-capture',
    observation:couchdbObservation(capture),queries:Object.fromEntries(Object.entries(selected.queries).map(([name,query])=>[name,queryDescription(query)]))};
}
export async function openCouchdbSourceFile(filename){
  const selected=await readCouchdbSourceFile(filename),capture=await readCouchdbCapture(selected.captureFile,selected.config.capture.sha256);
  const types=Object.fromEntries(Object.entries(selected.queries).map(([name,query])=>[name,queryDescription(query).columnTypes]));
  let closed=false,active=false,activeDone=null;
  const lifetime=new AbortController();
  return {source:{
    inspect:()=>({columnTypes:structuredClone(types),observation:couchdbObservation(capture)}),
    async exportDataset(name,input={},supplied={}){
      need(!closed,'COUCHDB_SOURCE_CLOSED');need(!active,'COUCHDB_SOURCE_BUSY');
      const query=selected.queries[name];need(query,'COUCHDB_QUERY_NOT_FOUND');
      need(object(input)&&!Object.keys(input).length,'COUCHDB_QUERY_INPUT_NOT_SUPPORTED');
      const {signal,onRow,...declared}=supplied,options=datasetExtractionOptions(query,declared);
      need(typeof onRow==='function','COUCHDB_ROW_CONSUMER_REQUIRED');
      const timeout=AbortSignal.timeout(options.timeoutMs),abort=AbortSignal.any([lifetime.signal,timeout,...(signal?[signal]:[])]);
      const ensure=()=>need(!abort.aborted,timeout.aborted?'COUCHDB_EXTRACTION_TIMEOUT':'COUCHDB_EXTRACTION_CANCELLED');
      let finish;activeDone=new Promise(resolve=>{finish=resolve;});active=true;
      try{
        const reviewed=reviewedCouchdbDocuments(capture,query);
        need(reviewed.documents.length<=options.maxRows,'COUCHDB_EXTRACTION_ROW_LIMIT');
        const rows=[];let sourceTextBytes=0;
        for(let index=0;index<reviewed.documents.length;index++){
          ensure();if(index%64===0){await setImmediate();ensure();}
          const native=await capture.readDocument(reviewed.documents[index].id);ensure();
          const row=Object.fromEntries(Object.entries(query.projection).map(([alias,spec])=>[alias,projectCouchdbValue(native.parsed,spec)]));
          let size=0;for(const [alias,spec] of Object.entries(query.projection))size+=Buffer.byteLength(scalar(row[alias],spec));
          need(size<=options.maxRowBytes,'COUCHDB_EXTRACTION_ROW_TOO_LARGE');
          sourceTextBytes+=size;need(sourceTextBytes<=options.maxBytes,'COUCHDB_EXTRACTION_BYTE_LIMIT');
          rows.push({row,ordinal:index});
        }
        rows.sort((a,b)=>{for(const order of options.order){const x=a.row[order.column],y=b.row[order.column];if(x===y)continue;if(x===null||y===null)return x===null?1:-1;return (x<y?-1:1)*(order.direction==='asc'?1:-1);}return a.ordinal-b.ordinal;});
        for(let index=0;index<rows.length;index++){ensure();await onRow(rows[index].row,types[name],{rowCount:index+1,sourceTextBytes});ensure();}
        return {schema:'stellar-forge.couchdb-dataset-extraction.v1',query:name,rowCount:rows.length,sourceTextBytes,columns:[...query.columns],columnTypes:types[name],order:options.order,
          valueEncoding:'reviewed-json-values',nullEncoding:'json-null',observation:couchdbObservation(capture),
          publicSelection:{documentIds:query.documentIds,counts:reviewed.counts,projection:query.projection,review:query.review,querySha256:identity(query)}};
      }finally{active=false;activeDone=null;finish();}
    },
    async close(){closed=true;lifetime.abort();if(activeDone)await activeDone;}
  }};
}
