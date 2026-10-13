export declare const FRED_ALFRED_USAGE: string;
export declare function runFredAlfredCommand(args: string[], options?: { signal?: AbortSignal; fetchImpl?: typeof globalThis.fetch }): Promise<unknown>;
export declare function main(args?: string[]): Promise<void>;
