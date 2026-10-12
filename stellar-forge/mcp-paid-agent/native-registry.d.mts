// SPDX-License-Identifier: MIT
import type { NativeRecord } from './discovery-client.mjs';

export interface NativeRegistryWorkspace {
  /** Lowercase letters, digits and hyphens; 1–64 characters. */
  id: string;
  label: string;
  /** Existing canonical absolute private native workspace directory. */
  directory: string;
}
export interface NativeRegistryInput {
  schema?: 'stellar-forge.mcp-native-registry-input.v1';
  defaultWorkspaceId: string;
  workspaces: NativeRegistryWorkspace[];
}
export interface NativeRegistryManifest {
  schema: 'stellar-forge.mcp-native-registry.v1';
  directory: string;
  createdAt: string;
  defaultWorkspaceId: string;
  catalogUrl: string;
  workspaces: Array<NativeRegistryWorkspace & {nativeSha256:string}>;
}
export interface NativeRegistryCreated {
  schema: 'stellar-forge.mcp-native-registry.v1';
  status: 'NATIVE_MCP_REGISTRY_CREATED';
  directory: string;
  defaultWorkspaceId: string;
  workspaces: Array<{workspaceId:string;workspaceLabel:string}>;
  environment: {
    MCP_OPERATOR_MODULE:string;
    MCP_STATE_DIR:string;
    BAZAAR_DISCOVERY_URL:string;
    PAID_RESOURCE_ORIGINS:string;
  };
  tool:'sf43_discover_review_and_pay';
}
export interface NativeRegistryHost {
  manifest: NativeRegistryManifest;
  environment: {
    MCP_STATE_DIR:string;
    BAZAAR_DISCOVERY_URL:string;
    PAID_RESOURCE_ORIGINS:string;
  };
  call(request: NativeRecord, context?: NativeRecord & {signal?:AbortSignal}): Promise<NativeRecord>;
  /** Drain original native work, then release the existing OS directory locks. */
  close(): Promise<void>;
}
export declare function initializeNativeRegistry(
  input: NativeRegistryInput & {directory:string},
): Promise<NativeRegistryCreated>;
export declare function inspectNativeRegistry(directory:string):
  Promise<{manifest:NativeRegistryManifest;sha256:string}>;
export declare function openNativeRegistry(directory:string): Promise<NativeRegistryHost>;
