export declare const FISCAL_AGENT_BINDING_SCHEMA: 'stellar-forge.fiscaldata-agent-binding.v1';
export declare const FISCAL_AGENT_STARTUP_SCHEMA: 'stellar-forge.fiscaldata-agent-startup.v1';
export interface FiscalAgentSelection {
  connectionFile: string; workspace: string; exportsDirectory: string; sourceRoot?: string;
}
export interface FiscalAgentBinding {
  schema: typeof FISCAL_AGENT_BINDING_SCHEMA;
  connectionFile: string; connectionSha256: string;
  workspace: string; workspaceId: string; workspaceIdentity: string;
  directory: string; exportsDirectory: string;
  operator: {id: string; label: string}; sourceRoot: string; sourceSha256: string;
  sourceFiles: ReadonlyArray<{path: string; bytes: number; sha256: string}>;
  bindingSha256: string;
}
export interface FiscalAgentOptions extends FiscalAgentSelection {
  expectedBindingSha256: string; mcpPort?: number; browserPort?: number; browser?: boolean;
  tokenEnv?: string; environment?: Record<string,string|undefined>; signal?: AbortSignal;
}
export interface FiscalAgentStartup {
  schema: typeof FISCAL_AGENT_STARTUP_SCHEMA; status: 'FISCALDATA_AGENT_READY';
  bindingSha256: string; connectionFile: string; sourceRoot: string; sourceSha256: string;
  workspace: string; workspaceId: string; instanceId: string;
  operator: {id:string;label:string}; pid:number; mcpUrl:string; browserUrl:string|null;
}
export interface FiscalAgent {
  startup: FiscalAgentStartup; binding: FiscalAgentBinding;
  operator: {call(name:string,args:Record<string,unknown>):Promise<unknown>; close():Promise<void>};
  closed: Promise<{status:'CLOSED'}|{status:'CLOSE_FAILED';code:string}>;
  close():Promise<void>;
}
export declare function inspectFiscalAgentBinding(options:FiscalAgentSelection):Promise<FiscalAgentBinding>;
export declare function startFiscalAgent(options:FiscalAgentOptions):Promise<FiscalAgent>;
export declare const HELP:string;
export declare function main(argv?:string[]):Promise<unknown>;
