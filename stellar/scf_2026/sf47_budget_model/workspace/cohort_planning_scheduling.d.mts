import type {CohortPlan, CohortPlanDocument, CohortPlanReport, PlanningDeliveryScheduling,
  DateText, TimestampText, DecimalText} from './cohort_planning.mjs';

export declare const COHORT_DELIVERY_SCHEDULE_SCHEMA: "stellar-forge.sf47-delivery-schedule-report.v1";
export interface DeliverySchedulingIssue {
  code: string;
  message: string;
  [key: string]: unknown;
}
export interface DeliveryScheduleAssignment {
  occurrenceId: string;
  scheduleId: string;
  label: string;
  sourceDate: DateText;
  originalDate: DateText;
  date: DateText;
  scheduledAt: TimestampText;
  plannedCompleteAt: TimestampText;
  scheduledTasks: number;
  scheduledRequests: number;
  requiredHours: DecimalText | null;
  capacityPoolId: string | null;
  fundingGroupIds: string[];
  priority: number;
  status: "PLACED" | "FIXED" | "UNRESOLVED";
  fixedReason: "NO_ACTIVE_WORK" | "PAST_CUTOFF" | "FIXED_DATE" | "EFFORT_REQUIRED" | "DELIVERY_POOL_REQUIRED" | null;
  moved: boolean;
  permittedDates: DateText[];
  rejectedDates: {date: DateText; reasons: DeliverySchedulingIssue[]}[];
  issues: DeliverySchedulingIssue[];
}
export interface CohortDeliverySchedule {
  schema: typeof COHORT_DELIVERY_SCHEDULE_SCHEMA;
  sourceDocument: CohortPlanDocument;
  constraints: PlanningDeliveryScheduling;
  candidate: CohortPlan;
  report: CohortPlanReport;
  method: string;
  summary: {
    status: "COMPLETE" | "UNRESOLVED";
    occurrences: number;
    moved: number;
    fixed: number;
    unresolved: number;
    capacityBefore: CohortPlanReport["capacity"]["status"];
    capacityAfter: CohortPlanReport["capacity"]["status"];
    scheduledTasks: number;
    scheduledRequests: number;
    plannedPaymentRequests: number;
    fundingGroups: number;
  };
  assignments: DeliveryScheduleAssignment[];
}
/** Defaults to fixed service dates; retains any existing complete policy. */
export declare function seedCohortDeliveryScheduling(document: CohortPlanDocument | unknown): PlanningDeliveryScheduling;
/** Pure operation. The original case and purchase records remain in sourceDocument. */
export declare function scheduleCohortDelivery(document: CohortPlanDocument | unknown,
  constraints?: PlanningDeliveryScheduling | unknown, options?: {name?: string}): CohortDeliverySchedule;
/** Recalculates the complete retained source and decisions before accepting the result. */
export declare function reopenCohortDeliverySchedule(document: unknown): CohortDeliverySchedule;
export declare function exportCohortDeliveryScheduleCsv(document: CohortDeliverySchedule | unknown): string;
