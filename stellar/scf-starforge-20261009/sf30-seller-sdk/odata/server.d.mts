import type { Server } from 'node:http';
import type { ODataWorkspace } from './workspace.mjs';
import type { ODataLiveRuntime, ODataLiveOperations } from './live-operations.mjs';
/** Exact private configuration loaded by the running subscription operator. */
export interface ODataSubscriptionConnectionIdentity {
  schema: 'stellar-forge.odata-subscription-connection.v1';
  path: string; bytes: number; sha256: string;
}
export interface ODataOperatorServer {
  url: string; server: Server; liveRuntime: ODataLiveRuntime | null;
  readonly subscriptionIdentity: ODataSubscriptionConnectionIdentity | null;
  /** Stops the listener; closes owned live operations and, by default, the workspace. */
  close(): Promise<void>;
}
export declare function startODataServer(options: {
  workspace: ODataWorkspace;
  /** Original operator port, default 8797; use 0 to select an available local port. */
  port?: number;
  /** Reopen an already prepared service in this retained workspace. */
  liveServiceId?: string;
  /** Borrow an already open original live-operations object; its caller keeps ownership. */
  liveOperations?: ODataLiveOperations;
  /** Default true. Set false when the caller owns the original workspace. */
  closeWorkspace?: boolean;
  /** Attach the original configured collection subscriptions at /subscriptions/. */
  subscriptionConnection?: string;
  /** Optional reviewed raw-file SHA256; requires subscriptionConnection. */
  expectedSubscriptionsSha256?: string;
}): Promise<ODataOperatorServer>;
