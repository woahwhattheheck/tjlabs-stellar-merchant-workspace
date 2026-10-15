// MIT. Exact immutable original command workspace for shared browser recovery storage.
export function createTurnoverArchive(core,C){
 const need=(v,m)=>{if(!v)throw Error(m)},hash=t=>C.sha256Bytes(C.utf8Encode(t));
 return {
  serialize(value){const w=core.reopen(value),content=JSON.stringify(w);need(content===JSON.stringify(value),'Complete original workspace differs');return {content,bytes:C.utf8Encode(content).length,sha256:hash(content),workspace:{sha256:hash(content)}};},
  receive(content){const w=core.reopen(JSON.parse(content));need(JSON.stringify(w)===content,'Recovered original command workspace differs');return w;}
 };
}
