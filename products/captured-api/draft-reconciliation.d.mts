// MIT. Complete native captured-draft reconciliation and portable working edits.

export const CAPTURED_DRAFT_MERGE_SCHEMA: 'stellar-forge.captured-draft-merge.v1';
export const CAPTURED_WORKING_EDIT_SCHEMA: 'stellar-forge.captured-working-edit.v1';

export type CapturedDraftKind = 'OUTGOING' | 'RECEIVING';
export type CapturedDraftChoice = 'CURRENT' | 'WORKING';
export type CapturedDraftSide = CapturedDraftChoice | 'BOTH';
export type CapturedDraftJsonValue =
  | null
  | boolean
  | number
  | string
  | CapturedDraftJsonValue[]
  | { [key: string]: CapturedDraftJsonValue };

/**
 * The native draft store retains incomplete JSON selection fields. Compilation
 * subsequently requires the actual saved merchant name and exact optional SHA.
 * Reconciliation never invents a key for an incomplete or repeated member.
 */
export type CapturedDraftPackage =
  | string
  | {
      name: CapturedDraftJsonValue;
      manifestSha256?: CapturedDraftJsonValue;
    };

/**
 * Complete native row. Usable keyed reconciliation requires kind capture/refresh
 * and the original 64-character source id. Multiple revisions of one source
 * remain complete separate rows and therefore require whole-list reconciliation.
 */
export interface CapturedDraftSource {
  kind: CapturedDraftJsonValue;
  id: CapturedDraftJsonValue;
  revision?: CapturedDraftJsonValue;
}

export interface CapturedOutgoingDraftForm {
  label: string;
  packages: CapturedDraftPackage[];
  sources: CapturedDraftSource[];
}

export interface CapturedReceivingDraftForm {
  label: string;
  bundle: string;
  manifestSha256: string;
  names: Record<string, string>;
}

export type CapturedDraftForm =
  | CapturedOutgoingDraftForm
  | CapturedReceivingDraftForm;

/** Native defaults are applied only to omitted/null original top-level fields. */
export interface CapturedOutgoingDraftInput {
  label?: string | null;
  packages?: CapturedDraftPackage[] | null;
  sources?: CapturedDraftSource[] | null;
}

export interface CapturedReceivingDraftInput {
  label?: string | null;
  bundle?: string | null;
  manifestSha256?: string | null;
  names?: Record<string, string> | null;
}

/** Conflict ids are deterministic opaque strings from the exact comparison. */
export type CapturedDraftResolutions = Record<string, CapturedDraftChoice>;

export type CapturedDraftConflictSlot =
  | { present: false }
  | { present: true; value: CapturedDraftJsonValue };

/**
 * field:
 * - label or bundle: one original scalar;
 * - packages/sources: a complete array, or a member when key is present;
 * - packages.order/sources.order: ordering only, preserving all merged members;
 * - names: one name when key is present, otherwise the complete map;
 * - selection: the receiving bundle, manifestSha256 and names together.
 */
export interface CapturedDraftConflict {
  id: string;
  field: string;
  key?: string;
  reason: string;
  base: CapturedDraftConflictSlot;
  current: CapturedDraftConflictSlot;
  working: CapturedDraftConflictSlot;
  choice?: CapturedDraftChoice;
}

/** Side identifies editions changed from base, including an unresolved edit. */
export interface CapturedDraftChange {
  field: string;
  key?: string;
  side: CapturedDraftSide;
  action: 'ADD' | 'CHANGE' | 'REMOVE';
}

export interface CapturedDraftMergeReview {
  schema: typeof CAPTURED_DRAFT_MERGE_SCHEMA;
  /** READY includes explicitly resolved conflicts, retained below with choices. */
  status: 'READY' | 'CONFLICTS';
  /** Unresolved conflicts provisionally use CURRENT. Native save owns adoption. */
  form: CapturedDraftForm;
  conflicts: CapturedDraftConflict[];
  changes: CapturedDraftChange[];
}

export type CapturedDraftMergeInput =
  | {
      kind: 'OUTGOING';
      base: CapturedOutgoingDraftInput;
      current: CapturedOutgoingDraftInput;
      working: CapturedOutgoingDraftInput;
      resolutions?: CapturedDraftResolutions;
    }
  | {
      kind: 'RECEIVING';
      base: CapturedReceivingDraftInput;
      current: CapturedReceivingDraftInput;
      working: CapturedReceivingDraftInput;
      resolutions?: CapturedDraftResolutions;
    };

export interface CapturedWorkingEditIdentity {
  /** Original native product id, a lowercase SHA-256. */
  productId: string;
  /** Original native draft UUID, versions 1 through 8. */
  draftId: string;
  /** Exact raw-byte SHA-256 of the retained native base edition. */
  baseRevision: string;
}

export type CapturedWorkingEditInput = CapturedWorkingEditIdentity &
  (
    | {
        kind: 'OUTGOING';
        base: CapturedOutgoingDraftInput;
        working: CapturedOutgoingDraftInput;
      }
    | {
        kind: 'RECEIVING';
        base: CapturedReceivingDraftInput;
        working: CapturedReceivingDraftInput;
      }
  );

export type CapturedWorkingEdit = CapturedWorkingEditIdentity &
  { schema: typeof CAPTURED_WORKING_EDIT_SCHEMA } &
  (
    | {
        kind: 'OUTGOING';
        base: CapturedOutgoingDraftForm;
        working: CapturedOutgoingDraftForm;
      }
    | {
        kind: 'RECEIVING';
        base: CapturedReceivingDraftForm;
        working: CapturedReceivingDraftForm;
      }
  );

/**
 * Pure complete three-way review. Compatible row edits and ordering changes merge
 * automatically. Ambiguous keys and excessive merged collections require a whole
 * collection choice. A changed source manifest and a divergent receiving edit
 * require one complete selection choice. Unknown resolution ids reject.
 *
 * Inputs are copied. No file, network, clock, random identity, source compiler or
 * native writer is used. The host binds both original revisions and review SHA.
 */
export function reviewCapturedDraftMerge(
  value: CapturedDraftMergeInput,
): CapturedDraftMergeReview;

/**
 * Capture the complete normalized original base and working forms. No dates,
 * generated ids or source substitutions are added; unknown fields reject.
 */
export function createCapturedWorkingEdit(
  value: CapturedWorkingEditInput,
): CapturedWorkingEdit;

/**
 * Read a parsed JSON packet and return a new normalized plain-JSON copy.
 * The native host must verify product/draft/kind and exact original base history
 * before adopting the working form. This function is not a source authorization.
 */
export function readCapturedWorkingEdit(value: unknown): CapturedWorkingEdit;
