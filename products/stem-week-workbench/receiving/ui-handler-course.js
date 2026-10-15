async function runStemWeekHandlerCourse({coreSource,operatorSource,utf8Encode,utf8Decode}){
 const core=Function(coreSource+";return createStemWeekCore();")(),checks=[],events=[],downloads=[],elements=new Map();
 function ok(name,condition){if(!condition)throw Error(name);checks.push(name)}
 const by=id=>{if(!elements.has(id)){let v="";const e={id,disabled:false,files:[],listeners:{},textContent:"",innerHTML:"",addEventListener(k,f){this.listeners[k]=f}};Object.defineProperty(e,"value",{get:()=>v,set:x=>{v=String(x);if(id.endsWith("-text"))v=v.replace(/\r\n/g,"\n").replace(/\r/g,"\n")}});elements.set(id,e)}return elements.get(id)};
 const root={querySelector:s=>by(s.match(/data-id="([^"]+)"/)[1]),querySelectorAll:()=>[...elements.values()],appendChild(){}};
 const doc={createElement:()=>({click(){downloads.push(this.download)},remove(){}})},window={addEventListener(){}};
 let denied=false,saved=[];
 const store={async list(){return saved.map((x,i)=>({id:"copy"+i,createdAt:"2026-10-15",title:x.title}))},async retain(body,title){if(denied)throw Error("authored quota");saved.push({body,title});return{id:"copy"+saved.length}},async save(body,expectedVersion,title){if(denied)throw Error("authored quota");saved.push({body,title});return{saved:true,version:"head"+saved.length}},async read(){return null}};
 const decoderOptions=[];
 class TD{constructor(enc,opts){decoderOptions.push({enc,opts})}decode(bytes){return utf8Decode(new Uint8Array(bytes))}}
 class BlobAdapter{constructor(parts,opts){this.parts=parts;this.opts=opts}}
 const create=Function("document","window","TextDecoder","URL","Blob","setTimeout","confirm",operatorSource+";return mountStemWeekWorkbench;")(doc,window,TD,{createObjectURL:()=>"blob:authored",revokeObjectURL(){}},BlobAdapter,()=>{},()=>true);
 const api=create(root,core.create({id:"handler-course",label:"Authored UI course"}),core,store);
 await Promise.resolve();
 await by("load-example").onclick();
 const bom="\ufeff"+core.sampleSources.varieties.text;
 let release;const deferred=new Promise(r=>release=r);const file={name:"bom-original.csv",arrayBuffer:()=>deferred};
 by("varieties-file").files=[file];by("varieties-file").onchange({target:by("varieties-file")});
 ok("Mutation controls lock while a file read is pending",by("receive").disabled===true);
 by("varieties-file").files=[{name:"changed.csv",arrayBuffer:async()=>utf8Encode("wrong").buffer}];release(utf8Encode(bom).buffer);
 for(let i=0;i<12;i++)await Promise.resolve();
 ok("File object is frozen before asynchronous read",api.getState().session.sourceDraft.sources.varieties.name==="bom-original.csv");
 ok("Strict decoder is configured to preserve BOM and reject malformed UTF8",decoderOptions[0].enc==="utf-8"&&decoderOptions[0].opts.fatal===true&&decoderOptions[0].opts.ignoreBOM===true);
 ok("CSV original retains BOM and CRLF despite textarea newline normalization",api.getState().session.sourceDraft.sources.varieties.text===bom&&by("varieties-text").value!==bom);
 await by("receive").onclick();const created=api.getState();
 ok("Receiving preserves the exact imported bytes through form capture",created.workspace.editions[0].sources.varieties.text===bom);
 by("basis").value="actual";by("basis").onchange();
 ok("Actual view prominently exposes missing counts",by("summary").textContent.includes("ACTUAL")&&by("summary").textContent.includes("1 varieties have MISSING"));
 by("decision-reviewer").value="Authored grower";by("decision-reason").value="Check actual shortfall";by("decision-action").value="hold";by("decision-reviewer").listeners.input();
 const actualDraft=api.getState();by("basis").value="projected";by("basis").onchange();by("decision-reason").value="Projected draft separate";by("decision-reason").listeners.input();by("basis").value="actual";by("basis").onchange();
 ok("Review drafts remain attached to the exact source and supply basis",by("decision-reason").value==="Check actual shortfall");
 const before=api.getState();let rejected=false;try{await api.adopt({...before,session:{...before.session,week:"2026-10-20"}})}catch{rejected=true}
 ok("Invalid selected source/week adoption leaves current workspace intact",rejected&&JSON.stringify(api.getState())===JSON.stringify(before));
 denied=true;const blank=core.create({id:"new-farm",label:"New farm"});const a=await api.adopt(blank);
 ok("Quota failure prevents adoption from discarding dirty work",a===false&&api.getState().workspace.id==="handler-course");
 by("json").onclick();const b=await api.adopt(blank);
 ok("Confirmed complete emergency download allows continuation under quota",b===true&&downloads.includes("Stem_Week_Complete_Workspace.json")&&api.getState().workspace.id==="new-farm");
 const full=core.reopen(before.workspace);ok("Complete working sources remain core-reopenable",full.head===before.workspace.head);
 return {runtime:"V8 production controller with explicit DOM, IndexedDB-call and browser-download adapters; native decoder options checked, UTF8 decoding supplied by retained codec",checks,passed:checks.length,sourceEditionHash:created.workspace.editions[0].sourceHash};
}