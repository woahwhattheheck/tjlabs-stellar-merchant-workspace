import type {ClientSelection, NativeResult} from './client.mjs';
export const TASKER_WORKSPACE_CONNECTION_SCHEMA: 'stellar-forge.tasker-workspace-connection.v1';
export interface TaskerWorkspaceSelection extends Omit<ClientSelection, 'environment'> {
  label?: string; application?: string; configurationFile?: string; manifestPath?: string;
  transferDirectory?: string; receiveArchive?: string;
}
export interface TaskerWorkspaceConfiguration {
  schema: typeof TASKER_WORKSPACE_CONNECTION_SCHEMA;
  selectionSha256: string;
  workspaces: Record<string, TaskerWorkspaceSelection>;
}
export function readTaskerWorkspaceConfiguration(path: string): Promise<TaskerWorkspaceConfiguration>;
export class MerchantTaskerWorkspaces {
  constructor(config: {taskerWorkspaces?: TaskerWorkspaceConfiguration});
  readonly summary: {configured: boolean; ownership: 'ORIGINAL_TASKER_INSTALLATION';
    workspaces: Array<{workspace: string; label: string}>; activeCalls: number; closing: boolean};
  call(name: string, arguments?: Record<string, unknown>): Promise<NativeResult & {workspace: string}>;
  close(): Promise<void>;
}
