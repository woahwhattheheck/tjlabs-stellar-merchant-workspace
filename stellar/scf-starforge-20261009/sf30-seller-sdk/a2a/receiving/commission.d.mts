export interface CommissionOptions {
  directory:string;agentUrl:string;token:string;procedureId?:string;sourceRoot:string;
  onProgress?:(event:Record<string,unknown>)=>void|Promise<void>;
  playwright?:string;chromium?:string;expectedRows?:number;
}
export const COMMISSION_SCHEMA:string;
export const COMMISSION_ID:string;
export function commissionA2AMerchant(options:CommissionOptions):Promise<Record<string,unknown>>;
