// SPDX-License-Identifier: MIT
export const nativeObjectRecoveryActions=Object.freeze(['object-recovery']);
export const nativeObjectRecoveryOperations=Object.freeze(['profiles','inspect','snapshot','verify','restore','history','show','continue','cancel']);
export const nativeObjectRecoverySchema=Object.freeze({
 properties:{
  objectRecoveryOperation:{type:'string',enum:[...nativeObjectRecoveryOperations]},
  objectRecoveryProfile:{type:'string',pattern:'^[A-Za-z][A-Za-z0-9_-]{0,63}$'},
  objectRecoveryProfileSha256:{type:'string',pattern:'^[a-f0-9]{64}$',
   description:'Exact immutable host registration returned by profiles. Paths, runtime and passphrase values cannot be supplied by a tool call.'},
  objectRecoveryRequestId:{type:'string',pattern:'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'},
  objectRecoveryInput:{type:'object',additionalProperties:false,properties:{
   expectedReviewSha256:{type:'string',pattern:'^[a-f0-9]{64}$'},
   expectedRecordSha256:{type:'string',pattern:'^[a-f0-9]{64}$'},
   expectedRequestSha256:{type:'string',pattern:'^[a-f0-9]{64}$'},
   quiesced:{const:true},
   afterAttempt:{type:['string','null'],pattern:'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'}
  }}
 },
 anyOf:[
  {required:['action','objectRecoveryOperation'],properties:{action:{const:'object-recovery'},objectRecoveryOperation:{const:'profiles'}}},
  {required:['action','objectRecoveryOperation','objectRecoveryProfile','objectRecoveryProfileSha256'],
   properties:{action:{const:'object-recovery'},objectRecoveryOperation:{enum:['inspect','history']}}},
  {required:['action','objectRecoveryOperation','objectRecoveryProfile','objectRecoveryProfileSha256','objectRecoveryRequestId'],
   properties:{action:{const:'object-recovery'},objectRecoveryOperation:{enum:['show','cancel']}}},
  {required:['action','objectRecoveryOperation','objectRecoveryProfile','objectRecoveryProfileSha256','objectRecoveryRequestId','objectRecoveryInput'],
   properties:{action:{const:'object-recovery'},objectRecoveryOperation:{enum:['snapshot','verify','restore','continue']}}}
 ]
});
