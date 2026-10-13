import type {Artifact,FamilyTuitionClient,OriginalSource,View as FamilyView} from "./client.mjs";
export interface NamedDecision {reviewer:string;note:string;at:string}
export interface FamilyAnchor {id:string;revision:number;derivedSha256:string}
export interface Semester {id:string;label:string;start:string;end:string}
export interface Policy extends NamedDecision {id:string;editionId:"registration-form-page3"|"terms-pages1-2";source:string;semesters:Semester[]}
export interface Absence extends NamedDecision {id:string;policyId:string;enrollmentId:string;date:string;slotId:string;noticeAt:string;noticeRef:string;reason:"illness"|"emergency"|"other";exception:null|(NamedDecision&{reference:string})}
export interface MembershipEvent extends NamedDecision {id:string;enrollmentId:string;date:string;kind:"pause"|"resume"|"withdraw";reference:string}
export interface Target {date:string;slotId:string;capacity:number|null;capacityRef:string;instructor:string;confirmation:NamedDecision&{status:"pending"|"confirmed";reference:string}}
export interface BookingEvent extends NamedDecision {id:string;absenceId:string;kind:"waitlist"|"book"|"reschedule"|"cancel"|"attended"|"missed"|"void";target:Target|null}
export interface MakeupDefinition {name:string;notes:string;family:FamilyAnchor;asOf:string;policies:Policy[];absences:Absence[];membershipEvents:MembershipEvent[];bookingEvents:BookingEvent[];review:NamedDecision&{status:"draft"|"reviewed"}}
export interface MakeupSaveRequest {requestId:string;id?:string;expectedRevision?:number;actor:string;at:string;definition:MakeupDefinition}
export interface MakeupDerived {schema:string;family:unknown;policyCatalog:unknown;absences:Array<Record<string,unknown>>;bookings:Array<Record<string,unknown>>;sessions:Array<Record<string,unknown>>;issues:Array<Record<string,unknown>>;events:Array<Record<string,unknown>>;counts:Record<string,number>;annualCounts:unknown;providerWrites:0}
export interface MakeupView {schema:string;id:string;revision:number;requestId:string;requestSha256:string;actor:string;at:string;definition:MakeupDefinition;sources:OriginalSource[];familyHead:FamilyAnchor;derivedSha256:string;derived:MakeupDerived}
export interface MakeupState {schema:string;workspaceId:string;sources?:OriginalSource[];reviews:MakeupView[];policyCatalog?:unknown;accountingInterpretation?:string;familyReviews?:FamilyView[];contract?:Record<string,unknown>}
export declare class MakeupClient {
 constructor(url:string,options?:{fetch?:typeof fetch});family:FamilyTuitionClient;
 state():Promise<MakeupState>;view(id:string,revision?:number):Promise<MakeupView>;history(id:string):Promise<MakeupView[]>;
 originalRequest(id:string):Promise<{state:"NOT_RECORDED"|"RECORDED";workspaceId:string;requestId:string;sha256?:string;request?:MakeupSaveRequest;result?:Omit<MakeupView,"derived">}>;
 preview(definition:MakeupDefinition):Promise<MakeupDerived>;save(request:MakeupSaveRequest):Promise<MakeupView>;
 compare(id:string,before:number,after:number):Promise<Record<string,unknown>>;
 export(id:string,revision?:number):Promise<Artifact>;receive(bytes:Uint8Array):Promise<{selected:MakeupView;history:MakeupView[];packet:{bytes:number;sha256:string}}>;download(file:Artifact):Promise<Uint8Array>;
}
