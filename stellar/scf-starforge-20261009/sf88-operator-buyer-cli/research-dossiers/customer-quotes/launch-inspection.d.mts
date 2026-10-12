/** MIT. Exact original quotation source selected for an Applications launch. */
import type {ResearchQuoteObject} from './client.mjs';
export interface ResearchQuotePricingOptions {
 label?:string;config:string;directory:string;snapshot?:string;history?:string;
 nativeOutbox?:string;sourcePackage?:string;releaseStore?:string;releaseRuntime?:ResearchQuoteObject;
}
export interface ResearchQuoteHostInput {
 schema:'sf88-research-customer-quotes-host/v1';casesDirectory?:string;
 pricing?:Record<string,ResearchQuotePricingOptions>;
}
export interface ResearchQuoteNativeConfiguration {
 schema:'sf88-research-customer-quotes-host/v1';file:string|null;sha256:string|null;
 casesDirectory:string;pricing:Record<string,ResearchQuotePricingOptions & {label:string}>;
}
export interface ResearchQuoteSourceFile {
 kind:'config'|'snapshot'|'history';path:string;bytes:number;sha256:string;
}
export interface ResearchQuoteDirectoryIdentity {path:string;device:string;inode:string}
export interface ResearchQuoteProfileBinding {
 profile:string;label:string;options:Omit<ResearchQuotePricingOptions,'label'>;
 directory:ResearchQuoteDirectoryIdentity;files:ResearchQuoteSourceFile[];
}
export interface ResearchQuoteLaunchBinding {
 schema:'sf88-research-customer-quote-launch/v1';directory:string;
 configurationFile:string|null;configurationSha256:string|null;casesDirectory:string;
 pricing:ResearchQuoteProfileBinding[];
}
export interface ResearchQuoteLocation {
 role:string;path:string;exists:boolean;missing:string[];anchor:ResearchQuoteDirectoryIdentity;
}
export interface ResearchApplicationReview {
 schema:'stellar-forge.application-review-content.v1';title:string;summary:string;
 sections:Array<{title:string;collapsed?:boolean;rows:Array<{
  label:string;value:string|number|boolean|null|Array<string|number|boolean|null>;
 }>}>;
}
export interface ResearchQuoteLaunchInspection {
 schema:'sf88-research-customer-quote-launch/v1';binding:ResearchQuoteLaunchBinding;
 bindingSha256:string;configuration:ResearchQuoteNativeConfiguration;
 locations:ResearchQuoteLocation[];review:ResearchApplicationReview;
}
export interface ResearchQuoteLaunchView {
 schema:'sf88-research-customer-quote-launch/v1';bindingSha256:string;directory:string;
 configurationFile:string|null;configurationSha256:string|null;casesDirectory:string;
 profiles:Array<{id:string;label:string;directory:string;files:ResearchQuoteSourceFile[]}>;
}
export const RESEARCH_QUOTE_LAUNCH_SCHEMA:'sf88-research-customer-quote-launch/v1';
/** Read-only selection. It opens no case store, pricing model or listener. */
export function inspectResearchQuoteLaunch(options:{
 directory:string;configurationFile?:string|null;
}):Promise<ResearchQuoteLaunchInspection>;
export function assertResearchQuoteLaunch<T extends ResearchQuoteLaunchInspection>(
 inspection:T,expectedBindingSha256:string
):T;
export function researchQuoteLaunchView(inspection:ResearchQuoteLaunchInspection|null|undefined):ResearchQuoteLaunchView|null;
