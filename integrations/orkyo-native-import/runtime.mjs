// MIT. Compose exact pinned native import semantics with complete editor and host sessions.
import {readFile} from 'node:fs/promises';
import {createArchiveCodec} from './vendor/archive_codec.mjs';
import {createOrkyoImportAdapter} from './adapter/orkyo-import.mjs';
import {createOrkyoWorkbookNativeReader} from './adapter/workbook-native-reader.mjs';
import {createOrkyoWorkbookPlanner} from './adapter/workbook-planner.mjs';
import {createOrkyoReadinessCore} from './desk/readiness-core.mjs';
import {createOrkyoXMLParser} from './desk/xml-reader.mjs';
import {createOrkyoSessionAPI} from './desk/session.mjs';
import * as codec from './host/codec.mjs';
export {codec};
export const archive=createArchiveCodec(),adapter=createOrkyoImportAdapter();
export const native=createOrkyoWorkbookNativeReader(await readFile(new URL('./vendor/orkyo-foundation/frontend/src/lib/utils/spreadsheet-import.ts',import.meta.url),'utf8'));
export const workbook=createOrkyoWorkbookPlanner(native),core=createOrkyoReadinessCore({codec:archive,adapter,workbook}),sessions=createOrkyoSessionAPI(core,archive);
export function applyDomain(workspace,operation){
 if(!operation||!['intake','correct-source','review','prepare','attempt','resolve','abandon','note'].includes(operation.kind))throw Error('Choose an original Orkyo command.');
 return {workspace:core.command(workspace,{id:operation.id,expectedHead:operation.expectedHead,type:operation.kind,at:operation.at,payload:operation.payload})};
}

export const UZIP=Function(await readFile(new URL('./vendor/UZIP.js',import.meta.url),'utf8')+';return UZIP;')();
export const readXlsx=Function('DOMParser',await readFile(new URL('./desk/xlsx-reader.js',import.meta.url),'utf8')+';return readOrkyoXlsx;')(createOrkyoXMLParser());
export function sourceArtifact(bytes,filename,kind){
 const originalFile={filename,base64:archive.base64Encode(bytes),bytes:bytes.length,sha256:archive.sha256(bytes)};
 if(kind==='workbook'){const read=readXlsx(bytes,UZIP);return {filename,text:JSON.stringify(read.sheets,null,2),originalFile,representation:read.basis,notices:read.notices};}
 return {filename,text:archive.utf8Decode(bytes),originalFile};
}
