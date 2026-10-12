import { DbtPublisherProject } from './publisher.mjs';
import type { PublisherProjectOptions, PublisherProjectBindingInput } from './publisher.mjs';
export type PostgresProjectOptions = Omit<PublisherProjectOptions, 'sourceType'>;
export type PostgresProjectBindingInput = PublisherProjectBindingInput;
export declare class DbtPostgresProject extends DbtPublisherProject {
  static open(options: PostgresProjectOptions): Promise<DbtPostgresProject>;
}
