/** Exact native installation and original queue operations. */
export type Decimal = string | number;
export type Json = null | boolean | number | string | Json[] | {[key: string]: Json};
export type JsonObject = {[key: string]: Json};
export type Role = 'operator' | 'ingress' | 'worker';
export interface InstallationSummary {
  installation_id: string;
  operation_id: string;
  source_identity: string;
  paths: {directory: string; application: string; configuration: string; database: string};
  python: {path: string; version: [number, number, number]};
  binding: {directory: string; device: string; inode: string};
}
export interface NativeResult<T = Json> {
  schema: 'taskerarmy.operation-result.v1';
  ok: true;
  operation: string;
  request_id: string | null;
  installation: InstallationSummary;
  result: T;
  replayed: boolean;
  adapter_sha256: string;
}
export interface TaskerConfiguration {
  version: 1;
  product_name: string;
  tenants: Record<string, {ingress_token_env: string; review_origins: string[]}>;
  routes: Array<{id: string; tenant_id: string; store_ids: string[]; states: string[];
    team_id: string; channel_id: string; webhook_env: string; generation: Decimal; enabled: boolean}>;
}
export interface ConfigurationResult {
  configuration: TaskerConfiguration;
  revision: string;
  credentials: {tenants: Record<string, boolean>; routes: Record<string, boolean>};
}
export interface TaskerEvent {
  event_id: string; job_id: string; store_id: string; version: Decimal;
  state: 'clarification_required' | 'execution_blocked' | 'qa_failed' | 'preview_ready' | 'approval_requested' | 'quiet';
  occurred_at: string; title: string; review_url: string; reason?: string;
}
export interface QueueFilters {
  tenant?: string; status?: string; route_id?: string; job_id?: string;
  before_id?: Decimal; limit?: number;
}
export interface DeliverySummary {
  id: string; tenant_id: string; route_id: string; event_id: string; job_id: string; version: string;
  channel_key: string; message_sha256: string; status: string; attempts: number;
  due_at: number; expires_at: number; created_at: number; updated_at: number;
  http_status: number | null; last_error: string | null; sent_at: number | null; resolution: string | null;
}
export interface QueuePage {
  deliveries: DeliverySummary[];
  counts: Array<{status: string; count: number}>;
  total: number;
  next_before_id: string | null;
  filters: Pick<QueueFilters, 'tenant' | 'status' | 'route_id' | 'job_id'>;
}
export interface JobHistory {
  job: {tenant_id: string; job_id: string; store_id: string; version: string; event_id: string;
    state: string; updated_at: number} | null;
  events: Array<{event_id: string; version: string; state: string; received_at: number;
    outcome: string; payload_hash: string;
    deliveries: Array<{id: string; route_id: string; channel_key: string; status: string;
      attempts: number; http_status: number | null; last_error: string | null;
      sent_at: number | null; resolution: string | null; message_sha256: string}>;
  }>;
  next_before_version: string | null;
}
export interface CommandDescription {
  role: Role; executable: string; argv: string[]; cwd: string; script: string;
  script_sha256: string; ready_file: string | null;
  health: {kind: 'private-ready-file'; path: string; schema: 'taskerarmy.operator-process.v1'} |
    {kind: 'http'; url: string} | {kind: 'managed-process'};
  environment_references: Array<{name: string; present: boolean}>;
}
export interface NamedRequest {
  installation_id: string; request_id: string; operation: string;
  request_sha256: string; request_json: string; request: JsonObject;
  state: 'prepared' | 'completed'; result: Json; created_at: string; completed_at: string | null;
  source_identity: string; adapter_sha256: string;
}
export interface SourceFile {path: string; kind: 'file' | 'directory' | 'symlink'; target?: string; bytes?: number; sha256?: string; mode: number}
export interface Inspection {
  schema: 'taskerarmy.installation-inspection.v1'; installation: JsonObject;
  configuration: TaskerConfiguration; configuration_sha256: string; application_files: SourceFile[];
  database: JsonObject; outbox: JsonObject;
}
export interface PrepareInput {
  application: string; configuration: string; manifest_path?: string; python?: string;
}
export interface ReceiveInput {archive_path: string; python?: string}
export interface CommandOptions {
  roles?: Role[]; ready_file?: string; operator_port?: number; ingress_port?: number;
  worker_interval?: number; operator_token_env?: string;
}
export interface NativeOperations {
  'installation.prepare': {arguments: PrepareInput & {directory: string; operation_id?: string}; result: JsonObject};
  'installation.inspect': {arguments: Record<string, never>; result: Inspection};
  'installation.adopt_source': {arguments: {application: string; manifest_path?: string; operation_id?: string}; result: JsonObject};
  'installation.snapshot': {arguments: {output: string; operation_id?: string}; result: JsonObject};
  'installation.receive': {arguments: ReceiveInput & {directory: string}; result: JsonObject};
  'configuration.read': {arguments: Record<string, never>; result: ConfigurationResult};
  'configuration.save': {arguments: {revision: string; configuration: TaskerConfiguration}; result: ConfigurationResult};
  'queue.status': {arguments: {tenant?: string; limit?: number}; result: JsonObject};
  'queue.list': {arguments: QueueFilters; result: QueuePage};
  'queue.get': {arguments: {delivery_id: Decimal}; result: JsonObject};
  'jobs.history': {arguments: {tenant: string; job: string; before_version?: Decimal; limit?: number}; result: JobHistory};
  'events.receive': {arguments: {tenant: string; event: TaskerEvent; ttl_seconds?: number}; result: {outcome: string; queued: number; original_outcome?: string}};
  'events.render': {arguments: {tenant: string; event: TaskerEvent}; result: JsonObject};
  'deliveries.resolve': {arguments: {delivery_id: Decimal; outcome: 'sent' | 'retry' | 'cancelled'; note: string}; result: {delivery_id: string; status: string}};
  'routes.resume': {arguments: {route_id: string}; result: {route_id: string; resumed: number}};
  'requests.get': {arguments: {request_id: string; installation_id?: string}; result: {request: NamedRequest | null}};
  'commands.describe': {arguments: CommandOptions; result: {commands: CommandDescription[]; installation: InstallationSummary}};
}
export interface ClientSelection {
  directory: string; sourceDirectory?: string; python?: string;
  binding?: Pick<InstallationSummary, 'installation_id' | 'source_identity'>;
  environment?: Record<string, string | undefined>;
}
export const TASKER_REQUEST_SCHEMA: 'taskerarmy.operation-request.v1';
export const TASKER_RESULT_SCHEMA: 'taskerarmy.operation-result.v1';
export const TASKER_SOURCE: string;
export const TASKER_MAX_REQUEST_BYTES: number;
export const TASKER_MAX_REPLY_BYTES: number;
export function taskerError(code: string, message: string): Error & {code: string};
export function plain(value: unknown): value is Record<string, unknown>;
export function exact(value: unknown, fields: string[], required?: string[]): void;
export function selectedPath(value: string, base?: string): string;
export function requestId(value: string): string;
export function readPrivateJSON(path: string, maximum?: number): Promise<{path: string; bytes: Uint8Array; value: unknown}>;
export function canonicalDirectory(path: string, options?: {missing?: boolean; privateOnly?: boolean}): Promise<string>;
export class TaskerInstallation {
  constructor(selection: ClientSelection);
  readonly selection: Omit<ClientSelection, 'environment'>;
  readonly activeCalls: number;
  call<K extends keyof NativeOperations>(operation: K, args?: NativeOperations[K]['arguments'], requestId?: string):
    Promise<NativeResult<NativeOperations[K]['result']>>;
  inspect(): Promise<NativeResult<Inspection>>;
  prepare(input: PrepareInput, requestId: string): Promise<NativeResult<JsonObject>>;
  /** Receives into this outer container; operate result.installation.paths.directory with a new client. */
  receive(input: ReceiveInput, requestId: string): Promise<NativeResult<JsonObject>>;
  snapshot(output: string, requestId: string): Promise<NativeResult<JsonObject>>;
  configuration(): Promise<NativeResult<ConfigurationResult>>;
  saveConfiguration(revision: string, configuration: TaskerConfiguration, requestId: string): Promise<NativeResult<ConfigurationResult>>;
  queue(filters?: QueueFilters): Promise<NativeResult<QueuePage>>;
  delivery(deliveryId: Decimal): Promise<NativeResult<JsonObject>>;
  history(tenant: string, job: string, filters?: {before_version?: Decimal; limit?: number}): Promise<NativeResult<JobHistory>>;
  receiveEvent(tenant: string, event: TaskerEvent, requestId: string, ttlSeconds?: number):
    Promise<NativeResult<NativeOperations['events.receive']['result']>>;
  request(requestId: string, installationId?: string): Promise<NativeResult<{request: NamedRequest | null}>>;
  close(): Promise<void>;
}
