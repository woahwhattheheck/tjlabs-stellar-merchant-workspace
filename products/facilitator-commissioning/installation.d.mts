// SPDX-License-Identifier: MIT
export type FileIdentity={bytes:number;sha256:string};
export type PreparationFile=FileIdentity&{path:string};
export interface InstallationPreparation{
  schema:'stellar-forge.facilitator-installation-preparation.v1';
  mode:'inputs'|'template'|'prepare';jobId:string;selectionSha256:string;transfer:FileIdentity;
  files:PreparationFile[];basis:Record<string,unknown>|null;
  selections:Array<{field:string;purpose:string}>;
  missingSources:PreparationFile[];directory:string;receipt:FileIdentity;continuation:string;
}
export function prepareCommissioningInstallationFiles(options:{
  mode:'inputs'|'template'|'prepare';transfer:string;expectedTransferSha256:string;out:string;
  seed?:string;caseSnapshot?:string;bindings?:string;
  profileFile?:string;expectedProfileSha256?:string;
}):Promise<InstallationPreparation>;
export function inspectCommissioningInstallation(directory:string):Promise<InstallationPreparation>;
