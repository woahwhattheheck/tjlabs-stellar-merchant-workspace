import type { JobPackageIdentity, JobPackageJob, JobOutputReceiving } from '../../jobs/outputs/index.mjs';

export interface PipelineJobFile { bytes: number; sha256: string }
export interface PipelineJobSelection {
  project: string;
  sha256: string;
  directory: string;
  pipelineId: string;
  revision: number;
  reportName: string;
  inputs?: Record<string, string>;
  reuseExecution?: string;
  /** Absolute Python executable. Defaults to SF30_PREPARATION_PYTHON. */
  python?: string;
  signal?: AbortSignal;
}
export interface PreparedPipelineJob {
  schema: 'stellar-forge.preparation-pipeline-job-prepared.v1';
  intent: {
    schema: 'stellar-forge.preparation-pipeline-job-prepared.v1';
    project: PipelineJobFile;
    pipelineId: string;
    revision: number;
    reportName: string;
    inputs: Record<string, string> | null;
    reuseExecution: string | null;
  };
  functionId: 'executePipeline';
  input: { reportName: string; selectionSha256: string };
  files: Record<'project.zip' | 'selection.json' | 'input.json' | 'review.html', PipelineJobFile>;
  attachmentSlots: { project: 'project.zip'; selection: 'selection.json' };
  pipeline: { id: string; revision: number; sha256: string };
  sources: Record<string, { id: string; label: string; rows: number }>;
  outputs: string[];
}
export interface PipelineJobReceivingOptions {
  /** Complete original downloaded job output ZIP. */
  source: string;
  expected: JobPackageIdentity;
  job?: Partial<JobPackageJob>;
  /** Private directory for the complete immutable original package and named files. */
  packageDirectory: string;
  /** Separate private independently editable pipeline workspace. */
  directory: string;
  python?: string;
  signal?: AbortSignal;
}
export interface PipelineJobReopenOptions {
  packageDirectory: string;
  directory: string;
  expected?: JobPackageIdentity;
  job?: Partial<JobPackageJob>;
  python?: string;
  signal?: AbortSignal;
}
export interface ReceivedPipelineWorkspace {
  schema: 'stellar-forge.preparation-pipeline-job-received.v1';
  directory: string;
  package: JobPackageIdentity;
  manifestSha256: string;
  job: JobPackageJob;
  pipeline: { id: string; revision: number; sha256: string };
  executionId: string;
  status: 'COMPLETE' | 'REVIEW_REQUIRED';
  files: JobOutputReceiving['files'];
  reused: boolean;
}
export interface ReceivedPipelineJob {
  package: JobOutputReceiving;
  workspace: ReceivedPipelineWorkspace;
}

/** Receive and inspect the complete selected project without executing SQL or purchasing a job. */
export function preparePipelineJob(options: PipelineJobSelection): Promise<PreparedPipelineJob>;
/** Receive the exact original named result package and its independently editable project. */
export function receivePipelineJob(options: PipelineJobReceivingOptions): Promise<ReceivedPipelineJob>;
/** Verify the complete original package and reopen the editable workspace, retaining later edits. */
export function reopenPipelineJob(options: PipelineJobReopenOptions): Promise<ReceivedPipelineJob>;
