// SPDX-License-Identifier: MIT
import type {BlockrunUsageView} from './blockrun-projections.mjs';
export interface DeskCapture {sha256:string;raw:string;filename:string;evidence:'AUTHORED_EXAMPLE'|'OPERATOR_CAPTURE'}
export interface DeskReview {captureSha256:string;subject:string;reviewer:string;status:'UNREVIEWED'|'REVIEWED'|'FOLLOW_UP';note:string}
export type DeskEventValue={captureSha256:string}|DeskReview|{title:string};
export interface DeskEvent {sequence:number;previous:string|null;at:string;action:'capture.add'|'review.save'|'title.set';value:DeskEventValue;sha256:string}
export interface CaptureDesk {schema:'tjlabs.blockrun-capture-desk.v1';id:string;createdAt:string;title:string;captures:DeskCapture[];events:DeskEvent[]}
export interface CaptureDeskView {id:string;title:string;revision:number;head:string;record:DeskCapture;projection:BlockrunUsageView;reviews:Array<DeskReview&{at:string;sequence:number}>;history:DeskEvent[];captures:Array<Omit<DeskCapture,'raw'>&{bytes:number}>;source:{projectionGit:string;projectionSha256:string}}
export function canonicalDesk(value:unknown):string;
export function digestDeskText(value:string):string;
export function captureDeskLimits():{maxBytes:number;maxCaptures:number;maxEvents:number;source:{projectionGit:string;projectionSha256:string}};
export function validateCaptureDesk(input:unknown):CaptureDesk;
export function createCaptureDesk(input:{raw:string;id:string;filename?:string;evidence?:DeskCapture['evidence'];title?:string;at?:string}):CaptureDesk;
export function appendDeskCapture(input:CaptureDesk,options:{raw:string;filename?:string;evidence?:DeskCapture['evidence'];at?:string}):CaptureDesk;
export function saveDeskReview(input:CaptureDesk,options:DeskReview&{at?:string}):CaptureDesk;
export function renameCaptureDesk(input:CaptureDesk,options:{title:string;at?:string}):CaptureDesk;
export function describeCaptureDesk(input:CaptureDesk,selectedSha?:string):CaptureDeskView;
export function compareDeskCaptures(input:CaptureDesk,earlierSha:string,laterSha:string):{sameSelection:boolean;earlierSha:string;laterSha:string;added:string[];removed:string[];changed:string[]};
export function exportCaptureDesk(input:CaptureDesk):string;
export function receiveCaptureDesk(raw:string):CaptureDesk;
export function deskRowsCsv(input:CaptureDesk,selectedSha?:string):string;
