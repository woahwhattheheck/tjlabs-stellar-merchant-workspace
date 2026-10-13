// MIT. Original publisher lifecycle with the SeaTable source driver.
import { openSourceDatasetPublisher } from '../../postgres/publisher/model.mjs';
import { seaTablePublisherDriver, captureSeaTablePublicationPlan } from './driver.mjs';
import { inspectSeaTableSource, openSeaTableSourceFile } from '../source.mjs';
export function openSeaTablePublisher({ resolveCaptureFile, ...options } = {}) {
  if(resolveCaptureFile===undefined)return openSourceDatasetPublisher(options,seaTablePublisherDriver);
  if(typeof resolveCaptureFile!=='function')throw new TypeError('A trusted capture placement function is required.');
  const selected={resolveCaptureFile};
  return openSourceDatasetPublisher(options,{...seaTablePublisherDriver,
    inspectSource:file=>inspectSeaTableSource(file,selected),
    openSource:(file,settings)=>openSeaTableSourceFile(file,{...settings,...selected}),
    capturePlan:(file,directory,input)=>captureSeaTablePublicationPlan(file,directory,input,selected)});
}
