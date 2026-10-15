import {createRepairQueueCore} from "./repair-queue-core.mjs";
import {createArchiveCodec} from "./archive-codec.mjs";
import fs from "node:fs/promises";
const core=createRepairQueueCore(createArchiveCodec());
const input=JSON.parse(await fs.readFile(new URL("./examples/intake.json",import.meta.url),"utf8"));
let w=core.receive(core.create({id:"authored-queue",label:"Authored queue"}),input);
const a=core.analyse(w,input.id);if(a.summary.emailCandidates!==2||a.summary.smsCandidates!==1||a.summary.attention!==1)throw Error("Authored hand calculation differs");
if(a.rows.find(r=>r.reference==="JOB-002").notification.event!=="none")throw Error("Note-only notification");
w=core.review(w,{id:"review-1",editionId:input.id,reference:"JOB-004",decision:"investigate",reviewer:"Authored receiver",reason:"Retain missing original row for investigation",evidence:"Authored original CSV"});
w=core.review(w,{id:"review-1",editionId:input.id,reference:"JOB-004",decision:"correct_in_new_source",reviewer:"Authored receiver",reason:"Correct original source in next edition",evidence:"Authored correction"});
if(w.reviews.length!==2||core.analyse(w,input.id).summary.attention!==1)throw Error("Review erased source discrepancy");
const us=core.receive(w,{...input,id:"us",settings:{...input.settings,recipientCountry:"US"}});
if(core.analyse(us,"us").summary.smsCandidates!==0)throw Error("US SMS");
const initial=core.receive(w,{...input,id:"initial",old:null,settings:{...input.settings,mode:"initial-import"}});
if(core.analyse(initial,"initial").summary.emailCandidates!==0)throw Error("Initial import messaged");
if(JSON.stringify(core.reopen(w))!==JSON.stringify(w))throw Error("Reopen differs");
const bad=JSON.parse(JSON.stringify(w));bad.editions[0].next.text+="x";let rejected=false;try{core.reopen(bad)}catch{rejected=true}if(!rejected)throw Error("Changed original accepted");

const phoneInput={...input,id:"phone-change",old:{name:"phone-old.csv",text:input.old.text.replaceAll("+16045550101","+14165550101").replaceAll('"Email","No"','"SMS","Yes"')},next:{name:"phone-new.csv",text:input.next.text.replaceAll("+16045550101","+16475550102").replaceAll('"Email","No"','"SMS","Yes"')}};
const phoneWork=core.receive(w,phoneInput),phoneRow=core.analyse(phoneWork,"phone-change").rows.find(r=>r.reference==="JOB-001");
if(!phoneRow.attention.includes("identity_or_contact_changed")||phoneRow.notification.channels.length)throw Error("Changed phone inherited SMS eligibility");

console.log(JSON.stringify({passed:true,summary:a.summary,reviewRevisions:w.reviews.length,phoneChangeGuard:true}));
