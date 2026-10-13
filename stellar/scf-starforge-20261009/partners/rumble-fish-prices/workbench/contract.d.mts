import type { Configuration, ConfigurationInput, HistorySettings, Plan, AssetIdentifier } from './runner.mjs';
export const PROVIDER_ORIGIN: 'https://prices-api.sorobanscan.rumblefish.dev';
export const PROVIDER_SOURCE: '5109d3937af8cb2211a4ef0cff4c417595be0718';
export const PROVIDER_LIMITS: Readonly<{ requestsPerSecond: 1; monthlyRequests: 100000; batchAssets: 100; catalogPage: 200; historyPoints: 5000 }>;
export class WorkbenchError extends Error { code: string; status: number; details?: unknown; constructor(code: string, message: string, status?: number, details?: unknown) }
export function normalizeConfiguration(value?: ConfigurationInput): Configuration;
export function parseAssetIdentifier(value: AssetIdentifier): { identifier: string; kind: 'native' | 'credit' | 'contract'; code: string; issuer: string; contract: string };
export function identifierFromCatalog(value: unknown): string | null;
export function validateBaseUrl(value: string): string;
export function parseTime(value: string | number, label?: string): number;
export function historyWindows(value: Partial<HistorySettings>, now?: number): { windows: Record<string, string>[]; granularity: string; start: string; end: string; base_currency: string; original: HistorySettings };
export function compilePlan(specification: import('./runner.mjs').PlanSpecification, configuration: ConfigurationInput, now?: number): Omit<Plan, 'schema' | 'id' | 'planId' | 'sha256'>;
export function providerDocument(): Promise<{ document: Record<string, unknown>; sha256: string; bytes: number }>;
export function validateProviderResponse(kind: string, value: unknown): Promise<{ valid: boolean; errors: string[]; contractSha256: string }>;
export function digest(bytes: string | Uint8Array): string;
export function clone<T>(value: T): T;
export function isObject(value: unknown): value is Record<string, unknown>;
