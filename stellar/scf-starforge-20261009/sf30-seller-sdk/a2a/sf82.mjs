// SPDX-License-Identifier: MIT
import { materializeA2APublication } from './merchant.mjs';
import { prepareA2ARelease } from './release.mjs';
import { canonical, fail } from './foundation.mjs';
import { initReleaseStore, inspectRelease, stageRelease, normalizeReleaseRuntime } from '../../sf82-seller-pilot/releases.mjs';
export async function stageA2APublication(workspace,{id,publicationId,releases,releaseId,label=releaseId,runtime={port:0}}){
  const selected=materializeA2APublication(workspace,{id,publicationId}),prepared=await prepareA2ARelease(selected.directory),normalized=normalizeReleaseRuntime(runtime);
  await initReleaseStore(releases,{resume:true});
  let existing=null;try{existing=await inspectRelease(releases,releaseId);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(existing){if(canonical(existing.a2a)!==canonical(prepared.a2a)||canonical(existing.runtime)!==canonical(normalized)||existing.label!==label)fail('RELEASE_ID_CONFLICT','This release ID already selects different retained source, terms, label or runtime.',409);return{...existing,replay:true};}
  return stageRelease(releases,{id:releaseId,label,a2aPackage:selected.directory,runtime});
}
