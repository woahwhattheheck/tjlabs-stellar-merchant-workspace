// SPDX-License-Identifier: MIT
// Native request preparation shares the original SF43 tool and SF88 intent.
export const nativeRequestActions = ['request-workspace','request-workspaces','request-history','request-prepare','request-review'];
export const NATIVE_REQUEST_LIMITS = Object.freeze({
  bodyBytes:1048576, toolRequestBytes:131072, sourcePageBytes:1048576, preparedConfigBytes:65536,
});
export const nativeRequestSchema = {
  properties:{
    workspaceId:{type:'string',pattern:'^[a-z0-9][a-z0-9-]{0,63}$',
      description:'Exact trusted host workspace ID from request-workspaces. Keep this ID with the original intent for every lifecycle call and result range.'},
    handle:{type:'string',minLength:1,maxLength:128,
      description:'Original cached Bazaar handle selected in this connected buyer workspace.'},
    input:{type:'object',additionalProperties:false,properties:{
      path:{type:'object',maxProperties:30,additionalProperties:{type:'string',minLength:1,maxLength:1024},
        description:'Explicit raw path-segment values for the selected seller routeTemplate; the buyer encodes each value once and retains the concrete URL.'},
      query:{type:'object',maxProperties:30,additionalProperties:{anyOf:[
        {type:'string',maxLength:1024},
        {type:'array',minItems:1,maxItems:1024,items:{type:'string',maxLength:1024}},
      ]},description:'Explicit query strings or repeated values, encoded using the selected seller declaration.'},
      body:{type:'string',maxLength:1048576,
        description:'Exact UTF-8 request text using the operator-configured Content-Type; the complete HTTP MCP request also has its advertised byte limit.'},
    }},
  },
  anyOf:[
    {required:['action'],properties:{action:{enum:['request-workspace','request-workspaces','request-history']}}},
    {required:['action','intentId','handle','maxAtomic','input'],properties:{action:{const:'request-prepare'}}},
    {required:['action','intentId'],properties:{action:{const:'request-review'}}},
  ],
};
