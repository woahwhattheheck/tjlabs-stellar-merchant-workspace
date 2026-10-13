/// <reference types="node" />
export const PUBLICATION_REQUEST_SCHEMA: "stellar-forge.publication-operation-request.v1";
export const PUBLICATION_RESULT_SCHEMA: "stellar-forge.publication-operation-result.v1";
export const PUBLICATION_SOURCE: string;
export const PUBLICATION_MAX_REQUEST_BYTES: number;
export const PUBLICATION_MAX_REPLY_BYTES: number;
export type Json = null | boolean | number | string | Json[] | {[key: string]: Json};
export interface SourceBinding { installation_id: string; source_identity: string; }
export interface SourceFile { path: string; bytes: number; sha256: string; }
export interface NativeRuntimeSelection { node: string; playground_module: string; wordpress_zip: string; }
export interface InstallationSelection {
  directory: string;
  sourceDirectory?: string;
  python?: string;
  binding?: SourceBinding;
  environment?: NodeJS.ProcessEnv;
}
export interface PublicationSourceManifest {
  schema: "stellar-forge.publication-product-source.v1";
  title: string;
  origin: string;
  interface: {
    entry: string; model: string; store_class: string; delivery: string; native_runner: string;
    import_names: string[]; operator_package_schema: string; workspace_archive: string; native_tools_archive: string;
  };
  files: SourceFile[];
  provenance?: Json;
}
export interface InstallationSummary {
  installation_id: string;
  operation_id: string;
  source_identity: string;
  product_source_identity: string;
  title: string;
  origin: string;
  python: {path: string; version: number[]; lxml_version: string};
  paths: {directory: string; source: string; application: string; workspace: string; database: string; bridge: string; native: string};
  binding: {directory: string; device: string; inode: string};
  native_configured: boolean;
  received_from: null | {
    installation_id: string; operation_id: string; snapshot: string; archive_sha256: string;
    source_identity: string; prior: Json;
  };
}
export interface PublicationReply<T = Json> {
  schema: "stellar-forge.publication-operation-result.v1";
  ok: true;
  operation: string;
  request_id?: string | null;
  installation: InstallationSummary | null;
  result: T;
  replayed: boolean;
  adapter_sha256: string;
}
export interface SourceSelection { source_root: string; source_manifest: string; }
export interface PrepareSelection extends SourceSelection {
  python?: string; workspace_archive?: string; actor?: string; native?: NativeRuntimeSelection;
}
export interface ReceiveSelection {
  archive_path: string; python?: string; actor?: string;
  native_runtime?: {node?: string; playground_module?: string};
}
export type ServiceRole = "operator" | "resident" | "wordpress";
export interface CommandSelection { roles?: ServiceRole[]; ready_file: string; port?: number; release_id?: string; }
export interface NativeCommand {
  role: ServiceRole; executable: string; argv: string[]; cwd: string; script: string; script_sha256: string;
  ready_file: string; health: {kind: string; schema: string};
  environment_references: {name: string; present: boolean}[];
}
export type ExportKind = "workspace" | "operator" | "native-tools" | "procurement";
export class PublicationInstallation {
  constructor(selection: InstallationSelection);
  readonly selection: Omit<InstallationSelection, "environment">;
  readonly activeCalls: number;
  call<T = Json>(operation: string, args?: object, requestId?: string): Promise<PublicationReply<T>>;
  inspect(): Promise<PublicationReply>;
  source(input: SourceSelection): Promise<PublicationReply>;
  prepare(input: PrepareSelection, requestId: string): Promise<PublicationReply>;
  receive(input: ReceiveSelection, requestId: string): Promise<PublicationReply>;
  snapshot(output: string, requestId: string): Promise<PublicationReply>;
  adoptSource(input: SourceSelection, requestId: string): Promise<PublicationReply>;
  state(): Promise<PublicationReply>;
  record(id: string): Promise<PublicationReply>;
  history(id: string): Promise<PublicationReply>;
  procurement(): Promise<PublicationReply>;
  export(kind: ExportKind, output: string, actor: string, requestId: string): Promise<PublicationReply>;
  request(requestId: string, originInstallationId?: string): Promise<PublicationReply>;
  close(): Promise<void>;
}
export function publicationError(code: string, message: string): Error & {code: string};
export function plain(value: unknown): value is Record<string, unknown>;
export function exact(value: unknown, fields: string[], required?: string[]): void;
export function selectedPath(value: string, base?: string): string;
export function requestId(value: string): string;
export function readPrivateJSON(path: string, maximum?: number): Promise<{path: string; bytes: Buffer; value: any}>;
export function canonicalDirectory(path: string, options?: {missing?: boolean; privateOnly?: boolean}): Promise<string>;
