// MIT. Same original operator, explicit request identity and no automatic mutation retry.
export function createEcondbClient({url,capability,fetchImpl=globalThis.fetch}){
 const origin=new URL(url);if(origin.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(origin.hostname))throw Error('Select the original local Econdb operator');
 capability=capability??origin.hash.slice(1);origin.hash='';origin.pathname='/';origin.search='';
 if(!/^[A-Za-z0-9_-]{43}$/.test(capability??''))throw Error('Supply the original private capability');
 async function call(path,{body}={}){
  const response=await fetchImpl(new URL(path,origin),{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+capability,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error??'Original operator request failed'),{status:response.status,code:result.code,result});return result;
 }
 return Object.freeze({state:()=>call('api/state'),request:id=>call('api/request?id='+encodeURIComponent(id)),command:request=>call('api/command',{body:request}),files:id=>call('api/files?id='+encodeURIComponent(id)),preserveFailed:input=>call('api/pending/preserve',{body:input})});
}
