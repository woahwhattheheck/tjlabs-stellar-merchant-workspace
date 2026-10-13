// MIT. Original publisher lifecycle with the Grist source driver.
import { openSourceDatasetPublisher } from '../../postgres/publisher/model.mjs';
import { gristPublisherDriver, captureGristPublicationPlan } from './driver.mjs';
import { inspectGristSource, openGristSourceFile } from '../source.mjs';
export function openGristPublisher({ resolveCaptureFile, ...options } = {}) {
  if(resolveCaptureFile===undefined)return openSourceDatasetPublisher(options,gristPublisherDriver);
  if(typeof resolveCaptureFile!=='function')throw new TypeError('A trusted capture placement function is required.');
  const selected={resolveCaptureFile};
  return openSourceDatasetPublisher(options,{...gristPublisherDriver,
    inspectSource:file=>inspectGristSource(file,selected),
    openSource:(file,settings)=>openGristSourceFile(file,{...settings,...selected}),
    capturePlan:(file,directory,input)=>captureGristPublicationPlan(file,directory,input,selected)});
}
