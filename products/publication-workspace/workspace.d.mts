import type {PublicationReply} from "./client.mjs";
export const PUBLICATION_WORKSPACE_CONNECTION_SCHEMA: "stellar-forge.publication-workspace-connection.v1";
export interface PublicationWorkspaceConfiguration {
  schema: typeof PUBLICATION_WORKSPACE_CONNECTION_SCHEMA;
  selectionSha256: string;
  workspaces: Record<string, {
    label: string; directory: string; sourceDirectory: string; python: string;
    sourceRoot?: string; sourceManifest?: string; workspaceArchive?: string; receiveArchive?: string;
    nativeFile?: string; transferDirectory?: string;
    binding?: {installation_id: string; source_identity: string};
  }>;
}
export function readPublicationWorkspaceConfiguration(path: string): Promise<PublicationWorkspaceConfiguration>;
export class MerchantPublicationWorkspaces {
  constructor(config: {publicationWorkspaces: PublicationWorkspaceConfiguration});
  readonly summary: {
    configured: boolean; ownership: string; workspaces: {workspace: string; label: string}[];
    activeCalls: number; closing: boolean;
  };
  call(name: string, args?: Record<string, unknown>): Promise<PublicationReply & {workspace: string}>;
  close(): Promise<void>;
}
