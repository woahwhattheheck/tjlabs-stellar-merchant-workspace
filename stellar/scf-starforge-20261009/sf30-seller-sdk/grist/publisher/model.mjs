// MIT. Original publisher lifecycle with the Grist source driver.
import { openSourceDatasetPublisher } from '../../postgres/publisher/model.mjs';
import { gristPublisherDriver } from './driver.mjs';
export function openGristPublisher(options = {}) {
  return openSourceDatasetPublisher(options, gristPublisherDriver);
}
