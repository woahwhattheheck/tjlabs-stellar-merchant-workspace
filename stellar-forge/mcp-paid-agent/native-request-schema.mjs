// SPDX-License-Identifier: MIT
// Native request preparation shares the original SF43 tool and SF88 intent.
export const nativeRequestActions = ['request-workspace','request-prepare','request-review'];
export const NATIVE_REQUEST_LIMITS = Object.freeze({
  bodyBytes:1048576, toolRequestBytes:131072, sourcePageBytes:1048576, preparedConfigBytes:65536,
});
export const nativeRequestSchema = {
  properties:{
    handle:{type:'string',minLength:1,maxLength:128,
      description:'Original cached Bazaar handle selected in this connected buyer workspace.'},
    input:{type:'object',additionalProperties:false,properties:{
      query:{type:'object',maxProperties:30,additionalProperties:{anyOf:[
        {type:'string',maxLength:1024},
        {type:'array',minItems:1,maxItems:1024,items:{type:'string',maxLength:1024}},
      ]},description:'Explicit query strings or repeated values, encoded using the selected seller declaration.'},
      body:{type:'string',maxLength:1048576,
        description:'Exact UTF-8 request text using the operator-configured Content-Type; the complete HTTP MCP request also has its advertised byte limit.'},
    }},
  },
  anyOf:[
    {required:['action'],properties:{action:{const:'request-workspace'}}},
    {required:['action','intentId','handle','maxAtomic','input'],properties:{action:{const:'request-prepare'}}},
    {required:['action','intentId'],properties:{action:{const:'request-review'}}},
  ],
};
