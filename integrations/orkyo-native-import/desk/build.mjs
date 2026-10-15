import {createArchiveCodec} from '../vendor/archive_codec.mjs';
export function buildOrkyoDesk(files,{authoredWorkspace,carrier=null,managed=null}={}){
 const get=p=>{if(typeof files[p]!=='string')throw Error('Complete build source missing: '+p);return files[p]};
 const js=x=>JSON.stringify(x).replace(/</g,'\\u003c'),strip=x=>x.replace(/^import .*;\s*$/gm,'').replace(/^export \{[^\n]*\};?\s*$/gm,'').replace(/^export /gm,'');
 const c=createArchiveCodec(),source=c.encodeSourceBank(JSON.stringify(files)),boot=carrier?c.encodeSourceBank(JSON.stringify(carrier)):null;
 const workspace=authoredWorkspace||JSON.parse(get('examples/authored-desk-workspace.json'));
 const runtime=[strip(get('vendor/archive_codec.mjs')),get('vendor/UZIP.js'),get('adapter/orkyo-import.js'),strip(get('adapter/workbook-native-reader.mjs')),get('adapter/workbook-planner.js'),get('desk/readiness-core.js'),get('desk/copy-store.js'),get('desk/xlsx-reader.js'),strip(get('desk/session.mjs')),strip(get('desk/build.mjs')),strip(get('host/export-core.mjs')),
 "const zip=(function(){const module={exports:{}};"+get('host/connected_zip.cjs')+";return module.exports;})();",
 ...(managed?[get('host/managed.js')]:[]),get('desk/operator.js'),
 "const codec=createArchiveCodec(),adapter=createOrkyoImportAdapter(),native=createOrkyoWorkbookNativeReader("+js(get('vendor/orkyo-foundation/frontend/src/lib/utils/spreadsheet-import.ts'))+"),workbook=createOrkyoWorkbookPlanner(native),core=createOrkyoReadinessCore({codec,adapter,workbook}),sessions=createOrkyoSessionAPI(core,codec);",
 "const sourceFiles=codec.decodeSourceBank("+js(source.gzipBase64)+","+js(source.sha256)+").bank,initialCarrier="+(boot?"codec.decodeSourceBank("+js(boot.gzipBase64)+","+js(boot.sha256)+").bank":"null")+";",
 "startOrkyoDesk({core,codec,adapter,workbook,UZIP,sessions,sourceFiles,zip,initialCarrier,managedConfig:"+js(managed)+",authoredWorkspace:"+js(workspace)+"});"].join('\n');
 const template=get('desk/template.html');if(template.split('__RUNTIME__').length!==2||template.split('__STYLE__').length!==2)throw Error('Expected exactly one complete runtime and style slot');
 const html=template.replace('__STYLE__',()=>get('desk/style.css')).replace('__RUNTIME__',()=>runtime.replace(/<\/script/gi,'<\\/script'));
 const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];if(scripts.length!==1)throw Error('Expected one complete assembled desk script');new Function(scripts[0][1]);
 return html;
}
