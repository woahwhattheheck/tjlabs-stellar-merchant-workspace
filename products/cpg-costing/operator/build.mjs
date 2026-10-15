/* MIT. Build one standalone desk from complete selected UTF-8 source. */
export function buildCostingDesk(files,codec,session=null,managed=null){
 const required=["costing/core.mjs","operator/session.mjs","operator/view.mjs","operator/controller.js","operator/body.html","operator/style.css","operator/codec.mjs","operator/connected_zip.cjs","operator/fields.json","docs/OPERATOR.md"];
 for(const p of required)if(typeof files[p]!=="string")throw Error("Missing complete application source: "+p);
 const selected=Object.fromEntries(Object.entries(files).sort(([a],[b])=>a<b?-1:a>b?1:0).filter(([p])=>p!=="source-manifest.json"&&!["output/","verification/","research/","commercial/","correspondence/"].some(prefix=>p.startsWith(prefix))));
 selected["source-manifest.json"]=JSON.stringify({schema:"commons.cpg-costing-source-manifest.v1",engine:"cpg-costing-1.1.0",files:Object.entries(selected).map(([path,content])=>({path,bytes:codec.utf8Encode(content).length,sha256:codec.sha256Bytes(codec.utf8Encode(content))}))},null,2)+"\n";
 const manifest=Object.entries(selected).map(([path,content])=>({path,bytes:codec.utf8Encode(content).length,sha256:codec.sha256Bytes(codec.utf8Encode(content))}));
 const bank={schema:"commons.cpg-costing-application-source.v1",files:selected,manifest},raw=JSON.stringify(bank),bytes=codec.utf8Encode(raw);
 const envelope={schema:"commons.exact-source.gzip-base64.v1",bytes:bytes.length,sha256:codec.sha256Bytes(bytes),content_base64:codec.toBase64(codec.gzipBytes(bytes))};
 const js=s=>s.replace(/^export \{[^\n]*\};?\s*$/gm,"").replace(/^export /gm,""),safe=s=>s.replace(/<\/script/gi,"<\\/script"),json=x=>JSON.stringify(x).replace(/</g,"\\u003c");
 const codecSource=js(files["operator/codec.mjs"])+"\nglobalThis.CostCodec={utf8Encode,utf8Decode,sha256Bytes,toBase64,fromBase64,gzipBytes,inflateGzip};";
 const zipSource="globalThis.CostZIP=(function(){const module={exports:{}};\n"+files["operator/connected_zip.cjs"]+"\nreturn module.exports;})();";
 if(managed&&typeof files["operator/managed.js"]!=="string")throw Error("Complete managed controller is absent");
 const scripts=[...(managed?["globalThis.CostingManaged="+json(managed)+";",files["operator/managed.js"]]:[]),codecSource,zipSource,js(files["costing/core.mjs"]),js(files["operator/session.mjs"]),js(files["operator/view.mjs"]),js(files["operator/build.mjs"]),files["operator/controller.js"]];
 const html='<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Supplier, batch and channel costing</title><style>'+files["operator/style.css"]+'</style></head><body>'+files["operator/body.html"]+'<script id="boot" type="application/json">'+json(session)+'</script><script id="source-bank" type="application/json">'+json(envelope)+'</script>'+scripts.map(s=>"<script>"+safe(s)+"</script>").join("")+"</body></html>";
 return {html,source:raw,sourceBytes:bytes.length,sourceSha256:envelope.sha256,manifest};
}
