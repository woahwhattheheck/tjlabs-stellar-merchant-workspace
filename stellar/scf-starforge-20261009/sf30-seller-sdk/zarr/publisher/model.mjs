// MIT. The original retained publisher owns every plan, review and publication.
import { openSourceDatasetPublisher } from '../../postgres/publisher/model.mjs';
import { zarrPublisherDriver } from './driver.mjs';
export function openZarrPublisher(options = {}) {
  return openSourceDatasetPublisher({ ...options, relativePaths: options.relativePaths ?? true }, zarrPublisherDriver);
}
