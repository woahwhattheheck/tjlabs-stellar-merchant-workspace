// SPDX-License-Identifier: MIT
// Use the original authenticated caller and its retained operation/file readers.
export async function dispatchDuckDBAnalytics({operation,body,get,post,workspaceId}){
 const route='/api/analytics',encode=value=>encodeURIComponent(String(value));
 const query=values=>{const entries=Object.entries(values).filter(([,value])=>value!==undefined);return entries.length?'?'+new URLSearchParams(entries.map(([key,value])=>[key,String(value)])):'';};
 const catalog={'analytics-analyses':'analyses','analytics-results':'results','analytics-comparisons':'comparisons',
  'analytics-workbooks':'workbooks','analytics-reports':'reports','analytics-operations':'operations'}[operation];
 if(catalog)return get(route+'/'+catalog+query(body));
 if(operation==='analytics-status')return get(route+'/status');
 if(operation==='analytics-source'){const {edition_id,...parameters}=body;return get(route+'/sources/'+encode(edition_id)+query(parameters));}
 if(operation==='analytics-review')return post(route+'/review',body);
 const record={'analytics-analysis':'analyses','analytics-result':'results','analytics-comparison':'comparisons',
  'analytics-workbook':'workbooks','analytics-report':'reports'}[operation];
 if(record){const {id,...parameters}=body;return get(route+'/'+record+'/'+encode(id)+query(parameters));}
 const grid={'analytics-result-rows':'results','analytics-comparison-rows':'comparisons'}[operation];
 if(grid){const {id,...parameters}=body;return get(route+'/'+grid+'/'+encode(id)+'/rows'+query(parameters));}
 const action={'analytics-save-analysis':'analyses','analytics-execute':'run','analytics-compare':'compare',
  'analytics-save-workbook':'workbooks','analytics-publish':'publish'}[operation];
 if(action)return post(route+'/'+action,{...body,workspace_id:workspaceId});
 if(operation==='analytics-request')return get(route+'/requests/'+encode(body.request_id));
 if(operation==='analytics-resume')return post(route+'/requests/'+encode(body.request_id)+'/resume',{workspace_id:workspaceId});
 if(operation==='analytics-export')return post(route+'/exports',body);
 if(operation==='analytics-export-manifest'){
  const value=await get('/api/exports/'+encode(body.export_id));
  const manifest=value?.files?.find(item=>item.name==='manifest.json'),archive=value?.files?.find(item=>item.name==='analytical-workbook.zip');
  const valid=file=>file&&Number.isSafeInteger(file.bytes)&&file.bytes>0&&/^[a-f0-9]{64}$/.test(file.sha256??'');
  if(value?.schema!=='stellar-forge.duckdb-analytics.v1.export'||value.export_id!==body.export_id||
   value.workspace_id!==workspaceId||value.complete!==true||value.state!=='COMPLETE'||
   !valid(manifest)||manifest.bytes>16*1024*1024||!valid(archive))
   throw new Error('MCP_DUCKDB_ANALYTICS_MANIFEST_CHANGED');
  const clean=(file,mime)=>({name:file.name,bytes:file.bytes,sha256:file.sha256,mime});
  return {schema:value.schema,export_id:value.export_id,workspace_id:value.workspace_id,report_id:value.report_id,
   state:'COMPLETE',manifest_file:clean(manifest,'application/json'),archive_file:clean(archive,'application/zip')};
 }
 throw new Error('MCP_DUCKDB_ANALYTICS_OPERATION_NOT_FOUND');
}
