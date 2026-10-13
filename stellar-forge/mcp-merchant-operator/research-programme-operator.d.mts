/** MIT. Complete terminal/SDK access to the existing Research programme owner. */
import type {ResearchWorkspaceClient} from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/workspace-client.mjs';
import type {ResearchProgrammeJobInput,ResearchProgrammeJob,ResearchProgrammeInfo,
 ResearchProgrammeArchive,ResearchProgrammeUpload,ResearchProgrammePaging}
 from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-quotes/programme-client.mjs';
export declare const RESEARCH_PROGRAMME_OPERATOR_SCHEMA:'stellar-forge.research-programme-operator.v1';
export type ResearchProgrammeOperatorCommand='info'|'jobs'|'job'|'resume'|'state'|'step'|'submit'|
 'receiving'|'bundle'|'files'|'file_info'|'retain'|'retained'|'read'|'release'|'archive'|'upload'|
 'upload_source'|'transfer'|'transfer_status';
export declare const RESEARCH_PROGRAMME_OPERATOR_COMMANDS:readonly ResearchProgrammeOperatorCommand[];
export interface ResearchProgrammeOperatorWorkspace {
 id:string;connectionFile:string;workspaceId:string;
}
export interface ResearchProgrammeOperatorSource {
 id:string;kind:'programme-input'|'programme-archive';file:string;sha256:string;
}
export interface ResearchProgrammeOperatorConfiguration {
 schema:typeof RESEARCH_PROGRAMME_OPERATOR_SCHEMA;
 /** Original private local operation/export root; each declared alias has its own child. */
 directory:string;
 workspaces:ResearchProgrammeOperatorWorkspace[];
 sources:ResearchProgrammeOperatorSource[];
}
export interface ResearchProgrammeOperatorFile {
 kind:'JOB'|'BUNDLE'|'ARCHIVE';id:string;
 /** Exact native relative name for JOB/BUNDLE; absent for ARCHIVE. */
 name?:string;bytes:number;sha256:string;
}
export interface ResearchProgrammeOperatorExport {
 schema:typeof RESEARCH_PROGRAMME_OPERATOR_SCHEMA;workspaceId:string;exportId:string;
 selection:ResearchProgrammeOperatorFile;file:{path:string;bytes:number;sha256:string};reused:boolean;
}
export interface ResearchProgrammeOperatorArguments {
 info:Record<string,never>;
 jobs:ResearchProgrammePaging&{kind?:ResearchProgrammeJob['request']['kind']};
 job:{id:string};resume:{id:string};
 state:ResearchProgrammePaging&{programmeId:string};
 step:{programmeId:string;stepId:string};
 submit:{id:string;source:string;input?:never}|{id:string;input:ResearchProgrammeJobInput;source?:never};
 receiving:{id:string};
 bundle:{id:string;manifestSha256?:string};
 files:ResearchProgrammePaging&{id:string};
 file_info:{kind:'JOB'|'BUNDLE';id:string;name:string}|{kind:'ARCHIVE';id:string;name?:never};
 retain:ResearchProgrammeOperatorFile;
 retained:ResearchProgrammePaging;
 read:{exportId:string;readId?:string;offset?:number;limit?:number};
 release:{readId:string};
 archive:{id:string};
 upload:{id:string};
 upload_source:{operationId:string;uploadId:string;source:string;bytes:number;sha256:string};
 transfer:{operationId:string;archiveId:string;bytes:number;sha256:string;manifestSha256:string;
  destination:string;destinationWorkspaceId:string;uploadId:string};
 transfer_status:{operationId:string};
}
export declare function researchProgrammeOperatorConfiguration(value:unknown):ResearchProgrammeOperatorConfiguration;
export declare function readResearchProgrammeOperatorConfiguration(file:string):Promise<{
 configuration:ResearchProgrammeOperatorConfiguration;file:string;bytes:number;sha256:string;
}>;
/** Borrows original Research HTTP listeners; owns local descriptors and clients only. */
export declare class ResearchProgrammeOperator {
 constructor(configuration:ResearchProgrammeOperatorConfiguration,options?:{
  clientFactory?:(workspace:ResearchProgrammeOperatorWorkspace)=>ResearchWorkspaceClient;
 });
 static fromFile(file:string,options?:{
  clientFactory?:(workspace:ResearchProgrammeOperatorWorkspace)=>ResearchWorkspaceClient;
 }):Promise<ResearchProgrammeOperator>;
 configuration():ResearchProgrammeOperatorConfiguration;
 call(name:string,command:'info',args?:ResearchProgrammeOperatorArguments['info']):Promise<ResearchProgrammeInfo>;
 call(name:string,command:'job'|'resume'|'submit',
  args:ResearchProgrammeOperatorArguments['job'|'resume'|'submit']):Promise<ResearchProgrammeJob>;
 call(name:string,command:'archive',args:ResearchProgrammeOperatorArguments['archive']):Promise<ResearchProgrammeArchive>;
 call(name:string,command:'upload',args:ResearchProgrammeOperatorArguments['upload']):Promise<ResearchProgrammeUpload>;
 call<C extends ResearchProgrammeOperatorCommand>(name:string,command:C,
  args:ResearchProgrammeOperatorArguments[C]):Promise<Record<string,unknown>>;
 exportFile(name:string,selection:ResearchProgrammeOperatorFile,
  options:{file:string}):Promise<ResearchProgrammeOperatorExport>;
 /** Denies new work, drains accepted two-host operations and retries failed original close handles. */
 close():Promise<{state:'DETACHED';workspaces:string[]}>;
}
