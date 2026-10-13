// SPDX-License-Identifier: MIT
import type {CustomerProject,Period,Plan} from './workspace.mjs';
export interface SourceConnection {schema:'stellar-forge.airgradient-connection.v1';id:string;sha256:string;kind:'map-public'|'dashboard';title:string;origin:string;sourceUrl:string;definition?:{sha256:string;rawBase64:string;version:string|null;title:string|null};binding?:Record<string,unknown>}
export const MAP_CONNECTION:SourceConnection;
export const DEFAULT_DASHBOARD_CONNECTION:SourceConnection;
export function decodeJson(bytes:Uint8Array):unknown;
export function inspectDashboardDefinition(raw:Uint8Array):Record<string,unknown>;
export function mapConnection(raw:Uint8Array,options?:{id?:string;title?:string}):SourceConnection;
export function dashboardConnection(raw:Uint8Array,binding:Record<string,unknown>):SourceConnection;
export function verifyConnection(connection:SourceConnection):SourceConnection;
export function acquisitionTasks(project:CustomerProject,period:Period,connection:SourceConnection):Plan['tasks'];
export function privateRequest(task:Plan['tasks'][number],connection:SourceConnection,environment?:Record<string,string|undefined>):string;
export function normalizeCapture(raw:Uint8Array,task:Plan['tasks'][number],connection:SourceConnection,period:Period):{metadata:unknown;series:Array<{locationId:string;locationKey:string;sourceType:'outdoor'|'indoor'|'dashboard';measure:string;unit:string;utc:string;value:number|null;originalValue:number|string|null;sourceDatapoints:number|null}>;excluded?:{before:number;atOrAfterEnd:number};returnedRows?:number};
