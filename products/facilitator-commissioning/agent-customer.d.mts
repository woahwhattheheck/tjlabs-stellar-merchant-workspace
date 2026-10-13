// SPDX-License-Identifier: MIT
import type {CommissioningConnection} from './agent-client.mjs';
export class CommissioningCustomerAgent{
 constructor(config:{facilitatorCommissioning:CommissioningConnection;exportsDirectory:string},options?:{fetch?:typeof globalThis.fetch});
 readonly summary:Record<string,unknown>;
 call(name:string,args?:Record<string,unknown>):Promise<any>;
 requestClose():void;
 close():Promise<void>;
}
