'use strict';
const migration=require("./migration-core.js"),codec=require("./migration-codec.js");
const comparison=require("./crm-comparison.cjs").createCrmComparison({sha256Utf8:s=>({bytes:codec.utf8Encode(s).length,sha256:codec.sha256(codec.utf8Encode(s))}),parseCSV:migration.csv});
const workspace=require("./crm-workspace.cjs").createCrmWorkspace({migration,comparison});
const report=require("./crm-report.cjs").createCrmReport({});
const zipper=require("./crm-zip.cjs").createCrmZip(codec);
function safe(s){return encodeURIComponent(s);}
function exportFiles(ws){workspace.validate(ws);const out={"workspace.json":JSON.stringify(workspace.archive(ws),null,2)+"\n","operations.json":JSON.stringify(ws.operations,null,2)+"\n","START_HERE.txt":"Complete CRM migration workspace. Original CSV bytes are retained. Reopen workspace.json in the desktop desk or CLI. Each configuration and rehearsal remains separate. Reports include named review decisions.\n"};for(const s of Object.values(ws.sourceWorkspace.sources))out["originals/"+safe(s.id)+"/"+safe(s.filename)]=s.content;for(const c of Object.values(ws.contracts))out["configurations/"+safe(c.id)+".json"]=JSON.stringify(c,null,2)+"\n";for(const r of Object.values(ws.runs)){out["reports/"+safe(r.id)+".txt"]=report.text(ws,r.id);out["reports/"+safe(r.id)+".html"]=report.html(ws,r.id);out["reports/"+safe(r.id)+".csv"]=workspace.findingCSV(ws,r.id);}return out;}
module.exports={migration,codec,comparison,workspace,report,zipper,exportFiles};