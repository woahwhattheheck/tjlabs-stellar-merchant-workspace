// MIT. Renewal operations reuse the original case writer and support file lifecycle.
import {openCaseServiceRenewals} from '../../stellar/scf-starforge-20261009/sf74-merchant-support-console/case-service-renewals.mjs';
import {commercialWorkspaceId} from '../../stellar/scf-starforge-20261009/sf74-merchant-support-console/case-commercial.mjs';
import {failure,exact,privateSupportDirectory} from './host-files.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HASH=/^[a-f0-9]{64}$/;
const methods=Object.freeze({
  merchant_service_renewals_queue:'queue',
  merchant_service_renewals_read:'read',
  merchant_service_renewals_preview:'preview',
  merchant_service_renewals_propose:'propose',
  merchant_service_renewals_decide:'decide',
  merchant_service_renewals_handover:'handover'
});

export function merchantServiceRenewals({cases,casesDirectory,exportsDirectory,reads}){
  let model;
  const original=async()=>model??=openCaseServiceRenewals({
    caseStore:await cases(),workspaceId:commercialWorkspaceId(casesDirectory())
  });
  const scopeFor=args=>{
    if(!UUID.test(args.id??''))throw failure('INVALID_CASE_ID','Choose the original saved case UUID.');
    return 'service-renewals:'+args.id;
  };
  return Object.freeze({
    handles:name=>name.startsWith('merchant_service_renewals_'),
    async call(name,args={}){
      const method=methods[name];
      if(method)return (await original())[method](args);
      if(name==='merchant_service_renewals_file_reads'){
        exact(args,['id'],['id']);
        return {id:args.id,...reads.status(scopeFor(args))};
      }
      if(name==='merchant_service_renewals_file_release'){
        exact(args,['id','readId'],['id','readId']);
        const scope=scopeFor(args);
        if(!UUID.test(args.readId??''))throw failure('INVALID_PARAMS','Keep the original file read UUID.');
        await reads.release(scope,args.readId);
        return {id:args.id,readId:args.readId,released:true};
      }
      if(name==='merchant_service_renewals_handover_file'){
        exact(args,['id','revision','renewalId','readId','expectedSha256','offset','limit'],
          ['id','revision','renewalId']);
        const scope=scopeFor(args);
        if(!HASH.test(args.revision??'')||!UUID.test(args.renewalId??''))
          throw failure('INVALID_PARAMS','Select the original case revision and renewal UUID.');
        if(args.readId!==undefined&&!UUID.test(args.readId))
          throw failure('INVALID_PARAMS','Keep the original file read UUID.');
        const choice={id:args.id,revision:args.revision,renewalId:args.renewalId};
        return {...choice,...await reads.read({
          scope,key:JSON.stringify(choice),kind:'merchant-service-renewal',
          directory:await privateSupportDirectory(exportsDirectory()),
          readId:args.readId,offset:args.offset,limit:args.limit,expectedSha256:args.expectedSha256,
          load:async()=>{
            const handover=await(await original()).handover(choice);
            return {
              bytes:Buffer.from(JSON.stringify(handover,null,2)+'\n','utf8'),
              name:'service-renewal-'+choice.renewalId+'.json',
              type:'application/json; charset=utf-8'
            };
          }
        })};
      }
      throw failure('TOOL_NOT_FOUND','Unknown original service renewal operation.');
    }
  });
}
