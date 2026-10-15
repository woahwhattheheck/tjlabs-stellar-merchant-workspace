export function buildRoasteryHTML({core,store,operator,css,template,workspace,title="Roastery production desk",fragment=false}){
 const escapeScript=s=>String(s).replace(/<\/script/gi,"<\\/script");
 const script=escapeScript(core+"\n"+store+"\n"+operator+"\nconst deskRoot=document.getElementById('roastery-desk');const initial=JSON.parse(deskRoot.querySelector('[data-workspace]').textContent);mountRoasteryDesk(deskRoot,initial,createRoasteryCore(),createRoasteryStore(globalThis.indexedDB));");
 const embedded=JSON.stringify(workspace).replace(/</g,"\\u003c");
 const content='<div class="roastery-root" id="roastery-desk"><style>'+css+'</style>'+template+'<script type="application/json" data-workspace>'+embedded+'</script><script>'+script+'</script></div>';
 const label=String(title).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 return fragment?content:'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+label+'</title></head><body>'+content+'</body></html>';
}
