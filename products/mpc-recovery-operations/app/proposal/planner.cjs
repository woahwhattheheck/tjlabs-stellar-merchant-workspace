"use strict";
const SCHEMA="mpc-backup-planning/v1";
const DEFAULTS={
 schema:SCHEMA,name:"MPC issued baseline — editable planning case",
 assumptions:{frontEndTB:41,growthTBPerYear:1,years:0,dailyChangedFraction:0.02,storedFraction:1,transferFraction:1,bandwidthGbps:4,throughputFactor:1,runEveryHours:24,dailyWindowHours:12,fullWindowHours:60,completeTransferMethod:"active",m365TB:null},
 repositories:{
 local:{chains:4,daysPerChain:7,changeMode:"incremental",archiveFullCopies:0,workspaceFullCopies:1,freeFraction:0.2,availableTB:30},
 cloud:{chains:4,daysPerChain:7,changeMode:"incremental",archiveFullCopies:0,workspaceFullCopies:0,freeFraction:0.1,availableTB:null}
 },
 quote:[
 {key:"implementation",label:"Prime implementation and acceptance",unit:"project",quantity:1,period:"once",unitPrice:null,annualEscalation:0,source:""},
 {key:"server",label:"Server protection licences and support",unit:"server/year",quantity:25,period:"annual",unitPrice:null,annualEscalation:0,source:""},
 {key:"m365",label:"Microsoft 365 and required Entra protection",unit:"user/year",quantity:35,period:"annual",unitPrice:null,annualEscalation:0,source:""},
 {key:"repository",label:"Local repository addition or replacement",unit:"system",quantity:1,period:"once",unitPrice:null,annualEscalation:0,source:""},
 {key:"cloud",label:"Off-site storage and retention",unit:"TB/month",quantity:null,period:"monthly",unitPrice:null,annualEscalation:0,source:""},
 {key:"operations",label:"Monitoring, critical support and routine restore service",unit:"service/year",quantity:1,period:"annual",unitPrice:null,annualEscalation:0,source:""},
 {key:"exercise",label:"Priced periodic recovery exercises",unit:"exercise/year",quantity:1,period:"annual",unitPrice:null,annualEscalation:0,source:""},
 {key:"variable",label:"Estimated retrieval, API, egress and export allowance",unit:"allowance/year",quantity:1,period:"annual",unitPrice:null,annualEscalation:0,source:""}
 ],
 responses:{}, acceptance:{}, notes:""
};
function clone(x){return JSON.parse(JSON.stringify(x));}
function number(x,label,min,max,nullable=false,integer=false){
 if(nullable&&x===null)return null;
 if(typeof x!=="number"||!Number.isFinite(x)||x<min||x>max||(integer&&!Number.isInteger(x)))throw new Error(label+" must be "+(nullable?"a number or null":"a number")+" in "+min+"…"+max+(integer?" (whole number)":""));
 return x;
}
function text(x,label,max=10000){if(typeof x!=="string"||x.length>max)throw new Error(label+" is invalid");return x;}
function exactKeys(o,allowed,label){if(!o||typeof o!=="object"||Array.isArray(o))throw new Error(label+" must be an object");for(const k of Object.keys(o))if(!allowed.includes(k))throw new Error(label+": unsupported field "+k);}
function validate(s){
 exactKeys(s,Object.keys(DEFAULTS),"Case");if(s.schema!==SCHEMA)throw new Error("Unsupported saved-case schema");text(s.name,"Case name",200);text(s.notes,"Notes",20000);
 const a=s.assumptions;exactKeys(a,Object.keys(DEFAULTS.assumptions),"Assumptions");
 for(const [k,min,max,nullable,integer] of [
 ["frontEndTB",0.001,100000],["growthTBPerYear",0,10000],["years",0,20,false,true],
 ["dailyChangedFraction",0,1],["storedFraction",0.001,10],["transferFraction",0.001,10],
 ["bandwidthGbps",0.001,10000],["throughputFactor",0.001,1],["runEveryHours",0.01,8760],
 ["dailyWindowHours",0.01,168],["fullWindowHours",0.01,168],["m365TB",0,100000,true]
 ])number(a[k],k,min,max,nullable,integer);
 if(!["active","synthetic"].includes(a.completeTransferMethod))throw new Error("Invalid complete-transfer method");
 exactKeys(s.repositories,["local","cloud"],"Repositories");
 for(const name of ["local","cloud"]){const r=s.repositories[name];exactKeys(r,Object.keys(DEFAULTS.repositories.local),name);
 for(const [k,min,max,nullable,integer] of [["chains",1,104,false,true],["daysPerChain",1,365,false,true],["archiveFullCopies",0,365,false,true],["workspaceFullCopies",0,20],["freeFraction",0,0.95],["availableTB",0,1000000,true]])number(r[k],name+"."+k,min,max,nullable,integer);
 if(!["incremental","differential"].includes(r.changeMode))throw new Error("Invalid change mode");
 }
 if(!Array.isArray(s.quote)||s.quote.length!==DEFAULTS.quote.length)throw new Error("Quote row set changed");
 s.quote.forEach((q,i)=>{exactKeys(q,Object.keys(DEFAULTS.quote[i]),"Quote");if(q.key!==DEFAULTS.quote[i].key)throw new Error("Quote row identity changed");
 text(q.label,"Quote label",200);text(q.unit,"Quote unit",80);text(q.source,"Quote source",1000);
 number(q.quantity,"Quote quantity",0,1000000,true);number(q.unitPrice,"Quote price",0,1000000000,true);number(q.annualEscalation,"Escalation",-1,5);
 if(!["once","annual","monthly"].includes(q.period))throw new Error("Invalid price period");});
 for(const area of ["responses","acceptance"]){exactKeys(s[area],Object.keys(s[area]||{}),area);if(Object.keys(s[area]).length>300)throw new Error("Too many saved entries");
 for(const [k,v] of Object.entries(s[area])){if(!/^[A-Z]+-[0-9]{3}$/.test(k))throw new Error("Invalid saved entry ID");
 exactKeys(v,["status","notes"],area+"."+k);if(!(area==="responses"?["open","selected","reviewed"]:["planned","passed","needs-correction"]).includes(v.status))throw new Error("Invalid saved status");text(v.notes,"Entry notes",10000);}}
 return s;
}
function repository(a,r){
 const raw=a.frontEndTB+a.growthTBPerYear*a.years, full=raw*a.storedFraction;
 const changedDaily=Math.min(raw,raw*a.dailyChangedFraction*a.runEveryHours/24);
 let chainChangesRaw=0;for(let day=1;day<r.daysPerChain;day++)chainChangesRaw+=r.changeMode==="incremental"?changedDaily:Math.min(raw,changedDaily*day);
 const retainedFullTB=full*r.chains,retainedChangesTB=chainChangesRaw*a.storedFraction*r.chains;
 const archiveTB=full*r.archiveFullCopies,workspaceTB=full*r.workspaceFullCopies;
 const storedTB=retainedFullTB+retainedChangesTB+archiveTB, peakOccupiedTB=storedTB+workspaceTB,requiredTB=peakOccupiedTB/(1-r.freeFraction);
 const lastDeltaRaw=r.changeMode==="incremental"?changedDaily:Math.min(raw,changedDaily*(r.daysPerChain-1));
 const effectiveGbps=a.bandwidthGbps*a.throughputFactor,hours=tb=>tb*8000/(effectiveGbps*3600);
 const activeFullTransferTB=raw*a.transferFraction;
 const dailyTransferTB=r.daysPerChain===1?(a.completeTransferMethod==="active"?activeFullTransferTB:changedDaily*a.transferFraction):lastDeltaRaw*a.transferFraction;
 const fullWireTB=a.completeTransferMethod==="active"?activeFullTransferTB:0;
 const initialSeedHours=hours(activeFullTransferTB),fullHours=hours(fullWireTB),dailyHours=hours(dailyTransferTB),longestWireHours=Math.max(dailyHours,fullHours);
 return {rawTB:raw,fullStoredTB:full,retainedFullTB,retainedChangesTB,archiveTB,workspaceTB,storedTB,peakOccupiedTB,requiredTB,availableTB:r.availableTB,
 headroomTB:r.availableTB===null?null:r.availableTB-requiredTB,rawInitialShortfallTB:r.availableTB===null?null:Math.max(0,raw-r.availableTB),
 retainedRestorePoints:r.chains*r.daysPerChain,retainedChains:r.chains,nominalRestorePointSpanHours:(r.chains*r.daysPerChain-1)*a.runEveryHours,
 dailyTransferTB,activeFullTransferTB,initialSeedHours,seedFits:initialSeedHours<=a.fullWindowHours,fullWireTB,dailyHours,fullHours,effectiveGbps,
 dailyFits:dailyHours<=a.dailyWindowHours,fullFits:fullHours<=a.fullWindowHours,
 cadenceFeasible:longestWireHours<=a.runEveryHours,transferOnlyWorstAgeBoundHours:Math.max(a.runEveryHours,longestWireHours)+longestWireHours,maxStartIntervalFor24Hours:longestWireHours<=12?24-longestWireHours:null,
 assumptions:{physicalFullCopies:r.chains+r.archiveFullCopies,independentArchives:true,retainedCompleteChains:true,recoveryAgeModel:"Serial jobs; recovery point at job start; no intermediate usable checkpoint; transfer time only",fullTransferMethod:a.completeTransferMethod}};
}
function quote(s,cloud){
 const rows=s.quote.map(q=>{const quantity=q.key==="cloud"&&q.quantity===null?cloud.requiredTB:q.quantity;
 const complete=quantity!==null&&q.unitPrice!==null&&q.source.trim().length>0;
 const yearly=Array.from({length:4},(_,i)=>q.unitPrice===null||quantity===null?null:(q.period==="once"?(i===0?quantity*q.unitPrice:0):quantity*q.unitPrice*(q.period==="monthly"?12:1)*Math.pow(1+q.annualEscalation,i)));
 return {...q,effectiveQuantity:quantity,complete,yearly};});
 return {rows,complete:rows.every(x=>x.complete),missing:rows.filter(x=>!x.complete).map(x=>x.key),
 yearlyKnownSubtotal:Array.from({length:4},(_,i)=>rows.reduce((n,x)=>n+(x.yearly[i]??0),0)),
 fixedCapacityAtPlanningHorizon:true};
}
function calculate(s){validate(s);const a=s.assumptions,local=repository(a,s.repositories.local),cloud=repository(a,s.repositories.cloud);
 const warnings=[];
 if(a.m365TB===null)warnings.push("Microsoft 365 data volume is unknown; server repository totals exclude its additional storage and transfer. The selected SaaS/Entra product must be quoted separately.");
 else warnings.push("Microsoft 365 volume is recorded separately ("+a.m365TB+" TB); this server-chain model does not size the selected SaaS retention product.");
 if(local.headroomTB!==null&&local.headroomTB<0)warnings.push("Local available capacity is below the calculated server-repository requirement.");
 if(!cloud.dailyFits)warnings.push("The largest modelled daily off-site transfer exceeds the productive weeknight window.");
 if(!cloud.seedFits)warnings.push("Initial off-site seeding exceeds the weekend window under the selected transfer assumptions.");
 if(!cloud.fullFits)warnings.push("The periodic active full off-site transfer exceeds the weekend window.");
 if(!cloud.cadenceFeasible)warnings.push("The requested start interval is shorter than a modelled transfer; fixed starts are infeasible under the declared serial-job assumption.");
 if(cloud.transferOnlyWorstAgeBoundHours>24)warnings.push("The conservative serial-job recovery-point age bound exceeds 24 hours; resolve scheduling, checkpoint and transfer design and measure full end-to-end age.");
 if(a.completeTransferMethod==="synthetic")warnings.push("Synthetic full has no assumed full WAN retransmission here. Local read/write/merge I/O, daily transfer, cloud synthesis and complete-chain recoverability still require platform validation.");
 warnings.push("Stored-size, change-rate and throughput factors are explicit planning inputs, not observed MPC performance.");
 return {local,cloud,quote:quote(s,cloud),warnings};
}
function createCase(){return clone(DEFAULTS);}
if(typeof module!=="undefined")module.exports={SCHEMA,DEFAULTS,createCase,validate,repository,calculate};
