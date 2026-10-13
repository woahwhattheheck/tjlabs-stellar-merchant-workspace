// MIT. One OAuth configuration and metadata seam for the original MCP launchers.
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

export const OAUTH_OBSERVATION_PATH='/api/mcp/oauth/observation';

/** Fixed operator tokens remain dependency-free; OAuth loads only when selected. */
export async function loadOAuthResourceHost({configPath,bearerToken,fetchImpl}={}) {
  if (!configPath) {
    if (fetchImpl !== undefined) throw new TypeError('oauthFetchImpl requires an explicit OAuth resource configuration');
    return Object.freeze({transportOptions:Object.freeze({bearerToken}),wrap:handler=>handler,
      describe:()=>({mode:'fixed-bearer'}),close:async()=>{}});
  }
  if (typeof configPath!=='string' || !isAbsolute(configPath))
    throw new TypeError('MCP_OAUTH_CONFIG / --oauth-config must be an absolute trusted configuration path');
  if (bearerToken!==undefined && bearerToken!=='')
    throw new TypeError('Select either an OAuth resource configuration or a fixed bearer token; clear the other setting');
  if ((await stat(configPath)).size > 262144) throw new TypeError('OAuth resource configuration exceeds 256 KiB');
  const bytes=await readFile(configPath);
  if (bytes.length > 262144) throw new TypeError('OAuth resource configuration exceeds 256 KiB');
  let config;
  try { config=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); }
  catch { throw new TypeError('OAuth resource configuration must contain complete UTF-8 JSON'); }
  const {validateOAuthResourceConfig,OAuthResourceError}=await import('./oauth-resource.mjs');
  const {createObservedOAuthResourceAuthorization,OAUTH_OBSERVATION_TOOL}=await import('./oauth-observer.mjs');
  config=validateOAuthResourceConfig(config);
  // Existing merchant/buyer launchers expose ONE shared operator workspace.
  // Their permitted subjects are explicit per issuer. Multi-user applications
  // embed the core with their own current host authority and state selection.
  if (config.authorizationServers.some(server=>!server.allowedSubjects.length))
    throw new TypeError('Each issuer needs explicit allowedSubjects for this shared operator workspace');
  const authorization=createObservedOAuthResourceAuthorization(config,{...(fetchImpl===undefined?{}:{fetchImpl})});
  return Object.freeze({transportOptions:Object.freeze({authorization}),
    wrap:handler=>{
      if (typeof handler!=='function') throw new TypeError('Original MCP HTTP handler required');
      return (req,res)=>{
        if(authorization.metadataHandler(req,res))return;
        let target;try{target=new URL(req.url,'http://127.0.0.1');}catch{return handler(req,res);}
        if(target.pathname!==OAUTH_OBSERVATION_PATH)return handler(req,res);
        if(req.url!==OAUTH_OBSERVATION_PATH)
          return authorization.respondError(new OAuthResourceError(400,'invalid_request','Use the exact observation path'),res);
        // Server-to-server status read; use the original operator's OAuth token.
        if(req.headers.origin!==undefined)
          return authorization.respondError(new OAuthResourceError(403,'access_denied','Use the original operator source reader'),res);
        if(req.method!=='GET'&&req.method!=='HEAD'){
          res.writeHead(405,{'cache-control':'no-store',allow:'GET, HEAD'});res.end();return;
        }
        return authorization.readObservation(req).then(value=>{
          if(res.destroyed||res.writableEnded)return;
          const body=JSON.stringify(value)+'\n';
          res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
            'x-content-type-options':'nosniff','content-length':String(Buffer.byteLength(body))});
          res.end(req.method==='HEAD'?undefined:body);
        },error=>authorization.respondError(error,res));
      };
    },
    describe:()=>({mode:'oauth',...authorization.describe(),observation:{path:OAUTH_OBSERVATION_PATH,tool:OAUTH_OBSERVATION_TOOL}}),
    close:()=>authorization.close()});
}
