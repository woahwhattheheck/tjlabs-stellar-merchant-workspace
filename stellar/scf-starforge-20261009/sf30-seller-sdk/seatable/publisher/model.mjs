// MIT. Original publisher lifecycle with the SeaTable source driver.
import { openSourceDatasetPublisher } from '../../postgres/publisher/model.mjs';
import { seaTablePublisherDriver } from './driver.mjs';
export function openSeaTablePublisher(options = {}) {
  return openSourceDatasetPublisher(options, seaTablePublisherDriver);
}
