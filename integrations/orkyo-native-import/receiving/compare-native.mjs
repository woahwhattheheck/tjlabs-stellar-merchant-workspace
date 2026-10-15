import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createOrkyoImportAdapter} from '../adapter/orkyo-import.mjs';
import {createOrkyoNativeImportReader} from './native-reader.mjs';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const originals={};
for(const p of ['frontend/src/lib/utils/import-export.ts','frontend/src/lib/utils/export-handlers.ts'])originals[p]=await read('vendor/orkyo-foundation/'+p);
const native=createOrkyoNativeImportReader(originals),api=createOrkyoImportAdapter();
const checks=[];
for(const kind of ['requests','resources']){
 const text=await read('examples/authored-'+kind+'.csv');
 const customFieldTypes=JSON.parse(await read('examples/authored-custom-field-definitions.json'));
 const actual=api.inspect({kind,sourceId:'authored-'+kind,text,typeKey:'machine',customFieldTypes});
 const readNative=kind==='requests'?await native.api.importRequests({text:async()=>text},'csv'):(await native.api.importResources({text:async()=>text},'csv','machine',customFieldTypes)).map(x=>x.request);
 assert.deepEqual(JSON.parse(JSON.stringify(readNative)),actual.rows.map(x=>x.nativePayload));
 checks.push({kind,rows:actual.rows.length,payloadParity:true,needsReview:actual.summary.needsReview});
}
console.log(JSON.stringify({runtime:process.version,sourceCommit:api.SOURCE_COMMIT,checks},null,2));
