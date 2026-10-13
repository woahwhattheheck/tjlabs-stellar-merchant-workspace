// SPDX-License-Identifier: MIT
import type {CustomerProject,Period,Plan,SourceSetSummary} from './workspace.mjs';
export interface SourceInspection {
 record:Record<string,unknown>&{id:string;sha256:string;packetSha256:string;packetBytes:number;rawBase64:string};
 packet:Record<string,unknown>;scope:Record<string,unknown>;connection:Record<string,unknown>;
 files:Map<string,{path:string;encoding:'utf8';content:string;bytes:number;sha256:string;raw:Uint8Array}>;
 records:Map<string,Record<string,unknown>>;
 locations:Array<{id:string;sourceType:'indoor'|'outdoor';key:string;metadataPath:string;metadata:Record<string,unknown>}>;
 histories:Array<{locationKey:string;sourceType:'indoor'|'outdoor';locationId:string;path:string;window:Period;measure:string|null;measures:string[]}>;
 summary:SourceSetSummary;
}
export function inspectSourcePacket(input:Uint8Array):SourceInspection;
export function inspectSourceSet(value:Record<string,unknown>):SourceInspection;
export function sourceProject(source:SourceInspection,input:Partial<CustomerProject>&Pick<CustomerProject,'organisation'|'title'|'owner'>):CustomerProject;
export function retainedTasks(project:CustomerProject,window:Period,connection:Record<string,unknown>,source:SourceInspection):Plan['tasks'];
export function retainedCapture(plan:Plan,task:Plan['tasks'][number],connection:Record<string,unknown>,source:SourceInspection):{metadata:Record<string,unknown>;raw:Uint8Array};
export function verifyRetainedCapture(metadata:Record<string,unknown>,task:Plan['tasks'][number],plan:Plan):Record<string,unknown>;
