import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import vm from "node:vm";
import {createArchiveCodec} from "../vendor/archive_codec.mjs";
import {createOrkyoReadinessCore} from "./readiness-core.mjs";
import {createOrkyoWorkbookNativeReader} from "../adapter/workbook-native-reader.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),read=p=>fs.readFile(path.join(root,p),"utf8");
const codec=createArchiveCodec(),adapter=Function(await read("adapter/orkyo-import.js")+";return createOrkyoImportAdapter();")(),native=createOrkyoWorkbookNativeReader(await read("vendor/orkyo-foundation/frontend/src/lib/utils/spreadsheet-import.ts")),workbook=Function(await read("adapter/workbook-planner.js")+";return createOrkyoWorkbookPlanner;")()(native),core=createOrkyoReadinessCore({codec,adapter,workbook});
const context={};vm.createContext(context);vm.runInContext(await read("vendor/UZIP.js"),context);const UZIP=context.UZIP;
const [action,...args]=process.argv.slice(2),write=(p,b)=>fs.writeFile(p,b,{flag:"wx"}),workspace=async p=>core.reopen(JSON.parse(await fs.readFile(p,"utf8"))).workspace;
if(action==="course"){
 const directory=path.resolve(args[0]||"");if(!args[0])throw Error("New output directory required");await fs.mkdir(directory);
 const receive=Function(await read("receiving/desk-course.js")+";return receiveOrkyoDesk;")(),nativeFiles={"examples/authored-requests.csv":await read("examples/authored-requests.csv"),"examples/authored-workbook-sheets.json":await read("examples/authored-workbook-sheets.json")},result=receive({core,adapter,workbook,nativeFiles});
 await write(path.join(directory,"Workspace.json"),JSON.stringify(result.workspace,null,2));await write(path.join(directory,"Report.html"),result.report);await write(path.join(directory,"Readiness.csv"),result.exports.readinessCSV);await write(path.join(directory,"Outcomes.csv"),result.exports.outcomesCSV);
 for(const b of core.view(result.workspace).batches){const bytes=b.file.sheets?workbook.buildXlsx(b.file.sheets,UZIP.encode,codec.utf8Encode):b.file.text;await write(path.join(directory,b.id+(b.file.sheets?".xlsx":"."+b.file.filename.split(".").at(-1))),bytes)}
 await write(path.join(directory,"Result.json"),JSON.stringify({schema:result.schema,basis:result.basis,checks:result.checks,commandCount:result.commandCount,head:result.workspace.head},null,2));console.log(JSON.stringify({directory,checks:result.checks.length,commands:result.commandCount}));
}else if(action==="report"){await write(args[1],core.report(await workspace(args[0])));}
else if(action==="view"){console.log(JSON.stringify(core.view(await workspace(args[0])),null,2));}
else if(action==="apply"){const w=await workspace(args[0]),command=JSON.parse(await fs.readFile(args[1],"utf8"));await write(args[2],JSON.stringify(core.command(w,command),null,2));}
else if(action==="batch"){const w=await workspace(args[0]),b=core.view(w).batches.find(x=>x.id===args[1]);if(!b)throw Error("Batch ID not found");await write(args[2],b.file.sheets?workbook.buildXlsx(b.file.sheets,UZIP.encode,codec.utf8Encode):b.file.text);}
else throw Error("Usage: cli.mjs course NEW_DIR | report WORKSPACE OUTPUT | view WORKSPACE | apply WORKSPACE COMMAND OUTPUT | batch WORKSPACE BATCH_ID OUTPUT");
