// MIT. Browser and Node fetch binding to the original local merchant recorded-usage and quotation controller.
const ACTIONS=['preview','receive','revision','download'];
const MUTATIONS=new Set(['receive']);
const HASH=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
export class CommercialPerformanceError extends Error{
  constructor(message,{code='COMMERCIAL_PERFORMANCE_REQUEST_FAILED',status,requestState}={}){
    super(message);this.name='CommercialPerformanceError';this.code=code;
    if(status!==undefined)this.status=status;if(requestState)this.requestState=requestState;
  }
}
export function createCommercialPerformanceClient({url,caseId,workspaceId,fetch:request=globalThis.fetch}={}){
  const base=new URL(url);
  if(base.protocol!=='http:'||!['127.0.0.1','[::1]','localhost'].includes(base.hostname)||
      base.username||base.password||base.search||base.hash||base.pathname!=='/'||
      !UUID.test(caseId??'')||!HASH.test(workspaceId??'')||typeof request!=='function')
    throw new TypeError('Use the original loopback merchant listener, case and workspace identity.');
  const scope=Object.freeze({workspaceId,caseId});
  async function call(action,args={}){
    if(!ACTIONS.includes(action)||!args||typeof args!=='object'||Array.isArray(args))
      throw new TypeError('Choose the original performance action and arguments.');
    if(args.id!==undefined&&args.id!==caseId||args.scope!==undefined&&
        (args.scope.caseId!==caseId||args.scope.workspaceId!==workspaceId))
      throw new CommercialPerformanceError('Reopen the original selected merchant workspace and case.',{code:'COMMERCIAL_SCOPE_CHANGED',status:409,requestState:'REJECTED'});
    const body={...args,scope};delete body.id;
    let response;
    try{
      response=await request(new URL('/api/cases/'+caseId+'/commercial/performance-'+action,base),{
        method:'POST',redirect:'error',credentials:'omit',cache:'no-store',
        headers:{'content-type':'application/json',origin:base.origin},body:JSON.stringify(body)});
    }catch(error){
      throw new CommercialPerformanceError(String(error.message||error),{
        code:'COMMERCIAL_PERFORMANCE_TRANSPORT',requestState:MUTATIONS.has(action)?'UNKNOWN':undefined});
    }
    if(!response.ok){
      let value;try{value=await response.json();}catch{value={};}
      throw new CommercialPerformanceError(value.detail||value.error||'The original performance request did not complete.',
        {code:value.error,status:response.status,requestState:value.requestState??(MUTATIONS.has(action)?'UNKNOWN':undefined)});
    }
    if(action==='download'){
      const encoded=response.headers.get('x-sf74-file-name'),count=response.headers.get('x-sf74-file-bytes');
      const hash=response.headers.get('x-content-sha256'),bytes=new Uint8Array(await response.arrayBuffer());
      if(!encoded||!/^(0|[1-9]\d*)$/.test(count??'')||!HASH.test(hash??'')||
          !Number.isSafeInteger(Number(count))||bytes.length!==Number(count)||await digest(bytes)!==hash)
        throw new CommercialPerformanceError('The original downloaded performance file differs from its descriptor.',
          {code:'COMMERCIAL_PERFORMANCE_DOWNLOAD_CHANGED',status:409});
      const filename=decodeURIComponent(encoded);
      if(!filename||/[\\/\0]/.test(filename))throw new CommercialPerformanceError('The original file name is invalid.');
      return {scope,descriptor:{filename,bytes:bytes.length,sha256:hash,mediaType:response.headers.get('content-type')||'application/octet-stream'},bytes};
    }
    let value;
    try{value=await response.json();}catch{
      throw new CommercialPerformanceError('The original performance response is incomplete.',
        {code:'COMMERCIAL_PERFORMANCE_RESPONSE_INCOMPLETE',requestState:MUTATIONS.has(action)?'UNKNOWN':undefined});
    }
    const returned=value?.scope??value?.view?.scope;
    if(returned?.workspaceId!==workspaceId||returned.caseId!==caseId)
      throw new CommercialPerformanceError('The response belongs to another original workspace or case.',
        {code:'COMMERCIAL_SCOPE_CHANGED',status:409,requestState:MUTATIONS.has(action)?'UNKNOWN':undefined});
    return value;
  }
  return Object.freeze({scope,call,preview:args=>call('preview',args),receive:args=>call('receive',args),
    prepareRevision:args=>call('revision',args),download:args=>call('download',args)});
}
