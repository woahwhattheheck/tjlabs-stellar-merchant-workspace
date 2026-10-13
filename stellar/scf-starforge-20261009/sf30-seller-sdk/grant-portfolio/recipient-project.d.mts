export type ProgrammeStatus='planned'|'in-progress'|'submitted'|'complete'|'cancelled';
export interface RecipientProjectSelection {
  id:string; code:string; title:string; owner:string; description:string;
  startDate:string|null; endDate:string|null;
}
export interface RecipientMilestoneSelection {
  taskId:string; id:string; code:string; title:string; owner:string;
  dueDate:string; status:ProgrammeStatus; completedDate:string|null;
  progress:string; description:string;
}
export interface RecipientInput {
  operationId:string; bytes:Uint8Array; filename:string; actor:string;
  programmeId:string; partnerId:string; recipientConfirmed:true;
  project:RecipientProjectSelection; documentId:string;
  milestones:RecipientMilestoneSelection[];
}
export interface RecordedApplicationPlan {
  format:'engrant.application-plan.v1';
  source:{source_id:string;source_sha256:string};
  organisation:{lead_id:string;organisation:string;records:unknown[];[key:string]:unknown};
  brief:Record<string,string>; candidate:Record<string,string>;
  decision:{id:string;edition:number;reviewer:string;reviewed_on:string;decision:'Pursue';
    rationale:string;brief:Record<string,string>;candidate:Record<string,string>;criteria:unknown[]};
  plan:{id:string;edition:number;prepared_by:string;prepared_on:string;note:string;decision_id:string;
    plan:{title:string;objective:string;owner:string;currency:string;requested_amount:string;start:string;end:string;
      deadline:string;deadline_note:string;tasks:Array<{id:string;title:string;description:string;owner:string;due:string;
        status:'Planned'|'In progress'|'Waiting'|'Completed'|'Cancelled';effort_hours:string;source_url:string;
        evidence_url:string;completion_note:string;completed_on:string}>}};
}
export interface RecipientImportPlan {
  schema:'stellar-forge.engrant-project-import-plan.v1';
  portfolio:{id:string;revision:number;snapshot:string};
  source:{sha256:string;bytes:number;filename:string;contentType:'application/json'};
  binding:Record<string,unknown>;
  selection:Omit<RecipientInput,'bytes'>;
  retainedOnlyTasks:Array<{id:string;title:string;due:string;status:string}>;
  action:{operationId:string;action:'portfolio.save';payload:Record<string,unknown>};
  actionSha256:string;
}
export function parseEngrantApplicationPlan(bytes:Uint8Array):RecordedApplicationPlan;
export function prepareRecipientProject(portfolio:unknown,input:RecipientInput):RecipientImportPlan;
export function submitRecipientProject(client:import('./client.mjs').GrantPortfolioClient,
  plan:RecipientImportPlan,bytes:Uint8Array,options?:{signal?:AbortSignal}):Promise<unknown>;
