export interface DatasetStudiesAgentSelection {
 configPath: string;workspace: string;
}
export interface DatasetStudiesAgentBinding {
 schema: 'stellar-forge.dataset-studies-agent-binding.v1';configFile: string;workspace: string;bindingSha256: string;
 declaration: {label: string;datasetPath: string|null;stateDirectory: string|null;resource: string|null;
  catalogDirectory: string|null;studiesDirectory: string;imports: Record<string,string>};
 configurationFiles: Array<{kind: string;path: string;bytes: number;sha256: string}>;
}
export function initializeDatasetStudiesMerchant(options: {directory: string;connection: string;name?: string}): Promise<{
 schema: string;configuration: string;state: 'INITIALIZED';datasetStudiesConfigured: true;
 workspaces: Array<{workspace: string;label: string}>;authoring: 'OPENED_BY_MERCHANT_DATASET_STUDY_OPEN';
}>;
export function inspectDatasetStudiesAgentBinding(options: DatasetStudiesAgentSelection): Promise<DatasetStudiesAgentBinding>;
export function startDatasetStudiesAgentWorkspace(options: DatasetStudiesAgentSelection&{
 port?: number;mcpPort?: number;tokenEnv?: string;environment?: Record<string,string|undefined>;expectedBindingSha256?: string;
}): Promise<{
 startup: {schema: 'stellar-forge.dataset-studies-agent-startup.v1';status: 'DATASET_STUDIES_AGENT_READY';
  configFile: string;bindingSha256: string;workspace: string;workspaceId: string;instanceId: string;source: Record<string,unknown>;
  declaration: DatasetStudiesAgentBinding['declaration'];operatorUrl: string;mcpUrl: string};
 operator: {call(name: string,args: Record<string,unknown>): Promise<any>};server: import('node:http').Server;url: string;close(): Promise<void>;
}>;
export function main(argv?: string[]): Promise<unknown>;
