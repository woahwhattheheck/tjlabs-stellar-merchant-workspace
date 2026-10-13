// MIT. Original catalogue TEMP staging, complete EOF before sampled rows.
import { randomUUID } from 'node:crypto';
import { readBMEcat } from './input.mjs';
import { bmecatFailure } from './parser.mjs';
import { projectBMEcatProduct,bmecatDocumentMetadata } from './projection.mjs';
const fail=(code,message)=>{throw bmecatFailure(code,message);};
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;};
const abort=signal=>{if(signal?.aborted)throw signal.reason??bmecatFailure('ABORTED','Original source receiving was cancelled.');};
export async function* readBMEcatSourceRows(filename,context={}){
  const {db,signal,expectedBytes,expectedSha256,limits,onDocument,validateRow}=context;
  if(!db||typeof db.exec!=='function'||typeof db.prepare!=='function')fail('CATALOG_CONTEXT','Use the original catalogue SQLite connection.');
  if(onDocument!==undefined&&typeof onDocument!=='function')fail('DOCUMENT_CALLBACK','Use an original source metadata callback.');
  if(validateRow!==undefined&&typeof validateRow!=='function')fail('ROW_CALLBACK','Use an original catalogue row validation callback.');
  const name='catalog_bmecat_'+randomUUID().replaceAll('-',''),batchName=name+'_batch';
  let created=false,batch=[],batchBytes=0,complete=null,header=null;
  try{
    db.exec('CREATE TEMP TABLE "'+name+'" (ordinal INTEGER PRIMARY KEY, supplier_pid TEXT NOT NULL UNIQUE, record_json TEXT NOT NULL)');
    created=true;
    const put=db.prepare('INSERT INTO temp."'+name+'" VALUES(?,?,?)');
    const flush=()=>{
      if(!batch.length)return;abort(signal);db.exec('SAVEPOINT "'+batchName+'"');
      try{for(const item of batch)put.run(item.ordinal,item.id,item.json);db.exec('RELEASE SAVEPOINT "'+batchName+'"');}
      catch(error){try{db.exec('ROLLBACK TO SAVEPOINT "'+batchName+'"');}finally{db.exec('RELEASE SAVEPOINT "'+batchName+'"');}throw error;}
      batch=[];batchBytes=0;
    };
    for await(const event of readBMEcat(filename,{signal,expectedBytes,expectedSha256,limits})){
      abort(signal);if(complete)fail('EVENT_ORDER','Original parser emitted events after EOF.');
      if(event.type==='header'){if(header)fail('HEADER','Repeated completed source header.');header=event.header;}
      else if(event.type==='complete')complete=event;
      else if(event.type==='product'){
        if(!header)fail('HEADER','Product preceded the complete header.');
        const idNode=event.product.children.find(n=>typeof n==='object'&&n.namespace===event.product.namespace&&n.name==='SUPPLIER_PID');
        const id=idNode.children.filter(x=>typeof x==='string').join('');
        const json=JSON.stringify(event);batch.push({ordinal:event.ordinal,id,json});batchBytes+=Buffer.byteLength(json);
        if(batch.length>=250||batchBytes>=2*1024*1024)flush();
      }else fail('EVENT','Unknown original XML event.');
    }
    flush();
    if(!complete||!header)fail('EOF','Require the complete verified original source before catalogue rows.');
    const count=db.prepare('SELECT COUNT(*) AS n FROM temp."'+name+'"').get().n;
    if(count!==complete.productCount)fail('STAGE_CHANGED','Original product count differs from the complete staging receipt.');
    const metadata=freeze(bmecatDocumentMetadata(complete));
     // Every product including the sampled tail must be projectable before upload
    // can accept its first row. Store this bounded projection in the same table.
    const update=db.prepare('UPDATE temp."'+name+'" SET record_json=? WHERE ordinal=?');
    const nextBatch=db.prepare('SELECT ordinal,record_json FROM temp."'+name+'" WHERE ordinal>? ORDER BY ordinal LIMIT 1');
    let cursor=0;
    for(;;){
      const rows=nextBatch.all(cursor);if(!rows.length)break;
      for(const staged of rows){
        abort(signal);const row=projectBMEcatProduct(JSON.parse(staged.record_json),complete);
        const json=JSON.stringify(row);
        if(Buffer.byteLength(json)>2*1024*1024)fail('PROJECTED_ROW_LIMIT','The source-faithful projected product exceeds the catalogue material budget.');
        if(validateRow)await validateRow(freeze(row));
        update.run(json,staged.ordinal);cursor=staged.ordinal;
      }
    }
    if(onDocument)await onDocument(metadata);
    for(const staged of db.prepare('SELECT record_json FROM temp."'+name+'" ORDER BY ordinal').iterate()){
      abort(signal);yield freeze(JSON.parse(staged.record_json));
    }
  }finally{batch=[];if(created)db.exec('DROP TABLE temp."'+name+'"');}
}
