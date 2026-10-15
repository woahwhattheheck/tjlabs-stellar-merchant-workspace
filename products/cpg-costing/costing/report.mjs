const escape=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const md=s=>String(s??"").replace(/[\\|*_`<>]/g,c=>"\\"+c).replace(/\r?\n/g," ");
const amount=v=>v?((v.value??"Unavailable")+" ["+v.status+"]"+(v.missing?.length?" — "+v.missing.join("; "):"")):"Unavailable";
export function reportMarkdown(report){
 const out=["# CPG costing rehearsal","",report.currency+" · as of "+report.asOf,"","An owner-selected analytical comparison. Accounting, production and compliance approval remain with the responsible team.","","## Overall","","Contribution: "+amount(report.summary.contribution),"","Complete selected calculation: "+(report.summary.ready?"yes":"no"),""];
 for(const [table,title,metric]of[["lots","Received lots","landedCost"],["boms","Recipe revisions","unitCost"],["batches","Production batches","unitCost"],["sales","Channel sales","contribution"]]){
 out.push("## "+title,"","| Record | Item / channel | Selected amount |","| --- | --- | --- |");
 for(const r of report[table])out.push("| "+md(r.id)+" | "+md(r.itemId||r.sku||r.channel)+" | "+md(amount(r[metric]))+" |");
 out.push("");
 }
 out.push("## Revenue and fee treatment","");
 for(const r of report.sales)out.push("- "+md(r.id)+": "+md(r.revenueBasis)+" recorded revenue; "+md(r.quantity)+" "+md(r.unit)+"; "+md(r.periodStart)+" through "+md(r.periodEnd)+". Rate base: "+md(r.rateBase)+". Fee treatment: "+r.feeTreatments.map(f=>md(f.id+"="+f.treatment)).join(", ")+".");
 out.push("","## Findings","");
 if(!report.findings.length)out.push("No structural source/model findings. Completeness still depends on the selected records and declared coverage.");
 for(const f of report.findings)out.push("- "+md(f.severity+" / "+f.code+" / "+f.path)+": "+md(f.message));
 out.push("","## Calculation conventions","",...report.assumptions.map(s=>"- "+s),"","Full JSON retains every exact rational amount, original-source reference and selected input.");
 return out.join("\n")+"\n";
}
export function reportHTML(report){const text=reportMarkdown(report);return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>CPG costing report</title><style>body{max-width:78rem;margin:auto;padding:2rem;font:16px/1.55 system-ui;color:#202020;background:#fff}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}</style></head><body><main><pre>"+escape(text)+"</pre></main></body></html>";}
export function reportCSV(report){const cell=x=>{let s=String(x??"");if(/^[=+\-@\t\r]/.test(s)&&!/^-?\d+(?:\.\d+)?$/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};const rows=[["section","id","sku_or_item","channel","metric","value","status","numerator","denominator","missing","currency","as_of"]];
 for(const section of ["lots","boms","batches","sales"])for(const r of report[section])for(const [k,v]of Object.entries(r))if(v&&typeof v==="object"&&Object.prototype.hasOwnProperty.call(v,"status"))rows.push([section,r.id,r.sku||r.itemId||"",r.channel||"",k,v.value??"",v.status,v.exact?.numerator||"",v.exact?.denominator||"",(v.missing||[]).join("; "),report.currency,report.asOf]);
 return rows.map(r=>r.map(cell).join(",")).join("\r\n")+"\r\n";
}
