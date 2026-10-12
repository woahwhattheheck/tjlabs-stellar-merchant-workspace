export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type EntityId = string | number;
export type DocumentKind = 'release' | 'compiledRelease' | 'versionedRelease';
export type SourceKind = 'unknown' | 'collection' | 'release' | 'record' | 'release-package' | 'record-package' | 'mixed-package';
export type SourceMeta = { sourceId?: string; label?: string; url?: string; retrievedAt?: string };
export type Diagnostic = {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  path: string;
  sourceId: string | null;
  ocid?: string | null;
  previousPath?: string;
  id?: EntityId;
  role?: string;
  extensions?: string[];
  recordOcid?: JsonValue;
};
export type PackageMetadata = {
  sourcePointer: string;
  kind: 'release-package' | 'record-package';
  version: string | null;
  uri: string | null;
  publishedDate: string | null;
  publisher: JsonObject | null;
  license: string | null;
  publicationPolicy: string | null;
  extensions: string[];
};
export type Source = {
  id: string | null;
  label: string | null;
  url: string | null;
  retrievedAt: string | null;
  kind: SourceKind;
  version: string | null;
  publisher: JsonObject | null;
  publishedDate: string | null;
  uri: string | null;
  license: string | null;
  publicationPolicy: string | null;
  extensions: string[];
  packages: PackageMetadata[];
};
export type Organization = { id: EntityId | null; name: string | null };
/** amount/currency retain invalid source types so the inspector never silently coerces them. */
export type ValueView = {
  amount: JsonValue;
  currency: JsonValue;
  amountPresent: boolean;
  currencyPresent: boolean;
};
export type ValueSummary = ValueView & {
  stage: string;
  role: string;
  id: EntityId | null;
  path: string;
};
export type PartySummary = Organization & { roles: string[]; path: string };
export type AwardSummary = {
  id: EntityId | null;
  title: string | null;
  status: string | null;
  date: string | null;
  value: ValueView | null;
  suppliers: Organization[];
  path: string;
};
export type ContractSummary = {
  id: EntityId | null;
  awardID: EntityId | null;
  title: string | null;
  status: string | null;
  dateSigned: string | null;
  value: ValueView | null;
  period: JsonObject | null;
  path: string;
};
export type DocumentSummary = {
  id: EntityId | null;
  title: string | null;
  documentType: string | null;
  url: string | null;
  format: string | null;
  datePublished: string | null;
  dateModified: string | null;
  path: string;
};
export type ReferenceSummary = Organization & {
  role: string;
  path: string;
  targetPath: string | null;
};
export type LinkSummary = { url: string; title: string | null; kind: string; path: string };
export type Summary = {
  ocid: string | null;
  title: string;
  buyer: Organization | null;
  stage: string;
  status: string | null;
  description: string | null;
  procurementMethod: string | null;
  values: ValueSummary[];
  dates: Partial<Record<'release' | 'tenderStart' | 'tenderEnd' | 'awardStart' | 'awardEnd' | 'contractStart' | 'contractEnd', string | null>>;
  counts: {
    parties: number;
    awards: number;
    contracts: number;
    documents: number;
    milestones: number;
    transactions: number;
    versionedFields?: number;
    revisions?: number;
  };
  parties: PartySummary[];
  awards: AwardSummary[];
  contracts: ContractSummary[];
  documents: DocumentSummary[];
  references: ReferenceSummary[];
  links: LinkSummary[];
};
export type Entry = {
  sourcePointer: string;
  kind: DocumentKind;
  ocid: string | null;
  releaseId: string | null;
  date: string | null;
  tags: string[];
  document: JsonObject;
  summary: Summary;
  recordOcid?: JsonValue;
};
export type LinkedRelease = {
  kind: 'linkedRelease';
  sourcePointer: string;
  ocid: string | null;
  url: string | null;
  packageUrl: string | null;
  releaseId: string | null;
  date: string | null;
  tags: string[];
  resolved: false;
  document: JsonObject;
};
export type NormalizedOcds = { source: Source; entries: Entry[]; links: LinkedRelease[]; diagnostics: Diagnostic[] };
export type DocumentChange = {
  /** Actual after pointer, or before pointer for a removal. */
  path: string;
  type: 'added' | 'removed' | 'changed';
  before: JsonValue;
  after: JsonValue;
  beforePresent: boolean;
  afterPresent: boolean;
  beforePath: string | null;
  afterPath: string | null;
  reason?: 'array-order';
  identity?: { id: EntityId; arrayPath: string };
};
export type Comparison = {
  changes: DocumentChange[];
  counts: { added: number; removed: number; changed: number; total: number };
};
export type ExportRow = {
  rowType: 'process' | 'party' | 'award' | 'contract' | 'value' | 'document' | 'transaction' | 'milestone' | 'item' | 'field-revision';
  sourcePointer: string;
  ocid: string | null;
  releaseId: string | null;
  releaseDate: string | null;
  [field: string]: JsonValue;
};
export declare class OcdsInputError extends Error { code: string; constructor(message: string, code?: string) }
/** Original documents are retained; diagnostics are structural, not full schema validation. */
export declare function normalizeOcds(input: string | JsonValue, meta?: SourceMeta): NormalizedOcds;
export declare function summarizeDocument(document: JsonObject): Summary;
/** This compares documents; it does not apply OCDS merge semantics. */
export declare function compareDocuments(before: JsonValue, after: JsonValue): Comparison;
/** Relational rows from a selected original document with original JSON pointers. */
export declare function projectRows(document: JsonObject): ExportRow[];
