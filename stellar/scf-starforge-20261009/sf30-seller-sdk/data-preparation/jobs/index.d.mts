/** Whole commissioned pipeline configuration and original customer receiving. */
export * from './customer.mjs';
export interface PipelinePayment {
  scheme: string; network: string; asset: string; payTo: string; amount: string;
  maxTimeoutSeconds?: number; extra?: Record<string, unknown>;
}
export interface PipelineJobConfigurationOptions {
  publicOrigin: string; payment: PipelinePayment; application?: string;
  timeoutMs?: number; inputStorageBytes?: number;
}
export interface PipelineJobMerchantConfiguration {
  schema: 'stellar-forge.paid-jobs.v1'; application: string; publicOrigin: string;
  serviceName: string; environment: string[]; workerCount: number; maxPending: number;
  maxJobs: number; memoryLimitMb: number;
  inputFileStorage: { maxBytes: number; maxUploads: number };
  functions: Record<string, unknown>; intake: { enabled: true; functions: string[] };
}
export function pipelineJobConfiguration(options: PipelineJobConfigurationOptions): PipelineJobMerchantConfiguration;
export function writePipelineJobConfiguration(options: PipelineJobConfigurationOptions & {
  directory: string; python: string;
}): Promise<{ directory: string; configuration: string; runtime: string; application: string;
  environment: { SF30_PREPARATION_PYTHON: string }; functionId: 'executePipeline' }>;
export interface PipelineFileDescriptor { slot: string; bytes: number; sha256: string; [key: string]: unknown }
export interface PipelineJobContext {
  jobId: string; attemptId: string; signal: AbortSignal;
  files: {
    list(): PipelineFileDescriptor[]; metadata(slot: string): PipelineFileDescriptor;
    stream(slot: string): AsyncIterable<Uint8Array>;
  };
  processes: {
    directory(): Promise<string>;
    run(options: { command: string[]; cwd: string; maxStdoutBytes: number; maxStderrBytes: number }):
      Promise<{ exitCode: number | null; signal: string | null; stdout: Uint8Array; stderr: Uint8Array }>;
  };
}
export function executePipeline(input: { reportName: string; selectionSha256: string; $files?: unknown },
  context: PipelineJobContext): Promise<{ report: Uint8Array; project: Uint8Array; execution: Uint8Array; results?: Uint8Array }>;
