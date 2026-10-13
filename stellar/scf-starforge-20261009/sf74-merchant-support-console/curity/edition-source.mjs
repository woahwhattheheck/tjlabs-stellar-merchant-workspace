// MIT. Receive the provider's exact immutable reviewed edition; no log reinterpretation.
import {join} from 'node:path';
import {readdir,lstat} from 'node:fs/promises';
import {openEdition,readEventPage,readFindingPage,readSourceRecord} from './source.mjs';
import {validateReviewedEdition,selectedEventReferences,reviewedSelection as originalReviewedSelection} from './review.mjs';
import {ensure,hash,bytes,privateDirectory,read,same,member} from './case-io.mjs';

export async function openCurityEditionSource({directory}={}){
  const root=await privateDirectory(directory);
  async function catalog(){
    const editions=[],unavailable=[];
    for(const row of await readdir(root,{withFileTypes:true})){
      if(!row.isDirectory()||row.isSymbolicLink()||row.name.startsWith('.'))continue;
      try{
        const path=join(root,row.name);await privateDirectory(path,{create:false});
        const manifest=await openEdition(path,{verify:false});
        editions.push({id:manifest.id,directoryName:row.name,sourceContext:manifest.sourceContext,
          installationId:manifest.binding?.installationId??manifest.installationId,
          state:manifest.state,counts:manifest.counts,review:manifest.review,
          binding:manifest.binding,mappingRevision:manifest.mappingRevision});
      }catch(error){unavailable.push({directoryName:row.name,code:error.code??'CURITY_EDITION_UNREADABLE'});}
    }
    return {editions,unavailable};
  }
  async function locate(editionId){
    ensure(typeof editionId==='string'&&editionId.length>0&&editionId.length<=200,'EDITION','Select a retained source edition.');
    const matches=(await catalog()).editions.filter(row=>row.id===editionId);
    ensure(matches.length>0,'EDITION_NOT_FOUND','The selected source edition is not retained here.',404);
    // Identical received copies use the same complete immutable content.
    const paths=matches.map(row=>join(root,row.directoryName));
    const manifest=await openEdition(paths[0],{verify:true});
    for(const path of paths.slice(1))same(await openEdition(path,{verify:true}),manifest);
    const originalManifest=await read(join(paths[0],'manifest.json'));
    same(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(originalManifest)),manifest);
    return {directory:paths[0],manifest,manifestSha256:hash(originalManifest)};
  }
  async function reviewedSelection({editionId,reviewId,eventKeys}){
    const {manifest,manifestSha256}=await locate(editionId);
    validateReviewedEdition(manifest);
    ensure(manifest.review.id===reviewId,'REVIEW_CHANGED','Select the exact retained review.',409);
    const selection=originalReviewedSelection(manifest,{editionId,reviewId,eventKeys});
    return {...selection,manifestSha256,files:manifest.files};
  }
  async function manifest(editionId){return (await locate(editionId)).manifest;}
  async function events({editionId,after=0,limit=100}){return readEventPage((await locate(editionId)).directory,{after,limit});}
  async function findings({editionId,after=0,limit=100}){return readFindingPage((await locate(editionId)).directory,{after,limit});}
  async function original({editionId,ref}){return readSourceRecord((await locate(editionId)).directory,ref);}
  async function file({editionId,sourceId}){
    const selected=await locate(editionId),source=selected.manifest.sourceFiles.find(row=>row.sourceId===sourceId);
    ensure(source,'SOURCE_FILE','Select a declared original source file.',404);
    const pin=selected.manifest.files.find(row=>row.path===source.path);
    ensure(pin,'SOURCE_FILE','The original source is outside the complete manifest.',409);
    return {path:await member(selected.directory,source.path),file:{name:source.name??sourceId,...pin}};
  }
  return Object.freeze({directory:root,catalog,locate,reviewedSelection,manifest,events,findings,original,file});
}
