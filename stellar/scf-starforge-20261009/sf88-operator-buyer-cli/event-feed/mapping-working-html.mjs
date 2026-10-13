/* MIT. Complete source-bound offline Event mapping working document. */
export function createEventMappingWorkingRuntime({modelSource,parserSource}={}){
 const need=(ok,message)=>{if(!ok)throw Error(message);};
 need(typeof modelSource==='string'&&modelSource.length<2*1024*1024&&modelSource.includes('export function createEventMappingWorkingAPI')&&modelSource.includes('export function eventMappingHash'),'Include the complete installed working-copy model.');
 need(typeof parserSource==='string'&&parserSource.length<2*1024*1024,'Include the complete original Event parser.');
 const removeExports=source=>source.replace(/^export\s+(?=(?:const|function|class)\b)/gm,'');
 const modelText=removeExports(modelSource);
 need(!/^\s*(?:import|export)\s/m.test(modelText),'The working-copy model must be the complete standalone installed module.');
 const model=new Function(modelText+'\nreturn {createEventMappingWorkingAPI,eventMappingHash,eventMappingBytes};')();
 const parserHash=model.eventMappingHash(parserSource);
 let base;
 function bound(value){
  const comparison=value&&value.schema==='stellar-forge.event-mapping-source-pair.v1'?value.comparison:value?.original?.comparison;
  need(comparison&&comparison.receiver&&comparison.receiver.core_sha256===parserHash,'The installed parser source does not match this original native comparison. Keep its original source and use the matching installed parser.');
  if(!base){
   const pattern=/^import\s*\{\s*createHash\s*\}\s*from\s*['"]node:crypto['"];?\s*$/m;
   const matches=parserSource.match(new RegExp(pattern.source,'gm'));
   need(matches&&matches.length===1,'Use the complete original parser with its single crypto import.');
   const parserText=removeExports(parserSource.replace(pattern,''));
   need(!/^\s*(?:import|export)\s/m.test(parserText),'The original parser contains an unsupported module dependency.');
   const createHash=algorithm=>{
    need(algorithm==='sha256','Use the original SHA-256 source identity.');
    let body='';
    return {update(text){need(typeof text==='string','Hash complete original UTF-8 text.');body+=text;return this;},digest(format){need(format==='hex','Use the original hexadecimal source digest.');return model.eventMappingHash(body);}};
   };
   const Buffer={byteLength(text,encoding){need(encoding===undefined||encoding==='utf8'||encoding==='utf-8','Measure original UTF-8 bytes.');return model.eventMappingBytes(text);}};
   const parser=new Function('createHash','Buffer',parserText+'\nreturn {inspectEventExport,normalizeEventMapping,compareEventMappings,inspectEventFields,inspectEventFieldValues};')(createHash,Buffer);
   base=model.createEventMappingWorkingAPI(parser);
  }
  return base;
 }
 const runtime={};
 for(const name of ['create','reopen','updateDraft','compare','status','nativeReview','catalogue','values','files','serialize'])runtime[name]=(value,...args)=>bound(value)[name](value,...args);
 return Object.freeze(runtime);
}
export function renderEventMappingWorking(value,{modelSource,parserSource,controllerSource,view,draft}={}){
 const api=createEventMappingWorkingRuntime({modelSource,parserSource});
 const working=value?.schema==='stellar-forge.event-mapping-source-pair.v1'?api.create(value,{draft}):api.reopen(value);
 if(typeof controllerSource!=='string'||controllerSource.length>2*1024*1024||!controllerSource.includes('export function mountEventMappingWorking'))throw Error('Include the complete installed mapping working-copy controller.');
 const controller=controllerSource.replace(/^export\s+(?=(?:const|function|class)\b)/gm,'');
 if(/^\s*(?:import|export)\s/m.test(controller))throw Error('The standalone mapping controller must retain all of its original local implementation.');
 new Function(controller+'\nreturn mountEventMappingWorking;');
 if(view!==undefined&&(view===null||typeof view!=='object'||Array.isArray(view)||JSON.stringify(view).length>10000))throw Error('Keep the small selected view alongside the complete working source.');
 const data=v=>JSON.stringify(v).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const assets={modelSource,parserSource,controllerSource};
 const css=':root{color-scheme:light;font:16px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#202020;background:#fff}*{box-sizing:border-box}body{margin:0;background:#fff;color:#202020}body>header,main{max-width:1320px;margin:auto;padding:24px}body>header{border-bottom:1px solid #aaa}header p{margin:6px 0}.emw-note{color:#4b4b4b}h1{font-size:29px;line-height:1.25}h2{font-size:23px;margin:0 0 12px}h3{font-size:18px}p,dd,td,pre{overflow-wrap:anywhere}p{max-width:100ch}.emw-panel{border-top:1px solid #aaa;padding:24px 0;margin:18px 0}.emw-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.emw-toolbar{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0;align-items:center}label{display:block;font-weight:600;margin:12px 0}input,textarea,select,button{font:inherit;background:#fff;color:#202020;border:1px solid #777;border-radius:3px;min-height:44px;padding:9px;max-width:100%}input,textarea,select{display:block;width:100%;margin-top:6px}textarea{resize:vertical}button{cursor:pointer;white-space:normal}button:hover{background:#eee}button:disabled{color:#666;background:#f4f4f4;cursor:default}button+button{margin-left:8px}.emw-toolbar button{margin-left:0}:focus-visible{outline:3px solid #444;outline-offset:3px}fieldset{min-width:0;border:1px solid #aaa;padding:14px;margin:14px 0}legend{font-weight:600;padding:0 6px}.emw-status{border-left:4px solid #555;padding:12px;background:#f2f2f2;white-space:pre-wrap}.emw-status[data-error=true]{border:2px solid #333}dl{display:grid;grid-template-columns:minmax(180px,260px) minmax(0,1fr);gap:8px 16px}dt{font-weight:600}dd{margin:0}pre{white-space:pre-wrap;font:13px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;tab-size:2}details{margin:12px 0}summary{font-weight:600;cursor:pointer;min-height:44px;padding:8px 0;overflow-wrap:anywhere}.emw-scroll{overflow:auto;max-width:100%;border:1px solid #aaa}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;vertical-align:top;border:1px solid #aaa;padding:9px;min-width:100px}th{background:#eee;font-weight:600}.emw-file{padding:12px 0;border-bottom:1px solid #ddd}a{color:#202020;text-decoration:underline}#event-mapping-boot-error{white-space:pre-wrap;max-width:100ch}noscript{display:block;border:2px solid #333;padding:16px}@media(max-width:600px){body>header,main{padding:16px}.emw-grid{grid-template-columns:minmax(0,1fr)}dl{grid-template-columns:minmax(0,1fr);gap:4px}dd{margin-bottom:10px}h1{font-size:25px}.emw-toolbar{display:grid;grid-template-columns:minmax(0,1fr)}button{width:100%;margin:5px 0}button+button{margin-left:0}.emw-scroll{overflow:auto}input[type=file]{font-size:14px}}@media print{body>header,main{max-width:none;padding:12px}.emw-toolbar,button,input[type=file],#event-mapping-boot-error{display:none}.emw-scroll{overflow:visible;border:0}table{font-size:9pt}th,td{min-width:0}fieldset,details,.emw-file{break-inside:avoid}.emw-panel{border-top:1px solid #777}}';
 const boot='(function(){try{const assets=JSON.parse(document.getElementById("event-mapping-working-assets").textContent),saved=JSON.parse(document.getElementById("event-mapping-working-data").textContent);const runtime=('+createEventMappingWorkingRuntime.toString()+')(assets);const source=assets.controllerSource.replace(/^export\\s+(?=(?:const|function|class)\\b)/gm,"");const mount=new Function(source+"\\nreturn mountEventMappingWorking;")();window.eventMappingWorkingEditor=mount(document.getElementById("event-mapping-working-root"),{api:runtime,initial:saved.working,view:saved.view||{}});}catch(error){document.getElementById("event-mapping-boot-error").textContent="The complete saved editor could not open: "+error.message+". Keep this unchanged file and its original source."}})();';
 const html='<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape('Event mapping · '+working.original.comparison.programme)+'</title><style>'+css+'</style></head><body><header><p>Stellar Forge · Analysis working document</p><p>Complete original source, editable mapping and review history</p><p>Workspace '+escape(working.original.comparison.workspace_id)+' · '+escape(working.original.comparison.programme)+'</p><p id="event-mapping-boot-error" role="alert"></p><noscript>This complete working file needs JavaScript to operate the original local parser. All original source and current work remain embedded in this file.</noscript></header><main id="event-mapping-working-root"></main><script type="application/json" id="event-mapping-working-data">'+data({working,view:view||{}})+'</script><script type="application/json" id="event-mapping-working-assets">'+data(assets)+'</script><script>'+boot.replace(/<\/script/gi,'<\\/script')+'</script></body></html>';
 if(new TextEncoder().encode(html).length>192*1024*1024)throw Error('The complete editable HTML exceeds 192 MiB. Keep the full working JSON and both original file pairs; no content was omitted.');
 return html;
}
