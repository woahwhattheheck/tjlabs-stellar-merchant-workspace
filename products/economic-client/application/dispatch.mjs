// SPDX-License-Identifier: MIT
export const ACTIONS=['state','request','configure','registry','registry-result','capture','capture-info','rows',
  'save-draft','preview','save-briefing','briefing','activate','compare','source',
  'reviews','review-create','review-document','review-preview','review-resolve','oecd-state','oecd-seed','oecd-save','oecd-attach','oecd-reopen'];
const writes=new Set(['review-create','review-resolve','configure','registry','capture','save-draft','save-briefing','activate','oecd-seed','oecd-save','oecd-attach','oecd-reopen']);
export function dispatch(workspace,action,input={},operationId){
  if(writes.has(action)&&!operationId)throw new Error('Continue a named original operation');
  switch(action){
    case 'state':return workspace.state();
    case 'request':return workspace.request(input.operation_id);
    case 'configure':return workspace.configure(operationId,input);
    case 'registry':return workspace.registry(operationId,input);
    case 'registry-result':return workspace.registryResult(input.operation_id);
    case 'capture':return workspace.capture(operationId,input);
    case 'capture-info':return workspace.captureInfo(input.capture_id);
    case 'rows':return workspace.rows(input.capture_id,input.series_id,input);
    case 'save-draft':return workspace.saveDraft(operationId,input);
    case 'preview':return workspace.preview(input);
    case 'save-briefing':return workspace.saveBriefing(operationId,input);
    case 'briefing':return workspace.briefing(input.briefing_id);
    case 'activate':return workspace.activate(operationId,input);
    case 'compare':return workspace.compare(input.before,input.after);
    case 'source':return workspace.source(input.source_id);
    case 'reviews':return workspace.reviews();
    case 'review-create':return workspace.reviewCreate(operationId,input);
    case 'review-document':return workspace.reviewDocument(input.package_id);
    case 'review-preview':return workspace.reviewPreview(input.return_id);
    case 'review-resolve':return workspace.reviewResolve(operationId,input);
    case 'oecd-state':return workspace.oecdState();
    case 'oecd-seed':return workspace.oecdSeed(operationId,input);
    case 'oecd-save':return workspace.oecdSave(operationId,input);
    case 'oecd-attach':return workspace.oecdAttach(operationId,input);
    case 'oecd-reopen':return workspace.oecdReopen(operationId,input);
    default:throw new Error('Unknown client workspace action: '+action);
  }
}
