export function buildOrkyoDesk(files,{authoredWorkspace}={}){
 const get=p=>{if(typeof files[p]!=="string")throw Error("Complete build source missing: "+p);return files[p]};
 const js=x=>JSON.stringify(x).replace(/</g,"\\u003c");
 const workspace=authoredWorkspace||JSON.parse(get("examples/authored-desk-workspace.json"));
 const runtime=[get("vendor/archive_codec.mjs").replace(/^export /gm,""),get("vendor/UZIP.js"),get("adapter/orkyo-import.js"),get("adapter/workbook-native-reader.mjs").replace(/^export /gm,""),get("adapter/workbook-planner.js"),get("desk/readiness-core.js"),get("desk/copy-store.js"),get("desk/xlsx-reader.js"),get("desk/operator.js"),
 "const codec=createArchiveCodec(),adapter=createOrkyoImportAdapter(),native=createOrkyoWorkbookNativeReader("+js(get("vendor/orkyo-foundation/frontend/src/lib/utils/spreadsheet-import.ts"))+"),workbook=createOrkyoWorkbookPlanner(native),core=createOrkyoReadinessCore({codec,adapter,workbook});\nstartOrkyoDesk({core,codec,adapter,workbook,UZIP,authoredWorkspace:"+js(workspace)+"});"].join("\n");
 const html=get("desk/template.html").replace("__STYLE__",()=>get("desk/style.css")).replace("__RUNTIME__",()=>runtime.replace(/<\/script/gi,"<\\/script"));
 const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];if(scripts.length!==1)throw Error("Expected one complete assembled desk script");new Function(scripts[0][1]);
 if(html.includes("__RUNTIME__")||html.includes("__STYLE__"))throw Error("Unfilled build token");return html;
}
