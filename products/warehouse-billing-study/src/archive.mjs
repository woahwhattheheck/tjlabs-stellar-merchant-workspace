// MIT. Complete compact original session for immutable managed recovery storage.
export function createWarehouseBillingStudyArchive(M,C){
 const hash=t=>C.hashText(t);
 return {serialize(value){M.validate(value);const content=JSON.stringify(value);return {content,bytes:C.utf8Encode(content).length,sha256:hash(content),workspace:{sha256:hash(content)}};},receive(content){const w=M.normalize(JSON.parse(content));if(JSON.stringify(w)!==content)throw Error('Recovered original session differs');return w;}};
}
