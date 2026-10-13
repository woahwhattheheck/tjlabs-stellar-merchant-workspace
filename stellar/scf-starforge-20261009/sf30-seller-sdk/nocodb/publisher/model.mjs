// MIT. Original publisher lifecycle with the NocoDB source driver.
import { openSourceDatasetPublisher } from '../../postgres/publisher/model.mjs';
import { nocoDBPublisherDriver, captureNocoDBPublicationPlan } from './driver.mjs';
import { inspectNocoDBSource, openNocoDBSourceFile } from '../source.mjs';
export function openNocoDBPublisher({ resolveCaptureFile, ...options } = {}) {
  if(resolveCaptureFile===undefined)return openSourceDatasetPublisher(options,nocoDBPublisherDriver);
  if(typeof resolveCaptureFile!=='function')throw new TypeError('A trusted capture placement function is required.');
  const selected={resolveCaptureFile};
  return openSourceDatasetPublisher(options,{...nocoDBPublisherDriver,
    inspectSource:file=>inspectNocoDBSource(file,selected),
    openSource:(file,settings)=>openNocoDBSourceFile(file,{...settings,...selected}),
    capturePlan:(file,directory,input)=>captureNocoDBPublicationPlan(file,directory,input,selected)});
}
