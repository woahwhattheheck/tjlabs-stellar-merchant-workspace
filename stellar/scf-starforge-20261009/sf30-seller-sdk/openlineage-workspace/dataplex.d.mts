export interface ExpectedFqn { namespace: string; name: string; fullyQualifiedName: string; }
export interface GoogleTransport { accessToken?: () => Promise<string>; fetchImpl?: typeof fetch; timeoutMs?: number; }
export interface GooglePrepare { directory: string; sourceBytes: Uint8Array; project: string; location: string; quotaProject?: string; editionId: string; expectedFqns?: ExpectedFqn[]; title?: string; }
export interface GoogleApproval { planSha256: string; operator: string; eventIds?: string[] | null; }
export interface GooglePlanEvent {
  eventId: string; payloadSha256: string; payloadBytes: number; requestId: string;
  kind: string; eventType: string | null; eventTime: string | null; schemaURL: string | null;
  runId: string | null; job: { namespace: string; name: string } | null;
  sourcePositions: unknown[]; diagnostics: string[]; notes: string[];
  assets: Array<{ direction: "inputs" | "outputs"; namespace: string; name: string; fullyQualifiedName: string | null; mapping: string }>;
  expectedLinks: Array<{ source: string; target: string }>;
}
export interface GooglePlan {
  schema: "commons.openlineage.google-plan.v1"; operationId: string; planSha256: string;
  createdAt: string; title: string; sourcePackageSha256: string; workspaceId: string; revision: number;
  editionId: string; project: string; location: string; quotaProject: string; parent: string; events: GooglePlanEvent[];
}
export interface GoogleStatus { directory: string; plan: GooglePlan; journal: any; totals: { selected: number; eligible: number; approved: number; confirmed: number; received: number }; }
export declare const GOOGLE_FILES: readonly string[];
export declare function googleFqn(namespace: string, name: string): string | null;
export declare function googleAccessToken(options?: { gcloud?: string }): Promise<string>;
export declare function prepareGoogleDelivery(options: GooglePrepare): Promise<GoogleStatus>;
export declare class GoogleLineageDelivery {
  constructor(directory: string);
  directory: string;
  read(): Promise<any>;
  status(): Promise<GoogleStatus>;
  approve(options: GoogleApproval): Promise<any>;
  publish(options?: GoogleTransport): Promise<any>;
  reconcile(options?: GoogleTransport): Promise<any>;
  exportPackage(destination: string): Promise<{ path: string; bytes: number; sha256: string; operationId: string; workspaceId: string; applicationFiles: number }>;
  writeReport(destination: string): Promise<{ path: string; planSha256: string }>;
}
export declare function verifyGooglePackage(bytes: Uint8Array): any;
export declare function receiveGooglePackage(bytes: Uint8Array, directory: string): Promise<any>;
export declare function recoverGoogleWriter(directory: string, lockId: string): Promise<{ recovered: string }>;
export declare function googleReport(status: GoogleStatus): string;
