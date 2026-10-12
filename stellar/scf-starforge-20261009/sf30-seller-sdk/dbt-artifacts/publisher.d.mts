import type { DbtProjectClient, ResultBinding, Sha256 } from './client.mjs';
export interface PublisherProjectOptions {
  project: string; python?: string; publisherDirectory: string; sourceFile?: string;
  targetDirectory?: string; create?: boolean; seller?: string | null; resource?: string | null;
  sourceType?: 'postgresql' | 'sqlite'; environment?: Record<string, string | undefined>;
}
export interface PublisherProjectBindingInput {
  id: string; edition: Sha256; uid: string; request_id: string;
  expectedQueryHash: Sha256; expectedCandidateHash?: Sha256;
}
export type PublisherAction = 'status' | 'source' | 'plan.save' | 'plan' | 'run' | 'extract' | 'cancel' |
  'inspect' | 'review' | 'publish' | 'recover' | 'buyer.offer' | 'buyer.prepare';
export declare class DbtPublisherProject {
  readonly client: DbtProjectClient;
  readonly sourceType: 'postgresql' | 'sqlite';
  static open(options: PublisherProjectOptions): Promise<DbtPublisherProject>;
  call(action: 'bind', input: PublisherProjectBindingInput): Promise<ResultBinding>;
  call(action: PublisherAction, input?: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
}
export declare class DbtSqliteProject extends DbtPublisherProject {
  static open(options: Omit<PublisherProjectOptions, 'sourceType'>): Promise<DbtSqliteProject>;
}
