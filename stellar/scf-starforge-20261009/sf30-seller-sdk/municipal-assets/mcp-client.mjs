// MIT. Typed convenience client of the maintained municipal merchant tool transport.
import { createHash } from 'node:crypto';
import { need as requireValue,fail as failure,clone,canonical,identifier,HASH as hashPattern } from './agent-contracts.mjs';
function toolValue(result) {
  if (result?.isError) {
    const detail = result.structuredContent?.error;
    const message = detail?.message ?? result.content?.filter(item => item.type === 'text').map(item => item.text).join('\n') ?? 'The merchant operation failed.';
    throw Object.assign(new Error(message), { code: detail?.code ?? 'MUNICIPAL_ASSET_MERCHANT_ERROR', result });
  }
  if (result && Object.hasOwn(result, 'structuredContent') && result.structuredContent !== undefined)
    return result.structuredContent;
  if (Array.isArray(result?.content)) {
    const content = result.content.filter(item => item.type === 'text');
    requireValue(content.length === 1, 'The merchant returned an unexpected tool response.', 'MUNICIPAL_ASSET_MERCHANT_RESPONSE');
    try { return JSON.parse(content[0].text); }
    catch { throw failure('MUNICIPAL_ASSET_MERCHANT_RESPONSE', 'The merchant tool response must contain its complete JSON value.'); }
  }
  return result;
}
export class MunicipalAssetMerchantClient {
  #callTool;#workspace;
  constructor(callTool,workspace){requireValue(typeof callTool==='function','Supply the existing merchant callTool adapter.');this.#callTool=callTool;this.#workspace=identifier(workspace);}
  call(name,input={}) {
    requireValue(typeof name==='string'&&name.startsWith('merchant_municipal_assets_'),'Select a municipal merchant tool.');
    const args=clone(name==='merchant_municipal_assets_workspaces'?input:{...input,workspace:this.#workspace});
    return Promise.resolve().then(()=>this.#callTool(name,args)).then(toolValue);
  }
  workspaces(input={}){return this.call('merchant_municipal_assets_workspaces',input);}
  status(input={}){return this.call('merchant_municipal_assets_status',input);}
  project(input={}){return this.call('merchant_municipal_assets_project',input);}
  projectSection(input={}){return this.call('merchant_municipal_assets_project_section',input);}
  records(input={}){return this.call('merchant_municipal_assets_records',input);}
  input(input={}){return this.call('merchant_municipal_assets_input',input);}
  createProject(input={}){return this.call('merchant_municipal_assets_create_project',input);}
  importInput(input={}){return this.call('merchant_municipal_assets_import_input',input);}
  saveMapping(input={}){return this.call('merchant_municipal_assets_mapping',input);}
  selectInput(input={}){return this.call('merchant_municipal_assets_select_input',input);}
  saveSettings(input={}){return this.call('merchant_municipal_assets_settings',input);}
  review(input={}){return this.call('merchant_municipal_assets_review',input);}
  exclude(input={}){return this.call('merchant_municipal_assets_exclude',input);}
  proposeRepair(input={}){return this.call('merchant_municipal_assets_repair',input);}
  requestStatus(input={}){return this.call('merchant_municipal_assets_request_status',input);}
  applyReturns(input={}){return this.call('merchant_municipal_assets_apply_returns',input);}
  withdrawChange(input={}){return this.call('merchant_municipal_assets_withdraw_change',input);}
  nativeCheck(input={}){return this.call('merchant_municipal_assets_native_check',input);}
  release(input={}){return this.call('merchant_municipal_assets_release',input);}
  restoreRevision(input={}){return this.call('merchant_municipal_assets_restore_revision',input);}
  refreshStatus(input={}){return this.call('merchant_municipal_assets_refresh_status',input);}
  refreshStart(input={}){return this.call('merchant_municipal_assets_refresh_start',input);}
  refreshResume(input={}){return this.call('merchant_municipal_assets_refresh_resume',input);}
  maximoStatus(input={}){return this.call('merchant_municipal_assets_maximo_status',input);}
  maximoStart(input={}){return this.call('merchant_municipal_assets_maximo_start',input);}
  maximoResume(input={}){return this.call('merchant_municipal_assets_maximo_resume',input);}
  maximoReceive(input={}){return this.call('merchant_municipal_assets_maximo_receive',input);}
  maximoPrepareLoad(input={}){return this.call('merchant_municipal_assets_maximo_prepare_load',input);}
  maximoReceiveLoad(input={}){return this.call('merchant_municipal_assets_maximo_receive_load',input);}
  maximoResult(input={}){return this.call('merchant_municipal_assets_maximo_result',input);}
  operation(requestId){return this.call('merchant_municipal_assets_operation',{requestId});}
  replayOperation(requestId){return this.call('merchant_municipal_assets_replay_operation',{requestId});}
  readFile(selection,continuation={}){return this.call('merchant_municipal_assets_file_read',{...selection,...continuation});}
  releaseFile(readId){return this.call('merchant_municipal_assets_file_release',{readId});}
  async downloadFile(selection, { limit = 196608, maximumBytes = 268435456, onChunk } = {}) {
    requireValue(Number.isSafeInteger(maximumBytes) && maximumBytes > 0, 'Set a positive download size limit.');
    requireValue(onChunk === undefined || typeof onChunk === 'function', 'Use an async byte sink for streaming downloads.');
    const chosen = clone(selection), parts = [], hash = createHash('sha256');
    let offset = 0, file, readId, expectedSha256, completed = false;
    try {
      for (;;) {
        const chunk = await this.readFile(chosen, { limit, offset,
          ...(readId ? { readId } : {}), ...(expectedSha256 ? { expectedSha256 } : {}) });
        requireValue(chunk?.encoding === 'base64' && chunk.offset === offset &&
          hashPattern.test(chunk.file?.sha256 ?? '') && Number.isSafeInteger(chunk.file?.bytes) &&
          chunk.file.bytes >= 0 && chunk.file.bytes <= maximumBytes, 'The retained download metadata changed.', 'MUNICIPAL_ASSET_DOWNLOAD_CHANGED');
        if (!file) { file = clone(chunk.file); expectedSha256 = file.sha256; }
        else requireValue(canonical(file) === canonical(chunk.file),
          'The retained download selection changed.', 'MUNICIPAL_ASSET_DOWNLOAD_CHANGED');
        readId = chunk.readId;
        const bytes = Buffer.from(chunk.data, 'base64');
        requireValue(bytes.toString('base64') === chunk.data && bytes.length === chunk.bytesRead &&
          offset + bytes.length <= file.bytes, 'The retained download bytes changed.', 'MUNICIPAL_ASSET_DOWNLOAD_CHANGED');
        hash.update(bytes);
        if (onChunk) await onChunk(bytes, { file, offset }); else parts.push(bytes);
        offset += bytes.length;
        if (chunk.nextOffset === null) {
          requireValue(offset === file.bytes && hash.digest('hex') === file.sha256,
            'The complete downloaded file differs from its source hash.', 'MUNICIPAL_ASSET_DOWNLOAD_CHANGED');
          completed = true;
          return { file, bytesRead: offset, ...(onChunk ? {} : { bytes: Buffer.concat(parts, offset) }) };
        }
        requireValue(chunk.nextOffset === offset && bytes.length > 0,
          'The retained reader did not advance by its original byte count.', 'MUNICIPAL_ASSET_DOWNLOAD_CHANGED');
      }
    } catch (error) {
      if (file) error.continuation = { selection: chosen, expectedSha256: file.sha256, offset, file };
      throw error;
    } finally {
      if (!completed && readId) await this.releaseFile(readId).catch(() => {});
    }
  }
}
