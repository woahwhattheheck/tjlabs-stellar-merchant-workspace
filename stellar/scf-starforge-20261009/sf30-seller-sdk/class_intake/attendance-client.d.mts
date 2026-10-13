import { ClassIntakeClient } from "./client.mjs";
export type AttendanceState = "proposed"|"waitlist"|"booked"|"attended"|"missed"|"cancelled"|"rescheduled";
export interface IntakeAnchor {id:string;revision:number;derivedSha256:string}
export interface InstructorConfirmation {instructor:string;at:string;method:"email"|"phone"|"in-person"|"source-record";reference:string}
export interface Session {id:string;classId:string;start:string;end:string;timezone:string;capacity:number;instructor:string;state:"planned"|"scheduled"|"completed"|"cancelled";reason:string}
export interface Enrollment {registrationId:string;granted:number;reason:string}
export interface Visit {id:string;registrationId:string;sessionId:string;state:AttendanceState;confirmation:InstructorConfirmation|null;units:0|1;reason:string;replacementId?:string}
export interface CreditAdjustment {id:string;registrationId:string;units:number;actor:string;at:string;reason:string}
export interface AttendanceDefinition {name:string;intake:IntakeAnchor;note:string;sessions:Session[];enrollments:Enrollment[];visits:Visit[];adjustments:CreditAdjustment[]}
export interface AttendanceRequest {requestId:string;id?:string;expectedRevision?:number;actor:string;at:string;definition:AttendanceDefinition}
export interface VisitBalance {registrationId:string;studentKey:string;classId:string;granted:number;adjusted:number;used:number;reserved:number;remaining:number;available:number;registrationStatus:string;sourceConfirmation:string|null;feeMinor:string|null;paidMinor:string|null;balanceMinor:string|null;currency:string}
export interface AttendanceView {schema:string;id:string;revision:number;requestId:string;requestSha256:string;actor:string;at:string;definition:AttendanceDefinition;derivedSha256:string;derived:{sessions:(Session&{title:string;occupied:number;placesAvailable:number;waitlisted:number;attended:number;roster:unknown[]})[];balances:VisitBalance[];issues:{code:string;sessionId?:string;visitId?:string;detail:string}[];totals:{sessions:number;enrollments:number;visits:number;used:number;reserved:number;remaining:number}}}
export declare class AttendanceClient {
 constructor(intakeClient:ClassIntakeClient);
 state():Promise<{schema:string;workspaceId:string;reviews:AttendanceView[]}>;
 view(id:string,revision?:number):Promise<AttendanceView>;
 history(id:string):Promise<AttendanceView[]>;
 request(id:string):Promise<{state:"NOT_RECORDED"|"RECORDED";requestId:string;request?:AttendanceRequest;result?:Omit<AttendanceView,"derived">}>;
 save(request:AttendanceRequest):Promise<AttendanceView>;
 export(id:string,revision?:number):Promise<{filename:string;bytes:number;sha256:string;url:string}>;
 receive(file:Blob|Uint8Array|ArrayBuffer):Promise<{selected:AttendanceView;current:AttendanceView;packet:{bytes:number;sha256:string}}>;
}
