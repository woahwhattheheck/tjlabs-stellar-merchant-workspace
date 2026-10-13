// MIT. One original read-only catalogue snapshot for all retained author returns.
import {openAuthorWorklist} from './author-worklist.mjs';
import {buildAuthorDecisionMatrix} from './author-matrix.mjs';
import {sha256Utf8} from './sha256.mjs';
import {openCatalogReadSnapshot} from '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/catalog/read-snapshot.mjs';
import {previewRecipientReview} from '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/catalog/recipient-return.mjs';
export async function previewAuthorDecisionMatrix(original,raw,{catalogId,workspaceId}){
 const worklist=openAuthorWorklist(raw);
 if(worklist.workspaceId!==workspaceId||original.store.id!==workspaceId)throw Error('The complete worklist belongs to another original workspace.');
 if(typeof catalogId!=='string'||!catalogId)throw Error('Select the original catalogue.');
 const snapshot=await openCatalogReadSnapshot(original);
 try{
  const catalog=snapshot.catalog.catalog(catalogId),observations=[];
  for(const item of worklist.items.filter(x=>x.catalogId===catalogId)){
   try{observations.push({returnId:item.id,comparison:previewRecipientReview(snapshot.catalog,item.returnText)});}
   catch(error){
    if(!['REVIEW_ORIGINAL_CHANGED','REVIEW_CATALOG','CATALOG_NOT_FOUND','CATALOG_EDITION_NOT_FOUND'].includes(error.code))throw error;
    observations.push({returnId:item.id,comparison:null,error:{code:error.code,message:error.message}});
   }
  }
  return buildAuthorDecisionMatrix(worklist,{catalog,observedAt:new Date().toISOString(),inputSha256:sha256Utf8(raw).sha256,observations});
 }finally{await snapshot.close();}
}
