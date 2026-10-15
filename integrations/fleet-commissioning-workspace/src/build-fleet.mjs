export function buildFleet(files){
 const get=p=>{if(typeof files[p]!=="string")throw Error("Missing full source "+p);return files[p]},strip=s=>s.replace(/^export /gm,"");
 const tail='const fleetCodec=createArchiveCodec(),fleetEngine=createFleetCore(fleetCodec),fleetStore=createFleetStore(indexedDB,fleetEngine.hash);const authoredExample='+JSON.stringify(JSON.parse(get("data/authored-example.json"))).replace(/</g,"\\u003c")+';const embeddedFleet=JSON.parse(document.getElementById("embedded").textContent);function buildPortableFleet(payload){const node=document.documentElement.cloneNode(true);node.querySelector("#embedded").textContent=JSON.stringify(payload).replace(/</g,"\\\\u003c");return "<!doctype html>\\n"+node.outerHTML}globalThis.fleetDesk=mountFleetDesk(fleetEngine,fleetStore,embeddedFleet,authoredExample,buildPortableFleet);';
 const runtime=["src/archive-codec.mjs","src/fleet-core.mjs","src/fleet-storage.mjs"].map(p=>strip(get(p))).concat(get("src/fleet-app.js"),tail).join("\n");
 return get("src/fleet.template.html").replace("__STYLE__",()=>get("src/fleet.css")).replace("__EMBEDDED__",()=>"null").replace("__RUNTIME__",()=>runtime.replace(/<\/script/gi,"<\\/script"));
}
