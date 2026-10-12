import type {DbtProjectClient,ResultBinding,Sha256} from './client.mjs';
export interface PostgresProjectOptions {project:string;python?:string;publisherDirectory:string;sourceFile?:string;targetDirectory?:string;create?:boolean;seller?:string|null;resource?:string|null}
export interface PostgresProjectBindingInput {id:string;edition:Sha256;uid:string;request_id:string;expectedQueryHash:Sha256}
export declare class DbtPostgresProject {
 client:DbtProjectClient;
 static open(options:PostgresProjectOptions):Promise<DbtPostgresProject>;
 call(action:'bind',input:PostgresProjectBindingInput):Promise<ResultBinding>;
 call(action:'status'|'source'|'plan.save'|'plan'|'run'|'extract'|'inspect'|'review'|'publish'|'recover'|'buyer.offer'|'buyer.prepare',input?:Record<string,unknown>):Promise<unknown>;
 close():Promise<void>;
}
