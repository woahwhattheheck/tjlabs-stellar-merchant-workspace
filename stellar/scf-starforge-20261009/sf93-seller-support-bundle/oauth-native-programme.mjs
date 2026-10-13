// MIT. One native OAuth -> original incident -> Support receiving programme.
import assert from 'node:assert/strict';
import {createServer as createHttpServer} from 'node:http';
import {createServer as createHttpsServer,request as httpsRequest} from 'node:https';
import {createHash,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {loadOAuthResourceHost,OAUTH_OBSERVATION_PATH} from '../../../stellar-forge/mcp-paid-agent/oauth-host.mjs';
import {createMcpToolHandler,MCP_VERSION} from '../../../stellar-forge/mcp-paid-agent/http-tools.mjs';
import {createObservedOAuthResourceAuthorization,OAUTH_OBSERVATION_TOOL} from '../../../stellar-forge/mcp-paid-agent/oauth-observer.mjs';
import {validateOAuthObservation} from '../../../stellar-forge/mcp-paid-agent/oauth-observation-contract.mjs';
import {readOAuthSource,collectOAuthObservation,reviewOAuthSource} from './oauth-source.mjs';
import {normalizeOAuthSource,readOAuthObservationFiles,createOAuthObservation,oauthConditions} from './oauth-observation.mjs';
import {initializeIncidentStore,openIncidentStore} from './incident-store.mjs';
import {acknowledgeIncident} from './incident-operator.mjs';
import {runIncidentWatch} from './watch.mjs';
import {acquireOAuthProgrammeLease,retainOAuthReceiveContext} from './oauth-receive-context.mjs';

const iso=()=>new Date().toISOString();
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const listen=server=>new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.removeListener('error',reject);done(server.address().port);});});
const stopServer=server=>new Promise(done=>{if(!server?.listening)return done();server.close(done);server.closeAllConnections?.();});
async function until(read,accept,label,{timeout=15000,signal}={}) {
  const end=Date.now()+timeout;
  while(Date.now()<end){if(signal?.aborted)throw signal.reason;const result=await read();if(accept(result))return result;await sleep(100);}
  throw new Error('Native programme did not reach '+label);
}
function requestFor(token){return {url:'/mcp',method:'POST',headers:{authorization:'Bearer '+token},rawHeaders:['Authorization','Bearer '+token]};}

/**
 * Runs the original verifier, HTTP transport, private store, watcher and operator.
 * receive(context) continues in the original SF74 console while the same source
 * host is still available. Credentials stay inside this one native process.
 */
export async function runOAuthNativeProgramme({directory,receive,receivingModule,signal,browser}={}) {
  signal?.throwIfAborted();
  if(typeof directory!=='string'||!directory)throw new TypeError('An explicit fresh native output directory is required');
  if(receive!==undefined&&typeof receive!=='function')throw new TypeError('The receiving continuation must be a function');
  const root=resolve(directory);
  await mkdir(root,{mode:0o700}); // create-only: a previous run must be reconciled.
  const privateRoot=join(root,'private');await mkdir(privateRoot,{mode:0o700});
  const result={schema:'stellar-forge.sf93.oauth-native-programme.v1',operation:'oauth-to-original-support',
    startedAt:iso(),status:'RUNNING',runtime:{node:process.version},phases:[]};
  const resultPath=join(root,'oauth-native-result.json');
  async function retain(){const temporary=resultPath+'.tmp';await writeFile(temporary,JSON.stringify(result,null,2)+'\n',{mode:0o600});await rename(temporary,resultPath);}
  async function phase(name,details={}){owner.signal.throwIfAborted();programmeLease?.assertHeld();result.phases.push({name,at:iso(),...details});await retain();process.stdout.write(JSON.stringify({phase:name,...details})+'\n');}
  const owner=new AbortController(),stop=new AbortController();let keyServer,hookServer,mcpServer,host,callbackResource,watcher,watchError,programmeLease;
  const abortFromCaller=()=>owner.abort(signal.reason);
  owner.signal.addEventListener('abort',()=>stop.abort(owner.signal.reason),{once:true});
  signal?.addEventListener('abort',abortFromCaller,{once:true});
  if(signal?.aborted)abortFromCaller();
  const hookReceipts=[],jwksReads=[];
  let keyMode='HEALTHY',providerCalls=0;
  try {
    programmeLease=await acquireOAuthProgrammeLease(root,{signal:owner.signal});
    const joseEntry=createRequire(new URL('../../../stellar-forge/mcp-paid-agent/package.json',import.meta.url)).resolve('jose');
    const {generateKeyPair,exportJWK,SignJWT}=await import(pathToFileURL(joseEntry).href);
    const joseManifest=JSON.parse(await readFile(resolve(dirname(joseEntry),'../../package.json'),'utf8'));
    result.runtime.jose=joseManifest.version;
    const certPath=join(privateRoot,'issuer-cert.pem'),keyPath=join(privateRoot,'issuer-tls-key.pem');
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyPath,'-out',certPath,
      '-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'],{stdio:'ignore'});
    const cert=await readFile(certPath),tlsKey=await readFile(keyPath);
    const [first,second]=await Promise.all([generateKeyPair('RS256',{modulusLength:2048}),generateKeyPair('RS256',{modulusLength:2048})]);
    const secondJwk={...await exportJWK(second.publicKey),kid:'second',alg:'RS256',use:'sig'};
    const jwks={keys:[{...await exportJWK(first.publicKey),kid:'first',alg:'RS256',use:'sig'}]};
    keyServer=createHttpsServer({key:tlsKey,cert},(req,res)=>{
      jwksReads.push({at:iso(),mode:keyMode,method:req.method,path:req.url});
      if(req.method!=='GET'||req.url!=='/jwks'){res.writeHead(404);res.end();return;}
      res.writeHead(keyMode==='HEALTHY'?200:503,{'content-type':'application/jwk-set+json','cache-control':'no-store',
        ...(keyMode==='HEALTHY'?{}:{'retry-after':'1'})});
      res.end(keyMode==='HEALTHY'?JSON.stringify(jwks):'{"error":"native-key-provider-unavailable"}');
    });
    const keyPort=await listen(keyServer);
    const issuer='https://ISSUER.native.example',resource='https://MERCHANT.native.example/mcp';
    const selectedJwks='https://issuer.native.example/jwks';
    // This trusted fetch is the original host's supported injection seam. Its
    // selected HTTPS read reaches the real isolated TLS issuer above.
    const fetchImpl=(url,options={})=>{
      assert.equal(String(url),selectedJwks);assert.equal(options.method,'GET');
      return new Promise((done,reject)=>{
        const req=httpsRequest({hostname:'127.0.0.1',port:keyPort,servername:'localhost',ca:cert,
          path:'/jwks',method:'GET',headers:options.headers,signal:options.signal,agent:false},res=>{
          const chunks=[];res.on('data',data=>chunks.push(data));res.on('error',reject);
          res.on('end',()=>done(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));
        });req.on('error',reject);req.end();
      });
    };
    const config={schema:'stellar-forge.mcp-oauth-resource.v1',resource,
      authorizationServers:[{issuer,jwksUri:selectedJwks,algorithms:['RS256'],tokenTypes:['at+jwt'],allowedSubjects:['native-operator']}],
      requiredScopes:['mcp:read'],toolScopes:{inspect_owned_workspace:['workspace:read'],[OAUTH_OBSERVATION_TOOL]:['operations:observe']},
      scopesSupported:['mcp:read','workspace:read','operations:observe'],clockToleranceSeconds:0,
      jwksCacheMaxAgeMs:3600000,jwksCooldownMs:0,jwksTimeoutMs:3000};
    const configPath=join(privateRoot,'oauth-host.json');await writeFile(configPath,JSON.stringify(config)+'\n',{mode:0o600});
    const sign=async({key=first.privateKey,kid='first',subject='native-operator',scopes='mcp:read workspace:read operations:observe',
      tokenIssuer=issuer,expires}={})=>new SignJWT({scope:scopes,client_id:'native-client'})
        .setProtectedHeader({alg:'RS256',typ:'at+jwt',kid}).setIssuer(tokenIssuer).setAudience(resource).setSubject(subject)
        .setIssuedAt().setExpirationTime(expires??Math.floor(Date.now()/1000)+7200).sign(key);
    const operatorToken=await sign(),environment={SCF_OAUTH_OPERATOR_TOKEN:operatorToken};
    host=await loadOAuthResourceHost({configPath,fetchImpl});
    const provider={tools:[{name:'inspect_owned_workspace',description:'Read the isolated native workspace status',
      inputSchema:{type:'object',properties:{note:{type:'string'}},additionalProperties:false}}],
      call:async(name,args,options)=>{
        assert.equal(name,'inspect_owned_workspace');assert(Object.isFrozen(options.authorization));
        assert.equal(options.authorization.subject,'native-operator');
        providerCalls++;return {status:'AVAILABLE',revision:1};
      }};
    mcpServer=createHttpServer(host.wrap(createMcpToolHandler(provider,host.transportOptions)));
    const port=await listen(mcpServer),origin='http://127.0.0.1:'+port;
    let rpcId=0;
    async function call(token=operatorToken,args={note:'opaque-native-argument'}) {
      const response=await fetch(origin+'/mcp',{method:'POST',headers:{...(token?{authorization:'Bearer '+token}:{}),
        'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':MCP_VERSION},
        body:JSON.stringify({jsonrpc:'2.0',id:++rpcId,method:'tools/call',params:{name:'inspect_owned_workspace',arguments:args}})});
      return {status:response.status,body:await response.json()};
    }
    assert.equal((await call()).status,200);
    const denials=[];
    for(const [kind,token,status]of [
      ['missing-token',null,401],
      ['resource-scope',await sign({scopes:'mcp:read operations:observe'}),403],
      ['unpermitted-subject',await sign({subject:'different-native-subject'}),403],
      ['expired-token',await sign({expires:Math.floor(Date.now()/1000)-3600}),401],
      ['unconfigured-issuer',await sign({tokenIssuer:'https://different.native.example'}),401]
    ]){const response=await call(token);assert.equal(response.status,status,kind);denials.push({kind,status,error:response.body.error.data.error});}
    assert.equal(providerCalls,1);
    const endpoint=origin+OAUTH_OBSERVATION_PATH;
    const reviewed=await reviewOAuthSource({endpoint,tokenEnv:'SCF_OAUTH_OPERATOR_TOKEN',windowMinutes:1},{environment});
    const selection=normalizeOAuthSource(reviewed.oauth);
    const one=await readOAuthSource(selection,{environment}),two=await readOAuthSource(selection,{environment});
    assert.deepEqual(one.observation.counters,two.observation.counters);
    assert(two.observation.sequence>one.observation.sequence);
    validateOAuthObservation(two.observation);
    for(const hidden of [operatorToken,'native-operator','native-client','opaque-native-argument'])
      assert(!two.bytes.toString('utf8').includes(hidden),'Private request identity leaked into an observation');
    assert.equal(two.observation.resource,resource);assert.equal(two.observation.authority.servers[0].issuer,issuer);
    await phase('original-authentication-and-protected-observation',{providerCalls,denials,
      sessionId:two.observation.sessionId,configurationSha256:two.observation.configurationSha256,
      observationBytes:two.bytes.length,observationSha256:sha(two.bytes),counters:two.observation.counters});

    // The original embedding callback remains authoritative, including a real
    // callback exception and a concurrent diagnostic read during a pending call.
    let release,entered;const pending=new Promise(done=>{entered=done;});
    callbackResource=createObservedOAuthResourceAuthorization(config,{fetchImpl,authorize:async input=>{
      if(input.tool===OAUTH_OBSERVATION_TOOL)return true;
      if(input.arguments.crash)throw new Error('isolated original callback fault');
      if(input.arguments.deny)return false;
      if(input.arguments.defer){entered();await new Promise(done=>{release=done;});}
      return true;
    }});
    const context=await callbackResource.authenticate(requestFor(operatorToken));
    await assert.rejects(callbackResource.authorizeTool(context,'inspect_owned_workspace',{deny:true}),error=>error.code==='access_denied');
    await assert.rejects(callbackResource.authorizeTool(context,'inspect_owned_workspace',{crash:true}),error=>error.code==='access_denied');
    const active=callbackResource.authorizeTool(context,'inspect_owned_workspace',{defer:true});await pending;
    const during=await callbackResource.readObservation(requestFor(operatorToken));
    assert.equal(during.counters.hostAuthority.started,3);assert.equal(during.counters.hostAuthority.completed,2);
    release();await active;
    const authority=callbackResource.observation();validateOAuthObservation(authority);
    assert.equal(authority.counters.hostAuthority.outcomes.ACCESS_DENIED,1);
    assert.equal(authority.counters.hostAuthority.outcomes.HOST_ERROR,1);
    assert.equal(authority.counters.hostAuthority.outcomes.ALLOWED,1);
    assert.equal(authority.counters.authentication.completed,1);
    const callbackSelection={...selection,configurationSha256:authority.configurationSha256};
    const callbackCapture=createOAuthObservation({registration:{id:'callback',label:'Original callback'},selection:callbackSelection,
      startedAt:authority.startedAt,generatedAt:iso(),sourceBytes:Buffer.from(JSON.stringify(authority)+'\n')});
    assert.equal(oauthConditions(callbackCapture.oauth.summary).OAUTH_HOST_AUTHORITY_ERROR.bad,true);
    await phase('original-host-authority-and-concurrent-observation',{counters:authority.counters});
    await callbackResource.close();callbackResource=null;

    hookServer=createHttpServer((req,res)=>{
      const chunks=[];req.on('data',chunk=>chunks.push(chunk));req.on('end',()=>{
        const bytes=Buffer.concat(chunks);let body;try{body=JSON.parse(bytes);}catch{res.writeHead(400);res.end();return;}
        hookReceipts.push({at:iso(),bytes:bytes.length,sha256:sha(bytes),body});
        res.writeHead(202,{'content-type':'application/json'});res.end('{"accepted":true}');
      });
    });
    environment.SCF_OAUTH_WEBHOOK_URL='http://127.0.0.1:'+await listen(hookServer)+'/native-events';
    environment.SCF_OAUTH_WEBHOOK_SECRET=randomBytes(32).toString('hex');
    const merchant={id:'oauth-native',label:'Original OAuth host',oauth:selection},incidentDirectory=join(privateRoot,'incidents');
    const incidentConfig={schema:'stellar-forge.seller-watch-config.v1',pollMs:250,failurePolls:2,recoveryPolls:2,
      windowMinutes:1,captureEveryMs:1000,merchants:[merchant],
      notification:{id:'native-webhook',urlEnv:'SCF_OAUTH_WEBHOOK_URL',secretEnv:'SCF_OAUTH_WEBHOOK_SECRET',
        allowLoopback:true,timeoutMs:2000,maxAttempts:3,retryMs:100,maxRetryMs:1000}};
    await initializeIncidentStore({directory:incidentDirectory,config:incidentConfig});
    const store=await openIncidentStore(incidentDirectory);
    watcher=runIncidentWatch({directory:incidentDirectory,environment,signal:stop.signal}).catch(error=>{watchError=error;stop.abort(error);throw error;});
    // Attach the rejection handler immediately; finalization still awaits it.
    watcher.catch(()=>{});
    await until(()=>store.read(),state=>!!state.merchants[merchant.id].previous,'first original source poll',{signal:stop.signal});
    let state=await store.read();assert.equal(state.incidents.length,0,'Expected token/subject/scope enforcement must not open an outage');
    const initialCapture=state.merchants[merchant.id].lastCapture;
    assert(initialCapture?.kind==='OAUTH_RESOURCE');
    keyMode='UNAVAILABLE';
    // The second key becomes selectable only after its first successful TLS read.
    jwks.keys=jwks.keys.filter(key=>key.kid==='first');
    const secondToken=await sign({key:second.privateKey,kid:'second'});
    for(let i=0;i<3;i++)assert.equal((await call(secondToken)).status,503);
    const failureMinute=Math.floor(Date.now()/60000)*60000;
    state=await until(()=>store.read(),value=>['OAUTH_VERIFIER_UNAVAILABLE','OAUTH_JWKS_UNAVAILABLE']
      .every(kind=>value.incidents.some(row=>row.kind===kind&&row.status==='OPEN')),'original OAuth outage incidents',{signal:stop.signal});
    const incidentIds=state.incidents.filter(row=>row.status==='OPEN').map(row=>row.id);
    assert.equal(incidentIds.length,2);
    for(const incident of state.incidents.filter(row=>incidentIds.includes(row.id)))
      await acknowledgeIncident({directory:incidentDirectory,id:incident.id,expectedRevision:incident.revision,
        by:'Native receiving operator',notes:'Original TLS key dependency restored in the same source session.',environment});
    state=await store.read();assert(incidentIds.every(id=>state.incidents.find(row=>row.id===id).status==='ACKNOWLEDGED'));
    await phase('original-watcher-open-and-acknowledge',{incidentIds,initialCapture,
      incidents:state.incidents.filter(row=>incidentIds.includes(row.id)).map(({id,kind,status,revision,beforeCapture})=>({id,kind,status,revision,beforeCapture}))});

    // Recovery uses a real new minute and successful native checks. The
    // diagnostic clock, JWT clock and original watcher clock stay unchanged.
    await phase('waiting-for-original-observation-window',{nextMinute:new Date(failureMinute+60000).toISOString()});
    await until(async()=>Date.now(),now=>now>=failureMinute+60000+100,'next actual observation minute',{timeout:65000,signal:stop.signal});
    keyMode='HEALTHY';jwks.keys.push(secondJwk);
    assert.equal((await call(secondToken)).status,200);assert.equal((await call()).status,200);
    state=await until(()=>store.read(),value=>incidentIds.every(id=>value.incidents.find(row=>row.id===id)?.status==='RECOVERED'),
      'same original incidents recovered',{timeout:15000,signal:stop.signal});
    state=await until(()=>store.read(),value=>value.notifications.filter(row=>incidentIds.includes(row.incidentId))
      .every(row=>['DELIVERED','CANCELLED'].includes(row.status)),'original notification delivery',{timeout:15000,signal:stop.signal});
    const retained=[];
    for(const incident of state.incidents.filter(row=>incidentIds.includes(row.id))) {
      assert(incident.beforeCapture&&incident.afterCapture);
      const pair=await store.transaction(async(_state,io)=>({before:readOAuthObservationFiles(await io.readCapture(incident.beforeCapture)),
        after:readOAuthObservationFiles(await io.readCapture(incident.afterCapture))}),{readonly:true});
      assert.equal(pair.before.source.sessionId,pair.after.source.sessionId);
      assert(pair.after.source.sequence>pair.before.source.sequence);
      assert.equal(pair.after.summary.window.complete,true);
      retained.push({id:incident.id,kind:incident.kind,status:incident.status,revision:incident.revision,
        beforeCapture:incident.beforeCapture,afterCapture:incident.afterCapture});
    }
    if(watchError)throw watchError;
    await phase('same-source-recovery-and-retained-captures',{incidents:retained,webhookDeliveries:hookReceipts.length,
      notifications:state.notifications.map(({id,incidentId,type,status,attempts})=>({id,incidentId,type,status,attempts}))});
    stop.abort();await watcher;watcher=null;
    const finalSource=await collectOAuthObservation(merchant,undefined,environment);
    const finalRead=readOAuthObservationFiles(finalSource.packet.files);
    assert.equal(finalRead.summary.coverage,'COMPLETE');
    result.receivingContext=await retainOAuthReceiveContext({root,lease:programmeLease,
      incidentDirectory,incidentIds,incidentConfig,merchant,selection,sourceOrigin:origin,
      sourceFiles:finalSource.packet.files,producer:fileURLToPath(import.meta.url),report:result,
      receive,receivingModule,browser,signal:owner.signal});
    await phase('original-support-inputs-retained',{context:result.receivingContext,
      sourceSessionId:finalRead.source.sessionId,sourceSequence:finalRead.source.sequence});
    if(receive) {
      const received=await receive({root,incidentDirectory,incidentIds,incidentConfig,merchant,selection,environment,
        sourceOrigin:origin,sourceFiles:finalSource.packet.files,report:result,signal:owner.signal,browser});
      await phase('original-support-receiving',received);
    }
    result.status='COMPLETED';result.completedAt=iso();result.providerCalls=providerCalls;
    result.sourceSessionId=finalRead.source.sessionId;result.jwksReads=jwksReads;
    result.incidents=retained;result.webhookDeliveries=hookReceipts.length;
    await retain();return {resultPath,result,incidentDirectory};
  }catch(error){result.status='FAILED';result.failedAt=iso();result.error={name:error.name,message:error.message,code:error.code??null};await retain();throw error;}
  finally{
    signal?.removeEventListener('abort',abortFromCaller);owner.abort();
    stop.abort();if(watcher)await watcher.catch(()=>{});
    // Join every original child before releasing the kernel lease to a cold continuation.
    const closed=await Promise.allSettled([
      Promise.resolve().then(()=>callbackResource?.close()),Promise.resolve().then(()=>host?.close()),
      stopServer(mcpServer),stopServer(keyServer),stopServer(hookServer)
    ]);
    const closeErrors=closed.filter(row=>row.status==='rejected').map(row=>row.reason);
    result.cleanup={state:closeErrors.length?'FAILED':'CLOSED',at:iso(),
      errors:closeErrors.map(error=>({name:error.name,code:error.code??null,message:String(error.message).slice(0,2000)}))};
    if(closeErrors.length){result.status='FAILED';result.failedAt??=iso();
      result.error??={name:'AggregateError',message:'Original owner cleanup failed.',code:null};}
    try {await retain();}catch(error){closeErrors.push(error);}
    finally {await programmeLease?.close();}
    if(closeErrors.length)throw new AggregateError(closeErrors,'The original OAuth programme cleanup or its result retention failed.');
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),value=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
  const directory=value('--directory'),receiver=value('--receiving');
  const playwrightModule=value('--playwright-module'),executablePath=value('--browser-executable');
  if(Boolean(playwrightModule)!==Boolean(executablePath))
    throw new TypeError('Select both --playwright-module and --browser-executable, or neither.');
  const browser=playwrightModule?{playwrightModule:resolve(playwrightModule),executablePath:resolve(executablePath)}:undefined;
  const controller=new AbortController();
  const onStop=()=>controller.abort(new Error('The original native programme was stopped.'));
  process.once('SIGINT',onStop);process.once('SIGTERM',onStop);
  try {
    controller.signal.throwIfAborted();
    let receive;if(receiver){const module=await import(pathToFileURL(resolve(receiver)).href);
      controller.signal.throwIfAborted();receive=module.receiveOAuthSupport;}
    const {resultPath,result}=await runOAuthNativeProgramme({directory,receive,
      receivingModule:receiver?resolve(receiver):undefined,signal:controller.signal,browser});
    process.stdout.write(JSON.stringify({status:result.status,resultPath,incidents:result.incidents.map(x=>({id:x.id,kind:x.kind,status:x.status}))})+'\n');
  } finally {process.removeListener('SIGINT',onStop);process.removeListener('SIGTERM',onStop);}
}
