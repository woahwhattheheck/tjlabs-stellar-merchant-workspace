import type { Inbox } from '../index.mjs';
import type { VerifiedFile } from '../index.mjs';
import type { InboxTask, ReceivedInboxTask } from './inbox-task.mjs';

export const AGENTLEDGER_PUBLIC_LEDGER: string;
export const AGENTLEDGER_CHAIN_FIELDS: readonly string[];
export interface LedgerEntry {
  seq: number;
  ts: string;
  agentId: string;
  tenantId?: string | null;
  kind?: string;
  resource: string;
  method: string;
  amount?: number | string | null;
  quoted?: number | string | null;
  asset?: string | null;
  network?: string | null;
  payTo?: string | null;
  verdict: string;
  rule: string;
  reason?: string;
  txHash?: string | null;
  settles?: number;
  hash: string;
  prevHash: string;
  [key: string]: unknown;
}
export interface LedgerWindow {
  entries: number;
  firstSequence: number | null;
  lastSequence: number | null;
  previousHash: string | null;
  lastHash: string | null;
  sequenceGaps: Array<{after: number; before: number}>;
  chainFields: string[];
}
export interface LedgerSource {
  url: string;
  method: 'HTTPS_GET' | 'IMPORTED_BYTES';
  observedAt: string;
  requestStartedAt?: string;
  httpStatus?: number;
  responseHeaders?: Record<string, string>;
}
export interface LedgerSnapshotManifest {
  schema: 'stellar-forge.agentledger-snapshot.v1';
  source: LedgerSource;
  capture: { bytes: number; sha256: string };
  window: LedgerWindow;
}
export interface LedgerInspection {
  body: { entries: LedgerEntry[]; [key: string]: unknown };
  entries: readonly LedgerEntry[];
  capture: { bytes: number; sha256: string };
  window: LedgerWindow;
}
export function agentLedgerAtomicAmount(value: number | string, decimals: number): string;
export function inspectAgentLedgerBytes(raw: Uint8Array): LedgerInspection;
export class AgentLedgerSnapshot {
  readonly directory: string;
  readonly manifest: LedgerSnapshotManifest;
  readonly inspection: LedgerInspection;
  readonly sha256: string;
  readonly entries: readonly LedgerEntry[];
  readonly window: LedgerWindow;
  entry(sequence: number): LedgerEntry;
  settlements(decision: LedgerEntry): LedgerEntry[];
  toJSON(): Record<string, unknown>;
}
export function captureAgentLedgerSnapshot(options: {
  directory: string; source?: string; headers?: HeadersInit; signal?: AbortSignal;
}): Promise<AgentLedgerSnapshot>;
export function importAgentLedgerSnapshot(options: {
  directory: string; inputFile: string; source?: string; observedAt?: string; signal?: AbortSignal;
}): Promise<AgentLedgerSnapshot>;
export function openAgentLedgerSnapshot(options: {
  directory: string; expectedSha256?: string;
}): Promise<AgentLedgerSnapshot>;
export interface LedgerComparison {
  previousSha256: string;
  nextSha256: string;
  sameBytes: boolean;
  previousWindow: LedgerWindow;
  nextWindow: LedgerWindow;
  overlap: number;
  chainChanges: number[];
  annotationChanges: number[];
  extendsDirectly: boolean;
  newSequences: number[];
  outsideNextWindow: number[];
}
export function compareAgentLedgerSnapshots(previous: AgentLedgerSnapshot, next: AgentLedgerSnapshot): LedgerComparison;
export interface AgentLedgerIdentity { id: string; tenantId?: string | null }
export interface AgentLedgerSelection {
  intentId: string;
  decisionSequence: number;
  decisionHash: string;
  serviceOrigin: string;
  assetDecimals: number;
  role: string;
  sourceEdition?: string | null;
  facilitator?: string | null;
}
export interface AgentLedgerCaller {
  system: 'agentledger';
  id: string;
  revision: string;
  title: string;
  purpose: string;
  service: string;
}
export interface AgentLedgerTaskInput {
  inbox: Inbox;
  snapshot: AgentLedgerSnapshot;
  agent: AgentLedgerIdentity;
  task: AgentLedgerCaller;
  selections: AgentLedgerSelection[];
  predecessor?: { taskSha256: string; system: string; id: string; revision: string } | null;
  signal?: AbortSignal;
}
export interface AgentLedgerTaskPreview {
  previewSha256: string;
  manifest: Record<string, unknown>;
  original: { previewSha256: string; manifest: Record<string, unknown>; process: unknown };
}
export function previewAgentLedgerTask(options: AgentLedgerTaskInput): Promise<AgentLedgerTaskPreview>;
export function createAgentLedgerTask(options: AgentLedgerTaskInput & {
  directory: string; expectedPreviewSha256: string;
}): Promise<AgentLedgerTask>;
export function openAgentLedgerTask(options: {
  inbox: Inbox; directory: string; expectedSha256?: string;
}): Promise<AgentLedgerTask>;
export class AgentLedgerTask {
  readonly directory: string;
  readonly snapshot: AgentLedgerSnapshot;
  readonly originalTask: InboxTask;
  readonly record: { schema: string; createdAt: string; sha256: string; manifest: Record<string, unknown> };
  readonly sha256: string;
  inspect(options?: { signal?: AbortSignal }): Promise<Record<string, unknown>>;
  receive(options: { directory: string; signal?: AbortSignal }): Promise<AgentLedgerDelivery>;
  toJSON(): Record<string, unknown>;
}
export function compareAgentLedgerTasks(previous: AgentLedgerTask, next: AgentLedgerTask): {
  previous: string; next: string; ledger: LedgerComparison; task: unknown;
  decisions: Array<{ role: string; previousSequence: number | null; nextSequence: number;
    decisionChanged: boolean; settlementHistoryChanged: boolean }>;
};
export function openAgentLedgerDelivery(options: {
  directory: string; expectedTaskSha256?: string; signal?: AbortSignal;
}): Promise<AgentLedgerDelivery>;
export class AgentLedgerDelivery {
  readonly directory: string;
  readonly snapshot: AgentLedgerSnapshot;
  readonly record: Record<string, unknown>;
  readonly manifest: Record<string, unknown>;
  readonly received: ReceivedInboxTask;
  response(intentId: string): VerifiedFile;
  toJSON(): Record<string, unknown>;
}
