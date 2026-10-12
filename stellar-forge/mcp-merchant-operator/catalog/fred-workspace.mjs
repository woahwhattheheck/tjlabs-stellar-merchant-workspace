// MIT. Static FRED tool metadata; imports no source, merchant or buyer runtime.
import { MAX_RETAINED_CHUNK_BYTES } from '../retained-file-contracts.mjs';
const alias = { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{0,63}$' };
const operation = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$' };
const digest = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const revision = { type: 'integer', minimum: 1 };
const offset = { type: 'integer', minimum: 0, maximum: 1000000 };
const limit = { type: 'integer', minimum: 1, maximum: 100 };
const object = { type: 'object' };
const workspace = { workspace: alias };
const recorded = { ...workspace, id: operation, expectedRevision: revision };
const publication = { ...workspace, publicationId: digest };
const purchase = { ...publication, intentId: operation };
const read = { readOnly: true, idempotent: true };
const change = { idempotent: true };
const records = ['captures', 'reviews', 'publications', 'operations', 'briefingTemplates', 'briefingSuccessors',
  'releaseCaptures', 'releaseWatches', 'releasePlans', 'ddpCrosswalks', 'ddpPackages', 'ddpMigrations', 'ddpReceivings'];
export const fredBriefingSelection = {
  type: 'object', additionalProperties: false,
  properties: {
    schema: { type: 'string', enum: ['stellar-forge.fred-briefing-spec.v1'] },
    title: { type: 'string', minLength: 1, maxLength: 160 }, notes: { type: 'string', maxLength: 8000 },
    start: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, end: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    decimalPlaces: { type: 'integer', minimum: 0, maximum: 12 },
    series: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'object', additionalProperties: false,
      required: ['id'], properties: {
        id: { type: 'string', minLength: 1, maxLength: 120 },
        comparisons: { type: 'array', minItems: 1, maxItems: 3, uniqueItems: true,
          items: { type: 'string', enum: ['previous_period', 'year_earlier', 'previous_observation'] } },
        relativeChange: { type: 'boolean' }
      } } }
  }
};
const templateId = { type: 'string', pattern: '^fred-template-[a-f0-9]{64}$' };
const successorId = { type: 'string', pattern: '^fred-successor-[a-f0-9]{64}$' };
const calendarDate = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const changePage = { offset: { type: 'integer', minimum: 0, maximum: 60000 },
  limit: { type: 'integer', minimum: 1, maximum: 500 }, changesOnly: { type: 'boolean' } };
const successorSelection = { templateId, captureId: digest, anchorDate: calendarDate,
  baselineReviewId: digest, previousSuccessorId: successorId, note: { type: 'string', maxLength: 8000 } };
export const fredBriefingTemplateWindow = {
  type: 'object', additionalProperties: false, properties: {
    months: { type: 'integer', minimum: 1, maximum: 1200 },
    anchor: { type: 'string', enum: ['latest_all', 'latest_any'] },
    lagMonths: { type: 'integer', minimum: 0, maximum: 1200 }
  }
};

const releaseWatchId = { type: 'string', pattern: '^fred-release-watch-[a-f0-9]{64}$' };
const releasePlanId = { type: 'string', pattern: '^fred-release-plan-[a-f0-9]{64}$' };
const releasePlanSection = { type: 'string', enum: ['acquisitions', 'calendarChanges', 'vintageChanges', 'events', 'schedule'] };
const releasePage = { offset, limit: { type: 'integer', minimum: 1, maximum: 500 } };
const releasePlanSelection = { watchId: releaseWatchId, beforeCaptureId: digest, afterCaptureId: digest };
const releaseSeries = { type: 'array', minItems: 1, maxItems: 50, uniqueItems: true,
  items: { type: 'string', minLength: 1, maxLength: 120 } };
export const fredReleaseSelection = {
  type: 'object', additionalProperties: false,
  required: ['series', 'asOf', 'calendarStart', 'calendarEnd', 'vintageStart', 'vintageEnd'],
  properties: {
    schema: { type: 'string', enum: ['stellar-forge.fred-release-selection.v1'] },
    series: releaseSeries, asOf: calendarDate, calendarStart: calendarDate, calendarEnd: calendarDate,
    vintageStart: calendarDate, vintageEnd: calendarDate,
    pageSize: { type: 'integer', minimum: 1, maximum: 10000 },
    maxRows: { type: 'integer', minimum: 1, maximum: 1000000 }
  }
};

const ddpCrosswalkId = { type: 'string', pattern: '^fred-ddp-crosswalk-[a-f0-9]{64}$' };
const ddpPackageId = { type: 'string', pattern: '^fred-ddp-package-[a-f0-9]{64}$' };
const ddpMigrationId = { type: 'string', pattern: '^fred-ddp-migration-plan-[a-f0-9]{64}$' };
const ddpReceivingId = { type: 'string', pattern: '^fred-ddp-receiving-[a-f0-9]{64}$' };
const ddpSeriesId = { type: 'string', minLength: 1, maxLength: 1000 };
const ddpPlanSection = { type: 'string', enum: ['series', 'acquisitions', 'mappings'] };
const ddpWindow = { type: 'object', additionalProperties: false, required: ['kind'], properties: {
  kind: { type: 'string', enum: ['source', 'fixed', 'last'] }, start: calendarDate, end: calendarDate,
  count: { type: 'integer', minimum: 1, maximum: 1000000 }
} };
const ddpDecision = { type: 'object', additionalProperties: false,
  required: ['release', 'boardSeriesId', 'action', 'note'], properties: {
    release: { type: 'string', minLength: 1, maxLength: 100 }, boardSeriesId: ddpSeriesId,
    action: { type: 'string', enum: ['map', 'exclude'] },
    fredSeriesId: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$' },
    note: { type: 'string', minLength: 1, maxLength: 4000 }
} };
const ddpBinding = { type: 'object', additionalProperties: false, required: ['seriesId', 'note'], properties: {
  seriesId: ddpSeriesId, periodRule: { type: ['string', 'null'], enum: ['exact', 'month', 'quarter', 'semiannual', 'year', null] },
  sourceScale: { type: 'string', minLength: 1, maxLength: 128 },
  targetScale: { type: 'string', minLength: 1, maxLength: 128 },
  expectedFredUnits: { type: ['string', 'null'], maxLength: 2000 },
  expectedFredFrequency: { type: ['string', 'null'], maxLength: 2000 },
  expectedFredSeasonalAdjustment: { type: ['string', 'null'], maxLength: 2000 },
  note: { type: 'string', minLength: 1, maxLength: 4000 }
} };
export const fredDdpMigrationSelection = {
  packageId: ddpPackageId, crosswalkId: ddpCrosswalkId,
  name: { type: 'string', minLength: 1, maxLength: 500 }, asOf: calendarDate, window: ddpWindow,
  bookmark: { type: ['string', 'null'], maxLength: 8192 }, note: { type: 'string', maxLength: 8000 },
  decisions: { type: 'array', maxItems: 100000, items: ddpDecision },
  bindings: { type: 'array', maxItems: 100000, items: ddpBinding },
  pageSize: { type: 'integer', minimum: 1, maximum: 100000 },
  maxRows: { type: 'integer', minimum: 1, maximum: 1000000 }
};

const ddpPage = { ...releasePage, offset: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER } };

export const fredFileSelection = {
  kind: { type: 'string', enum: ['source', 'comparison', 'project', 'customer', 'briefing', 'briefing-successor', 'release-source', 'release-plan', 'ddp-crosswalk', 'ddp-package', 'ddp-migration', 'ddp-receiving'] },
  captureId: digest, before: digest, after: digest, publicationId: digest, intentId: operation, reviewId: digest, successorId,
  releaseCaptureId: digest, planId: releasePlanId,
  crosswalkId: ddpCrosswalkId, packageId: ddpPackageId, migrationId: ddpMigrationId, receivingId: ddpReceivingId,
  format: { type: 'string', enum: ['html', 'csv', 'json', 'manifest'] }
};
export function fredWorkspaceTools(tool) {
  return [
    tool('merchant_fred_workspaces', 'List original configured economic workspace aliases and source/profile names.', {}, [], read),
    tool('merchant_fred_status', 'Inspect the original project, revision, source and publication counts, native merchant, buyer configuration and pending acquisition.', workspace, ['workspace'], read),
    tool('merchant_fred_inputs', 'List host-retained source aliases and the complete configured public merchant/payment profiles.', workspace, ['workspace'], read),
    tool('merchant_fred_input_inspect', 'Read the exact complete host input and return its original source metadata, byte count and SHA256 before import.', { ...workspace, input: alias }, ['workspace', 'input'], read),
    tool('merchant_fred_records', 'Page saved captures, reviews, publications, operations, recurring briefing definitions or release records from one original project revision. Keep expectedRevision across pages.', {
      ...workspace, kind: { type: 'string', enum: records }, offset, limit, expectedRevision: revision
    }, ['workspace', 'kind'], read),
    tool('merchant_fred_record', 'Read one complete saved capture metadata, review, publication, original operation, recurring definition or release watch/plan summary from the same project.', {
      ...workspace, kind: { type: 'string', enum: records }, id: { type: 'string', minLength: 1, maxLength: 96 }, expectedRevision: revision
    }, ['workspace', 'kind', 'id'], read),
    tool('merchant_fred_operation', 'Recover the durable original project operation and pending source-acquisition progress after an interrupted response.', {
      ...workspace, id: operation
    }, ['workspace', 'id'], read),
    tool('merchant_fred_observations', 'Read original observations in native 100-row pages. Preserve series frequency, units, seasonality, missing values and source time basis; follow nextOffset.', {
      ...workspace, captureId: digest, series: { type: 'string', minLength: 1, maxLength: 120 }, offset
    }, ['workspace', 'captureId'], read),
    tool('merchant_fred_compare', 'Page the original change report between two retained source editions, including revisions and missing values.', {
      ...workspace, before: digest, after: digest, offset
    }, ['workspace', 'before', 'after'], read),
    tool('merchant_fred_briefing_preview', 'Preview exact previous-period, year-earlier or previous-original-observation measures on one retained economic capture. Preserve original frequency, units, missing markers and vintage; relative percent is an explicit separate selection. Follow nextOffset.', {
      ...workspace, captureId: digest, briefing: fredBriefingSelection, offset
    }, ['workspace', 'captureId', 'briefing'], read),
    tool('merchant_fred_briefing', 'Open a saved analyst briefing, original comparison page and complete HTML/CSV/JSON/manifest file descriptors. Follow nextOffset; use file_read with kind briefing for the full selected file.', {
      ...workspace, reviewId: digest, offset
    }, ['workspace', 'reviewId'], read),
    tool('merchant_fred_briefing_templates', 'Page retained recurring templates or saved successors from the original project. Keep expectedRevision while following nextOffset. Each template retains its original review and observation-date window.', {
      ...workspace, kind: { type: 'string', enum: ['templates', 'successors'] }, offset, limit, expectedRevision: revision
    }, ['workspace'], read),
    tool('merchant_fred_briefing_template_save', 'Save an immutable recurring briefing template from an original saved analyst review. Select calendar months and latest_all or latest_any observation-date anchor. previousTemplateId records an edited definition without replacing its predecessor.', {
      ...recorded, reviewId: digest, name: { type: 'string', minLength: 1, maxLength: 160 },
      window: fredBriefingTemplateWindow, previousTemplateId: templateId
    }, ['workspace', 'id', 'expectedRevision', 'reviewId'], change),
    tool('merchant_fred_briefing_successor_preview', 'Preview the next complete report using the selected retained capture and template. Inspect exact rolling dates, missing coverage, source-meaning changes, economic revisions and report lineage. Retain previewId and the same note/anchor/baseline selection for saving. offset/limit page report changes.', {
      ...workspace, ...successorSelection, ...changePage
    }, ['workspace', 'templateId', 'captureId'], read),
    tool('merchant_fred_briefing_successor_save', 'Save the exact reviewed successor preview through the original project operation. Supply previewId and the same template, capture, anchor, preceding report and note. The resulting original review publishes through merchant_fred_publish.', {
      ...recorded, ...successorSelection, previewId: digest
    }, ['workspace', 'id', 'expectedRevision', 'templateId', 'captureId', 'previewId'], change),
    tool('merchant_fred_briefing_successor', 'Open one retained successor, its exact preceding report and paged full comparison. changesOnly=false includes unchanged economic values and their source-context changes. Complete JSON/CSV/HTML is available through file_read with kind briefing-successor.', {
      ...workspace, successorId, ...changePage
    }, ['workspace', 'successorId'], read),
    tool('merchant_fred_release_captures', 'Page complete retained release capture descriptors from the original project. Each capture preserves series metadata, exact calendar/vintage intervals and original response counts. Keep expectedRevision while following nextOffset.', {
      ...workspace, offset, limit, expectedRevision: revision
    }, ['workspace'], read),
    tool('merchant_fred_release_capture', 'Read a selected original release capture in series, releases, calendar or vintages pages. Calendar dates and information available as of a date have distinct meanings. Use file_read kind release-source for every original response and byte identity.', {
      ...workspace, releaseCaptureId: digest,
      section: { type: 'string', enum: ['series', 'releases', 'calendar', 'vintages'] }, ...releasePage
    }, ['workspace', 'releaseCaptureId'], read),
    tool('merchant_fred_release_import', 'Import a complete host-configured release-capture input, retaining exact requests and full source responses. Supply input and optional expectedSha256; releaseCaptureId may also pin its identity. For an interrupted staged import, use the same id and revision with its original releaseCaptureId.', {
      ...recorded, input: alias, expectedSha256: digest, releaseCaptureId: digest
    }, ['workspace', 'id', 'expectedRevision'], change),
    tool('merchant_fred_release_acquire', 'Capture the exact selected series metadata, series/release mapping, complete per-release calendar and series vintage-date pages through the original host FRED key binding. Reuse the same original operation and selection for continuation; an omitted selection resumes that original pending acquisition.', {
      ...recorded, selection: fredReleaseSelection
    }, ['workspace', 'id', 'expectedRevision'], { ...change, openWorld: true }),
    tool('merchant_fred_release_watches', 'Page saved release watches, plan summaries or completed catch-up bindings from one project revision. kind selects watches, plans or catchUps; keep expectedRevision while following nextOffset.', {
      ...workspace, kind: { type: 'string', enum: ['watches', 'plans', 'catchUps'] }, offset, limit, expectedRevision: revision
    }, ['workspace'], read),
    tool('merchant_fred_release_watch_save', 'Save an immutable watch over a complete series list or every series of a retained briefing template. Select original observation coverage, baselineAsOf and all_vintages or latest_vintage catch-up. The watch preserves exact source meaning and template lineage.', {
      ...recorded, name: { type: 'string', minLength: 1, maxLength: 200 }, series: releaseSeries, templateId,
      observationStart: calendarDate, observationEnd: { type: 'string', pattern: '^(as_of|\\d{4}-\\d{2}-\\d{2})$' },
      baselineAsOf: calendarDate, catchUp: { type: 'string', enum: ['all_vintages', 'latest_vintage'] },
      pageSize: { type: 'integer', minimum: 1, maximum: 100000 }, maxRows: { type: 'integer', minimum: 1, maximum: 1000000 }
    }, ['workspace', 'id', 'expectedRevision', 'name', 'observationStart', 'baselineAsOf'], change),
    tool('merchant_fred_release_plan_preview', 'Preview a complete source-span release catch-up plan from one saved watch and selected after capture, with optional preceding capture. Page actual acquisitions, calendar/vintage changes, events or schedule. Retain previewId, project revision and the exact watch/source pair before saving.', {
      ...workspace, ...releasePlanSelection, section: releasePlanSection, ...releasePage
    }, ['workspace', 'watchId', 'afterCaptureId'], read),
    tool('merchant_fred_release_plan_save', 'Save the exact reviewed release preview under the original operation and current project revision. Preserve watchId, beforeCaptureId, afterCaptureId and previewId; the immutable plan retains its complete source basis and completion snapshot.', {
      ...recorded, ...releasePlanSelection, previewId: digest
    }, ['workspace', 'id', 'expectedRevision', 'watchId', 'afterCaptureId', 'previewId'], change),
    tool('merchant_fred_release_plan', 'Open one saved release plan and page its acquisitions, calendar changes, vintage changes, events or schedule. Completed original observation captures retain planId and asOf. Use file_read kind release-plan for the full immutable plan and kind project for portable v4 receiving.', {
      ...workspace, planId: releasePlanId, section: releasePlanSection, ...releasePage
    }, ['workspace', 'planId'], read),
    tool('merchant_fred_release_vintage_capture', 'Acquire one exact asOf selection already present in the saved release plan through original captureFred and the existing private key binding. All watched series retain that coherent information date. Keep the original operation ID for recovery; the resulting capture enters the original analyst and recurring-briefing workflow.', {
      ...recorded, planId: releasePlanId, asOf: calendarDate
    }, ['workspace', 'id', 'expectedRevision', 'planId', 'asOf'], { ...change, openWorld: true }),
    tool('merchant_fred_ddp_sources', 'Page the complete original DDP crosswalk, package, migration or receiving inventory. Keep expectedRevision while following nextOffset; each receiving retains its acquired FRED captures and complete report files.', {
      ...workspace, kind: { type: 'string', enum: ['crosswalks', 'packages', 'migrations', 'receivings'] },
      offset, limit, expectedRevision: revision
    }, ['workspace'], read),
    tool('merchant_fred_ddp_crosswalk', 'Inspect the original Board-to-FRED crosswalk and page its exact rows. Filter by release or identifier query. Full source bytes and provenance are available with file_read kind ddp-crosswalk.', {
      ...workspace, crosswalkId: ddpCrosswalkId, release: { type: 'string', minLength: 1, maxLength: 100 },
      query: { type: 'string', maxLength: 500 }, ...ddpPage
    }, ['workspace', 'crosswalkId'], read),
    tool('merchant_fred_ddp_crosswalk_import', 'Import a complete host-configured ddp-crosswalk JSON envelope using input and optional expectedSha256. The original CSV bytes, provenance and content identity remain intact. Resume a staged import with the same operation id, revision and crosswalkId.', {
      ...recorded, input: alias, expectedSha256: digest, crosswalkId: ddpCrosswalkId
    }, ['workspace', 'id', 'expectedRevision'], change),
    tool('merchant_fred_ddp_crosswalk_acquire', 'Acquire the full official Federal Reserve crosswalk through the existing source runtime and retain its original response. The optional url selects the current official Board source. Keep the same original operation for interrupted acquisition.', {
      ...recorded, url: { type: 'string', maxLength: 8192 }
    }, ['workspace', 'id', 'expectedRevision'], { ...change, openWorld: true }),
    tool('merchant_fred_ddp_package', 'Inspect a complete original DDP package. Page series or observations, optionally selecting one original package seriesId. The source keeps original CSV layout, XML/ZIP members, labels, units, missing markers and date coverage.', {
      ...workspace, packageId: ddpPackageId, section: { type: 'string', enum: ['series', 'observations'] },
      seriesId: ddpSeriesId, frequency: { type: 'string', maxLength: 100 }, query: { type: 'string', maxLength: 500 }, ...ddpPage
    }, ['workspace', 'packageId'], read),
    tool('merchant_fred_ddp_package_import', 'Import a complete host-configured ddp-package source envelope; its original package file and supplemental structure files stay intact. Use input plus optional expectedSha256 or continue the same staged import with the original packageId, operation id and revision.', {
      ...recorded, input: alias, expectedSha256: digest, packageId: ddpPackageId
    }, ['workspace', 'id', 'expectedRevision'], change),
    tool('merchant_fred_ddp_migration_preview', 'Preview every original package series against the selected complete crosswalk. Keep source, fixed-date or rolling last-observation coverage; explicitly review ambiguous mappings and period/unit meaning bindings. Page series, mappings or complete native FRED batch acquisitions. Retain previewId and the exact selection before saving.', {
      ...workspace, ...fredDdpMigrationSelection, section: ddpPlanSection, ...ddpPage
    }, ['workspace', 'packageId', 'crosswalkId', 'name', 'asOf'], read),
    tool('merchant_fred_ddp_migration_save', 'Save the complete reviewed DDP migration as an immutable plan, retaining its exact original sources, mappings, meaning bindings and observation window. Supply the same previewId, plan selection and current project revision.', {
      ...recorded, ...fredDdpMigrationSelection, previewId: digest
    }, ['workspace', 'id', 'expectedRevision', 'packageId', 'crosswalkId', 'name', 'asOf', 'previewId'], change),
    tool('merchant_fred_ddp_migration', 'Open a saved DDP migration and page original series, mappings or acquisition selections. Its receiving inventory joins completed native FRED batches. Use file_read kind ddp-migration for the full immutable plan.', {
      ...workspace, migrationId: ddpMigrationId, section: ddpPlanSection, ...ddpPage
    }, ['workspace', 'migrationId'], read),
    tool('merchant_fred_ddp_migration_acquire', 'Acquire every exact native FRED batch in the saved DDP migration through the existing private key binding and save the complete reconciliation. One original operation owns all batches and its receivingId; resume with that same id and revision. The original captures remain usable in the analyst and recurring-briefing workflow.', {
      ...recorded, migrationId: ddpMigrationId
    }, ['workspace', 'id', 'expectedRevision', 'migrationId'], { ...change, openWorld: true }),
    tool('merchant_fred_ddp_receiving', 'Read a completed original DDP-to-FRED reconciliation. Page all rows or changed rows, filter an original seriesId, and retain source/target metadata and reviewed meaning bindings. Download the complete JSON, CSV or offline HTML with file_read kind ddp-receiving; use a complete project export to reopen every original source, plan and result (v5 for DDP, v6 when QCEW is retained).', {
      ...workspace, receivingId: ddpReceivingId, seriesId: ddpSeriesId,
      changesOnly: { type: 'boolean' }, ...ddpPage
    }, ['workspace', 'receivingId'], read),
    tool('merchant_fred_configure', 'Save the complete original FRED selection with its stable operation ID and reviewed project revision.', {
      ...recorded, selection: object
    }, ['workspace', 'id', 'expectedRevision', 'selection'], change),
    tool('merchant_fred_capture', 'Acquire official FRED API responses through the original workspace environment and retained acquisition. Reuse this same ID and revision for continuation.', recorded,
      ['workspace', 'id', 'expectedRevision'], { ...change, openWorld: true }),
    tool('merchant_fred_import', 'Import the complete declared public table or retained API capture. Exact source text, metadata and bytes pass to the original project importer.', {
      ...recorded, input: alias, expectedSha256: digest
    }, ['workspace', 'id', 'expectedRevision', 'input'], change),
    tool('merchant_fred_combine', 'Combine one to fifty distinct retained public-table captures into a complete economic edition. The native model preserves each publisher, frequency, unit and retrieval basis.', {
      ...recorded, captureIds: { type: 'array', items: digest, minItems: 1, maxItems: 50, uniqueItems: true }
    }, ['workspace', 'id', 'expectedRevision', 'captureIds'], change),
    tool('merchant_fred_select', 'Select the original retained capture in this same project.', {
      ...recorded, captureId: digest
    }, ['workspace', 'id', 'expectedRevision', 'captureId'], change),
    tool('merchant_fred_review', 'Save the exact source projection, review note and optional analyst briefing against the original capture and revision. A briefing retains its full source-bound HTML, measures CSV, JSON and manifest.', {
      ...recorded, captureId: digest, policy: object, note: { type: 'string', maxLength: 8000 }, briefing: fredBriefingSelection
    }, ['workspace', 'id', 'expectedRevision', 'captureId'], change),
    tool('merchant_fred_publish', 'Publish the saved review using one host-selected original merchant origin, route and complete payment profile.', {
      ...recorded, reviewId: digest, profile: alias
    }, ['workspace', 'id', 'expectedRevision', 'reviewId', 'profile'], change),
    tool('merchant_fred_abandon', 'Explicitly close the selected pending source operation while retaining its acquisition and immutable preparations.', {
      ...recorded, pendingId: operation
    }, ['workspace', 'id', 'expectedRevision', 'pendingId'], change),
    tool('merchant_fred_merchant_start', 'Start the reviewed original publication through this workspace’s configured facilitator and merchant port.', publication,
      ['workspace', 'publicationId'], { openWorld: true }),
    tool('merchant_fred_merchant_stop', 'Stop the selected original merchant listener owned by this workspace.', publication,
      ['workspace', 'publicationId'], change),
    tool('merchant_fred_publication', 'Inspect the exact economic edition, dataset schema, snapshot, advertised file hashes and original public payment offers.', publication,
      ['workspace', 'publicationId'], read),
    tool('merchant_fred_requests', 'Page the prepared original customer intents for a publication. Use recover on the same intent after dispatch uncertainty.', {
      ...publication, offset, limit, expectedViewSha256: digest
    }, ['workspace', 'publicationId'], read),
    tool('merchant_fred_preview', 'Run the original native dataset query as a local edition preview, preserving the selected snapshot.', {
      ...publication, query: { type: 'string', maxLength: 32768 }
    }, ['workspace', 'publicationId'], read),
    tool('merchant_fred_prepare', 'Retain one original customer request for the selected publication. For the next page pass the actual preceding page metadata and next cursor; for a full file choose its advertised path.', {
      ...purchase, query: { type: 'string', maxLength: 32768 }, file: { type: 'string', minLength: 1, maxLength: 2048 },
      previous: object, acceptIndex: { type: 'integer', minimum: 0, maximum: 1000 }
    }, ['workspace', 'publicationId', 'intentId'], change),
    tool('merchant_fred_buy', 'Execute the prepared original intent through the workspace’s maintained SF88 buyer and native approval/finality flow. Recover the same intent after any interrupted reply.', purchase,
      ['workspace', 'publicationId', 'intentId'], { openWorld: true }),
    tool('merchant_fred_recover', 'Recover the original intent, native receipt and retained response without preparing another payment. Use file_read for the complete delivered bytes.', purchase,
      ['workspace', 'publicationId', 'intentId'], { idempotent: true, openWorld: true }),
    tool('merchant_fred_published_operations', 'Page retained complete current-publication editions in the original project. Continue nextOffset through the full operation history.', {
      ...workspace, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 500 }
    }, ['workspace'], read),
    tool('merchant_fred_published_operation', 'Reopen the original retained publication request, progress, complete native result and exact original file inventory. Continue the same original request after interruption.', {
      ...workspace, id: operation
    }, ['workspace', 'id'], read),
    tool('merchant_fred_published_start', 'Retain and run one complete current-publication edition from the original saved migration. Acknowledge only after retaining the request; inspect published_operation for completion. Resume with the same ID, migration and original expectedRevision. A new edition acquires every mapped original series.', {
      ...recorded, migrationId: { type: 'string', pattern: '^fred-ddp-migration-plan-[a-f0-9]{64}$' }
    }, ['workspace', 'id', 'expectedRevision', 'migrationId'], { idempotent: true, openWorld: true }),
    tool('merchant_fred_published_report', 'Open and page the original native current-publication comparison. Keep complete source meaning, current retrieval dates, all six comparison statuses and exact original file inventory.', {
      ...workspace, id: operation, query: { type: 'string', maxLength: 500 },
      offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 500 }
    }, ['workspace', 'id'], read),
    tool('merchant_fred_published_rows', 'Page complete original observation rows through the native sparse file index. Pin comparisonId and follow nextOffset in original row positions; retain numeric strings, unavailable codes and exact original source byte ranges.', {
      ...workspace, id: operation, comparisonId: { type: 'string', pattern: '^fred-current-publication-comparison-[a-f0-9]{64}$' },
      seriesId: { type: 'string', minLength: 1, maxLength: 500 },
      status: { type: 'string', enum: ['EQUAL','DIFFERENT','BOTH_MISSING','MISSING_CHANGED','SOURCE_ONLY','TARGET_ONLY'] },
      offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 500 }
    }, ['workspace', 'id', 'comparisonId'], read),
    tool('merchant_fred_published_file_read', 'Read a listed complete original publication member or complete edition-package.tar.gz in verified byte chunks. Pin expectedSha256, preserve the original name/ID, follow nextOffset, and verify the whole file after assembly.', {
      ...workspace, id: operation, name: { type: 'string', minLength: 1, maxLength: 240 }, expectedSha256: digest,
      offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 196608 }
    }, ['workspace', 'id', 'name', 'expectedSha256'], read),
    tool('merchant_fred_file_read', 'Read complete original source, release source or saved plan, comparison, analyst briefing, recurring successor, project export or saved customer-delivery bytes in retained chunks. Continue the returned readId/offset; verify the complete file SHA256.', {
      ...workspace, ...fredFileSelection, expectedSha256: digest,
      readId: { type: 'string', minLength: 1, maxLength: 96 }, offset: { type: 'integer', minimum: 0, maximum: 268435456 },
      limit: { type: 'integer', minimum: 1, maximum: MAX_RETAINED_CHUNK_BYTES }
    }, ['workspace', 'kind'], read),
    tool('merchant_fred_file_release', 'Release this client’s retained download descriptor when the original file is no longer needed.', {
      ...workspace, readId: { type: 'string', minLength: 1, maxLength: 96 }
    }, ['workspace', 'readId'], change),
    tool('merchant_fred_disconnect', 'Close this borrowed client and its file reads. A later status attaches to the same project using its current original connection record.', workspace,
      ['workspace'], change)
  ];
}
