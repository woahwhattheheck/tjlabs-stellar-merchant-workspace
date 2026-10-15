/* MIT. Conservative complete-handover byte bound, with the existing exact export
   as the fallback near capacity. Every source, original, report and prior session counts. */
export function createPlanningCapacity({C,api,A,files,buildPlanningDesk,reportHTML,reportMarkdown,comparisonHTML,reconciliationCSV,recordCSV}){
 const workspaceCache=new WeakMap(),editionCache=new WeakMap(),proposalCache=new WeakMap();
 const bytes=t=>C.utf8Encode(t).length,filename=n=>String(n||"source").replace(/[\\/\u0000-\u001f<>:"|?*]/g,"_").replace(/^\.+/,"_")||"source";
 const sourceEntries=Object.entries(files).map(([name,t])=>({name:"source/"+name,bytes:bytes(t)}));let blankHTMLBytes=null;
 function graphNode(node){if(node[0]==="a")return 8+8*node[1].length;if(node[0]==="o")return 8+18*node[1].length;return bytes(JSON.stringify(node));}
 function workspace(w){let memo=workspaceCache.get(w);if(memo)return memo;
  const packed=A.serialize(w),archive=JSON.parse(packed.content);
  const depths=[];for(const node of archive.nodes){const refs=node[0]==='a'?node[1]:node[0]==='o'?node[1].flat():[];let depth=0;for(const ref of refs)depth=Math.max(depth,1+depths[ref]);depths.push(depth);}
  memo={rawBytes:bytes(JSON.stringify(w)),archiveBytes:packed.bytes,graphBytes:archive.nodes.reduce((n,node)=>n+graphNode(node)+1,0),nodes:archive.nodes.length,depth:depths[archive.root],root:w.rootSha256};
  if(Object.isFrozen(w))workspaceCache.set(w,memo);return memo;
 }
 function estimate(session){
  const originals=new Map(),known=new WeakMap();
  for(const w of [session.workspace,...session.backups.map(b=>b.snapshot.workspace)]){const m=workspace(w);known.set(w,m);originals.set(m.root,m);}
  function size(value){let extra=0;const text=JSON.stringify(value,(key,v)=>{const m=v&&typeof v==="object"?known.get(v):null;if(m){extra+=m.rawBytes-4;return null;}return v;});return bytes(text)+extra;}
  const rawBody=JSON.stringify(session,(key,v)=>{const m=v&&typeof v==="object"?known.get(v):null;return m?{$planningWorkspace:m.root}:v;});
  // Seven decimal digits cover the unchanged archive's four-million-node limit.
  // Count each original domain graph once and bound every new reference at seven digits.
  let extraNodes=0,maxDepth=0;
  function graph(value,depth=0){extraNodes++;maxDepth=Math.max(maxDepth,depth);if(value&&typeof value==="object"&&originals.has(value.$planningWorkspace))maxDepth=Math.max(maxDepth,depth+originals.get(value.$planningWorkspace).depth);if(value===null)return 6;if(typeof value==="string")return bytes(JSON.stringify(["s",value]))+1;if(typeof value==="boolean"||typeof value==="number")return bytes(JSON.stringify([typeof value==="boolean"?"b":"n",value]))+1;if(Array.isArray(value))return 9+8*value.length+value.reduce((n,v)=>n+graph(v,depth+1),0);return 9+18*Object.keys(value).length+Object.entries(value).reduce((n,[k,v])=>n+graph(k,depth+1)+graph(v,depth+1),0);}
  const sharedBytes=2048+graph({schema:"commons.planning-session-frame.v1",rootSha256:"0".repeat(64),session:JSON.parse(rawBody)})+[...originals.values()].reduce((n,m)=>n+m.graphBytes,0);
  if(blankHTMLBytes===null)blankHTMLBytes=bytes(buildPlanningDesk(files,C,null).html);
  // This fixed-Huffman encoder uses no more than nine bits per input byte,
  // plus header, end marker and byte alignment; Base64 is exactly four per three.
  const gzipBound=Math.ceil(sharedBytes*9/8)+32,htmlBound=blankHTMLBytes+512+4*Math.ceil(gzipBound/3);
  const entries=sourceEntries.slice(),add=(name,n)=>entries.push({name,bytes:n}),w=session.workspace,m=workspace(w);
  add("working/Planning_Working.json",size(session)+256);add("working/Planning_Shared_Working.json",sharedBytes);add("working/Planning_Editable.html",htmlBound);add("working/Planning_Workspace.json",m.rawBytes+1);add("working/Planning_Shared_Workspace.json",m.archiveBytes);
  for(const s of w.sources){const encoded=s.content_base64,pad=encoded.endsWith("==")?2:encoded.endsWith("=")?1:0;add("originals/"+filename(s.id)+"/"+filename(s.name),encoded.length/4*3-pad);}
  for(const e of w.editions){let sizes=editionCache.get(e);if(!sizes){sizes=[bytes(JSON.stringify(e))+1,bytes(reportHTML(e.report)),bytes(reportMarkdown(e.report)),bytes(reconciliationCSV(e.report))];if(Object.isFrozen(e))editionCache.set(e,sizes);}const p="reports/"+e.id+"/";["Edition.json","Report.html","Report.md","Reconciliation.csv"].forEach((name,i)=>add(p+name,sizes[i]));}
  let proposalSizes=proposalCache.get(w);if(!proposalSizes){proposalSizes=new Map();if(Object.isFrozen(w))proposalCache.set(w,proposalSizes);}
  for(const p of w.proposals){let sizes=proposalSizes.get(p.id);if(!sizes){sizes=[bytes(JSON.stringify(api.handoff(w,p.id)))+1,bytes(comparisonHTML(p.comparison)),bytes(recordCSV(p.comparison))];proposalSizes.set(p.id,sizes);}const prefix="proposals/"+p.id+"/";["Handoff.json","Comparison.html","Comparison.csv"].forEach((name,i)=>add(prefix+name,sizes[i]));}
  for(const b of session.backups)add("working/prior-sessions/"+filename(b.id)+".json",size({...b.snapshot,backups:[]})+256);
  return {bytes:22+entries.reduce((n,e)=>n+76+2*bytes(e.name)+e.bytes,0),members:entries.length,conservative:true,archiveWithinLimits:extraNodes+[...originals.values()].reduce((n,m)=>n+m.nodes,0)<=4000000&&maxDepth<=256};
 }
 return {estimate};
}
