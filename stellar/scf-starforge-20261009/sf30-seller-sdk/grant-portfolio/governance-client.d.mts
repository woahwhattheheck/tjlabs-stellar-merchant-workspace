import type {JsonObject, PortfolioSelection, RequestOptions, ActionOptions, RetainedRequest, GrantPortfolioClient, ReviewReference} from './client.mjs';
import type {ProgrammeChangeSet} from './programme-client.mjs';
export type GovernanceCollection='committees'|'meetings'|'decisions'|'evaluations'|'findings'|'responses'|'followups';
export type GovernanceTable = `governance_${GovernanceCollection}`|'governance_follow_through';
export interface GovernanceMember {name:string;role:string;organization?:string;notes?:string}
export interface GovernanceCommon {
 nodeId:string;grantId?:string|null;title:string;owner:string;notes?:string;sourceRefs?:ReviewReference[];
 documentIds?:string[];supersedesId?:string|null;status:'draft'|'recorded';recordedDate?:string|null;
}
export interface GovernanceFields {
 committees: GovernanceCommon & {terms:string;members:GovernanceMember[];reviewFrequency?:string;nextReviewDate?:string|null};
 meetings: GovernanceCommon & {committeeId:string;kind:'annual'|'ordinary'|'closure'|'special';meetingDate:string;chair:string;attendees?:string[];agenda?:string;minutes?:string;nextReviewDate?:string|null};
 decisions: GovernanceCommon & {meetingId:string;topic:string;decision:string;rationale?:string;responsible:string;dueDate?:string|null;outcome:'agreed'|'deferred'|'noted'|'rejected';issueIds?:string[];milestoneIds?:string[]};
 evaluations: GovernanceCommon & {kind:'midterm'|'terminal'|'thematic'|'other';stage:'terms'|'report';periodStart?:string|null;periodEnd?:string|null;commissionedBy:string;evaluators?:string[];questions:string[];methodology:string;limitations?:string;summary?:string;issuedDate?:string|null};
 findings: GovernanceCommon & {evaluationId:string;question:string;finding:string;recommendation:string;priority?:string|null;recommendationOwner?:string|null;dueDate?:string|null};
 responses: GovernanceCommon & {findingId:string;respondent:string;outcome:'accepted'|'partially-accepted'|'rejected'|'deferred';response:string;actionPlan?:string;responsible?:string|null;dueDate?:string|null;issueIds?:string[];milestoneIds?:string[]};
 followups: GovernanceCommon & {decisionId?:string|null;responseId?:string|null;reviewer:string;reviewDate:string;outcome:'open'|'in-progress'|'complete'|'not-required'|'deferred';progress:string;verification?:string;issueIds?:string[];milestoneIds?:string[];nextReviewDate?:string|null};
}
export type GovernanceChange<C extends GovernanceCollection=GovernanceCollection>={collection:C;id:string;expectedRevision:number;fields:Partial<GovernanceFields[C]>};
export type GovernanceRecord<C extends GovernanceCollection=GovernanceCollection>=GovernanceFields[C]&{id:string;revision:number;sha256:string;createdAt:string;updatedAt:string;createdBy:string;updatedBy:string;archived:boolean;archiveReason:string;publication?:JsonObject};
export interface GovernanceChangeSet {schema:'stellar-forge.grant-governance.v1';actor:string;expectedGovernanceRevision:number;changes?:GovernanceChange[];archive?:{collection:GovernanceCollection;id:string;expectedRevision:number;reason:string}[]}
export interface GovernanceRecordSelection extends PortfolioSelection {collection:GovernanceCollection;id:string}
export interface GovernancePositionSelection extends PortfolioSelection {nodeId:string;grantId?:string|null}
export interface GovernanceRead extends PortfolioSelection {schema:'stellar-forge.grant-governance.v1';snapshot:string;governanceRevision:number;record?:GovernanceRecord;collection?:GovernanceCollection;history?:JsonObject[];position?:JsonObject;publication?:JsonObject|null;dependencies?:JsonObject[];following?:JsonObject[]}
export declare const GRANT_GOVERNANCE_SCHEMA:'stellar-forge.grant-governance.v1';
export declare const GRANT_GOVERNANCE_COLLECTIONS:readonly GovernanceCollection[];
export declare function governanceBatch(actor:string,expectedGovernanceRevision:number,changes?:GovernanceChange[],options?:{archive?:GovernanceChangeSet['archive']}):GovernanceChangeSet;
export declare function newGovernanceRecord<C extends GovernanceCollection>(collection:C,fields:GovernanceFields[C],id?:string):GovernanceChange<C>;
export declare function reviseGovernanceRecord<C extends GovernanceCollection>(collection:C,record:GovernanceRecord<C>,fields:Partial<GovernanceFields[C]>):GovernanceChange<C>;
export declare function followingGovernanceRecord<C extends GovernanceCollection>(collection:C,record:GovernanceRecord<C>,fields:GovernanceFields[C],id?:string):GovernanceChange<C>;
export declare function saveGrantGovernance(client:GrantPortfolioClient,operationId:string,selection:PortfolioSelection,governance:GovernanceChangeSet,options?:ActionOptions):Promise<RetainedRequest>;
export declare function saveProgrammeAndGovernance(client:GrantPortfolioClient,operationId:string,selection:PortfolioSelection,input:{programme:ProgrammeChangeSet;governance:GovernanceChangeSet},options?:ActionOptions):Promise<RetainedRequest>;
