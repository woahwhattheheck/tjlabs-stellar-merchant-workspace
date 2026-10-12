export interface FredReleaseCliStream { write(value: string): unknown }
export declare function runFredReleaseAcquisitionCli(argv?: string[], options?: {
  stdout?: FredReleaseCliStream; stderr?: FredReleaseCliStream; environment?: Record<string, string | undefined>;
  signal?: AbortSignal; fetchImpl?: typeof fetch;
}): Promise<unknown>;
