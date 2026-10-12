// MIT. Backwards-compatible PostgreSQL entry over the original publisher bridge.
import { DbtPublisherProject } from './publisher.mjs';
export class DbtPostgresProject extends DbtPublisherProject {
  static open(options = {}) { return super.open({ ...options, sourceType: 'postgresql' }); }
}
