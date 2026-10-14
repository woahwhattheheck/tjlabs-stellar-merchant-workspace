'use strict';
// Authored receiving example. Executes the maintained capture planner; no live portal is represented.
const capture=require('../runtime/hubspot-capture.cjs');
function run(){
 const plan={schema:'crm-migration.hubspot-plan.v1',apiVersion:'2026-09',recordScope:'active',propertySensitivity:'non_sensitive',objects:[{type:'contacts',properties:['email']},{type:'companies',properties:['name']}],associations:[{from:'contacts',to:'companies'}]};
 let state=capture.create({captureId:'receiving-example',connection:'example',portalId:'123456',workspaceId:'crm-example',plan,at:'2026-10-14T12:00:00.000Z'});const responses=[];
 const rec=(id,properties)=>({id,properties,createdAt:'2026-10-01T12:00:00Z',updatedAt:'2026-10-14T12:00:00Z',archived:false});
 const pages=[
 {results:[{name:'email',archived:false,dataSensitivity:'non_sensitive'}]},
 {results:[{name:'name',archived:false,dataSensitivity:'non_sensitive'}]},
 {results:[{category:'HUBSPOT_DEFINED',typeId:279,label:null},{category:'HUBSPOT_DEFINED',typeId:1,label:'Primary'}]},
 {results:[rec('9007199254740993',{email:'one@example.invalid'})],paging:{next:{after:'contacts+2/='}}},
 {results:[rec('2',{email:null})]},
 {results:[rec('10',{name:'Example A'}),rec('11',{name:'Example B'})]},
 {status:'COMPLETE',results:[{from:{id:'9007199254740993'},to:[{toObjectId:'10',associationTypes:[{category:'HUBSPOT_DEFINED',typeId:279,label:null},{category:'HUBSPOT_DEFINED',typeId:1,label:'Primary'}]}],paging:{next:{after:'one+next/='}}},{from:{id:'2'},to:[]}]},
 {status:'COMPLETE',results:[{from:{id:'9007199254740993'},to:[{toObjectId:'11',associationTypes:[{category:'HUBSPOT_DEFINED',typeId:279,label:null}]}]}]}
 ];
 for(const data of pages){const request=capture.request(state),at='2026-10-14T12:00:'+String(responses.length+1).padStart(2,'0')+'.000Z';responses.push({request,data,at});state=capture.accept(state,request,data,{sha256:capture.digest(data),kind:request.kind,at},at);}
 if(state.phase!=='complete'||state.objects.contacts[0].id!=='9007199254740993'||state.associations['contacts-companies'].length!==3)throw Error('Complete example capture differs.');
 if(responses.at(-1).request.body.inputs[0].after!=='one+next/=')throw Error('Per-source association cursor was not preserved.');
 const files=capture.outputs(state);return {schema:'crm-migration.hubspot-course.v1',provenance:'Authored receiving example; no customer or live portal data.',state,responses,files,summary:capture.summary(state)};
}
module.exports={run};
if(require.main===module)process.stdout.write(JSON.stringify(run(),null,2)+'\n');
