import type { IncomingMessage, ServerResponse } from 'node:http';
import type { OAuthResourceAuthorization, OAuthResourceDescription, OAuthResourceOptions } from './oauth-resource.mjs';
export const OAUTH_OBSERVATION_PATH: '/api/mcp/oauth/observation';
type Handler=(req:IncomingMessage,res:ServerResponse)=>unknown;
export interface OAuthResourceHost {
  transportOptions: Readonly<{bearerToken?:string;authorization?:OAuthResourceAuthorization}>;
  wrap(handler:Handler):Handler;
  describe():{mode:'fixed-bearer'}|({mode:'oauth'}&OAuthResourceDescription&{
    observation:{path:typeof OAUTH_OBSERVATION_PATH;tool:'mcp_oauth_observation_read'};
  });
  close():Promise<void>;
}
export function loadOAuthResourceHost(options?:{
  configPath?:string;bearerToken?:string;fetchImpl?:OAuthResourceOptions['fetchImpl'];
}):Promise<OAuthResourceHost>;
