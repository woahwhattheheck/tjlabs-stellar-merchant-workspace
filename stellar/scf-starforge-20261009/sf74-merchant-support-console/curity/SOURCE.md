# Curity audit-source companion

This source extension retains original Curity audit exports beside the existing SF74 case system. It supplies exact source interpretation, review and comparison. The existing OAuth verifier, observer, SF93 incident engine and SF74 store continue to own their original operations.

Commercial source: Commons cc3e990aa3f9129ca0b027ff608343369121e81e, opportunities/curity_oauth_support_2026. Original operation: DBC61-CURITY-OAUTH-SUPPORT-WORKSHARE-20261013. Supplier relationship, message 1a132c76382757f9 and commercial decisions remain with their existing owner.

## Runtime and source limits

Node 22 or later, built-in modules only. The native commissioning programme uses its selected complete existing host. No package installation or service starts occur on importing these modules.

A selection contains at most 20 original files, one million nonblank framed records and one GiB of complete original source. A single parsed record is bounded to eight MiB. Every oversized or malformed range still points to its complete retained original; it remains unclassifiable and makes the source incomplete. JSON framing failures retain the entire unclassifiable remainder, whose internal record count is unknown. Counts describe observed framing, not a guessed number of events inside malformed bytes.

Original input and reports stream to disk. The identity index holds one entry for each distinct installation/event ID and each distinct content variant; select native memory for that cardinality, potentially hundreds of MiB for a million events. This is not a constant-memory claim. Reports and UI pages remain bounded. At most 1,000 exact occurrences can be selected into a case review; all other source records remain in the companion and paginated reports.

## Build and review

Import from source.mjs:

- buildEdition(input) resolves the complete immutable manifest after original retention, framing, mapping, accounting and publication.
- openEdition(directory, {verify:true}) reads the same manifest and checks every declared file, mapping and review.
- readEventPage(directory, {after:0, limit:100}) and readFindingPage use sparse byte indexes. They return {items,nextAfter,total,editionId}; after is a zero-based report-row cursor, not an original file ordinal.
- readSourceRecord(directory, ref) returns the exact Buffer and digest for a bounded original byte range.
- compareSourceEditions(beforeDirectory,afterDirectory,{directory}) streams the complete classifiable event identity/content/occurrence comparison into changes.jsonl plus comparison.json. It includes both complete source manifests' file changes and original findings identities; unknown events inside malformed bytes are not assigned invented IDs. This is the full-source comparison alongside the bounded reviewed-selection comparison.
- editionFiles(directory) returns {manifest,files}, adding the original manifest.json identity to the complete portable member list.

The complete input is:

    {
      directory: "/private/owned/editions/inspection-01",
      installationId: "the-selected-installation",
      sourceContext: "SUPPLIER_EXPORT",
      sourceEdition: "supplier-export-identifier",
      files: [{
        path: "/private/received/original.ndjson",
        name: "original.ndjson",
        format: "ndjson",
        sha256: "<actual original digest>",
        sourceUri: "<retained source locator>",
        exportId: "<actual export identity>",
        metadata: {}
      }],
      mapping: { ... },
      coverage: {profiles: [], listeners: [], ...actualCoverageMetadata},
      binding: { ... },
      review: {
        confirmed: false, operator: null, reason: null,
        decisions: [], selection: []
      }
    }

sourceContext is exactly PUBLISHER_EXAMPLE or SUPPLIER_EXPORT. A documentation example cannot become a supplier result by choosing another label. The supplied sourceEdition remains stable across an inspection and its reviewed edition.

Input files receive sourceId values source-1, source-2 and so on in selected order. Original name, URI, export identity and metadata are preserved. Identical full files can appear twice; their separate source IDs retain both supplied occurrences. The original bytes are deduplicated only within that edition's originals/<sha256>.bin storage.

The destination must be new. A private .building-<process>-<random> sibling retains interrupted work and never advertises a complete edition. If acknowledgment is lost after publication, open the original destination; do not build over it. Only the owner may retire an interrupted private staging directory after reconciling the same operation.

For review, inspect pages first, then build a new destination from the same retained original paths and expected hashes. Select the exact previous sourceEdition, coverage and binding; edit the mapping only as an explicit new revision. Review decisions are:

    {
      confirmed: true,
      operator: "named reviewer",
      reason: "scope and mapping decision",
      decisions: [{
        sourceId: "source-1",
        recordOrdinal: 1,
        action: "accept-collision",
        reason: "decision about this exact occurrence"
      }],
      selection: [{sourceId: "source-1", recordOrdinal: 1}]
    }

Actions are include, exclude or accept-collision. An include cannot silently override a collision or move an event outside the selected window. An excluded malformed record remains an incomplete source. Decisions naming missing records fail the build. Review IDs derive from complete review content.

## Explicit layouts

Structured fields use:

    {
      schema: "curity.audit-mapping/v1",
      layout: "fields",
      contentPath: ["audit"],
      fields: {
        type: ["audit","type"], id: ["audit","id"],
        instant: ["audit","instant"], message: ["message"],
        client: ["audit","client"], subject: ["audit","subject"]
      },
      outerTimestamp: {path:["eventTime"], unit:"literal-only"}
    }

Every field keeps absent, null, empty and supplied values distinct. Strings retain their actual decoded value; numbers retain their original lexeme, including values beyond JavaScript integer precision. Nested mapped values retain canonical lossless JSON. Complete original JSON bytes remain authoritative. Duplicate JSON object member names are ambiguous and remain findings.

The four mandatory audit fields type, id, instant and message must be text. Type and ID must be nonempty; an empty message is valid because the published structured example contains one. Optional mapping paths must be explicitly selected. Unknown event types are retained rather than filtered by an outdated hard-coded list.

JSONLayout with the documented textual audit envelope uses:

    {
      schema:"curity.audit-mapping/v1",
      layout:"curity-message",
      messagePath:["message"],
      outerTimestamp:{path:["timeMillis"],unit:"literal-only"}
    }

This selects a strict text grammar: event type, bracketed event ID and named quoted attributes, followed by message text. Quote and backslash escapes are recognized. Other escape conventions or ambiguous delimiters remain findings until the actual export contract selects a supported parser. The extension does not guess a structured layout from a familiar field name.

The outer timestamp unit must be seconds, milliseconds, microseconds, nanoseconds or literal-only. It is retained separately and never replaces event instant. Even a field named timeMillis does not establish its unit.

## Exact time, identity and coverage

Event instant is an explicit RFC3339 string with timezone. Its original literal and arbitrarily long fraction survive interpretation. Event-time ordering compares integer seconds and padded fractional digits, independently of source order. Invalid calendar values, leap-second representations and unknown -00:00 offsets remain unclassifiable; they are never silently normalized.

The selected window is start-inclusive, end-exclusive:

    binding: {
      installationId: "the-selected-installation",
      resourceId: "the-existing-resource",
      configurationHash: "<actual reviewed configuration SHA256>",
      window: {start: "<RFC3339>", end: "<RFC3339>"},
      observation: null
    }

An optional observation is a retained aggregate source link:

    {
      sha256: "<actual observation-file digest>",
      configurationHash: "<same reviewed configuration>",
      endpoint: "<original selected endpoint>",
      stages: ["authentication","authorization","hostAuthority","jwks"],
      window: {start:"<actual observation start>",end:"<actual observation end>"}
    }

It is a reviewed association of configuration, resource and windows. No subject, request, client or token is derived from redacted minute counters. Windows may differ and remain explicit. Never sum overlapping aggregate windows or interpret matching timestamps as a one-to-one request join.

Listener/profile coverage records actual supplied configuration and export declarations. The manifest explicitly labels this CONFIGURATION_AND_EXPORT_DECLARATION_ONLY; configuration is not proof that all relevant events arrived.

Event identity is SHA256 of the selected installation and original event ID. Content identity preserves selected original event content and typed mapped fields. Same identity/content is a repeat with every occurrence retained. Different content under the same ID is a collision. The identity index retains all variants and counts. Source order does not elect an authoritative winner. A later variant also makes an earlier selected occurrence ambiguous unless the review explicitly accepts that occurrence.

## Manifest and reference contract

The immutable manifest schema is curity.audit-edition/v1. Its id hashes the full manifest body excluding id. It carries sourceFiles, files, mappingRevision, configurationHash, binding, coverage, counts, optionalCoverage, eventTimeSpan, sourceContext and state COMPLETE or INCOMPLETE_SOURCE.

counts.dispositions reconciles exactly to sourceRecords. classifiable plus unclassifiable also reconciles. Other counts describe parallel dimensions such as scope and review, and should not be added as if mutually exclusive.

The full closure is:

- manifest.json
- originals/<each exact digest>.bin
- events.jsonl and findings.jsonl
- indexes/identities.jsonl and indexes/pages.json
- mapping.json and review.json

The manifest files list covers every member except itself; editionFiles adds its exact identity for wrapping and transfer. No sender absolute input path is required by a recipient.

References carry editionId, sourceId, fileSha256, recordOrdinal, byteStart, byteEnd, eventId, eventKey, contentSha256, mappingRevision and disposition. Byte ranges are zero-based start-inclusive/end-exclusive in the original file. File ordinals include NDJSON blank lines; report-row cursors do not.

Review functions:

- validateReviewedEdition(manifest) returns that manifest or throws. It requires a confirmed named review and 1–1,000 classified, resolved evidence selections. Source completeness remains a separate visible status.
- selectedEventReferences(manifest) returns the exact references with editionId attached.
- reviewedSelection(manifest,{editionId,reviewId,eventKeys}) returns schema curity.reviewed-selection/v1 with events and the frozen source/configuration context.
- compareEditions(before,after) compares reviewed selections and flags identity/content, source occurrence, mapping, configuration and coverage changes. Its scope is explicitly REVIEWED_SELECTION, not a claim to compare every audit record.
- compareReturn(manifest,actual) compares per-event returned source bindings and files. It preserves the actual return source identity and reports every omitted, unexpected, repeated or changed selected occurrence.

A returned envelope contains kind per-event or bulk-acknowledgment, sourceReturn {sha256,bytes}, editionId, reviewId, case {id,revision} and optional events. Each per-event entry contains sourceRef, disposition, targetId, caseId, caseRevision and files [{sha256,bytes}]. A bulk acknowledgment remains UNVERIFIED_DETAIL; it never demonstrates per-event preservation or invents target event IDs. The SF74 case has no synthetic per-audit-event table, so its actual package comparison may truthfully lack target event IDs while proving complete companion hashes.

## Existing case and portable receiving

The Curity bridge uses SF74's original CaseStore revisions, artifact retention and native source-package receiver. It never inserts an arbitrary seventh source slot. The full audit edition remains a provider companion bound to the existing case, incident/source identities and reviewed selection.

Case changes are explicit and revision guarded. Following edits compare the accepted baseline to fresh staff state. Rollback changes only still-matching selected fields, preserving other staff work. Receiving uses the native returned case ID and revision. Imported incident bindings remain passive until the recipient selects the local original service.

The operator, case bridge and portable receiver are documented in OPERATOR.md. The complete original-service commissioning programme is documented in COMMISSIONING.md.

## Publisher example and actual acceptance

publisher-inputs.json transcribes the two original examples in Curity's Logging Best Practices page. Field values are exact; JSON formatting is our retained source representation, not a claim that original HTTP response bytes were acquired. It is labeled PUBLISHER_EXAMPLE throughout.

Original primary sources:
- https://curity.io/resources/learn/logging-best-practices/
- https://curity.io/docs/identity-server/system-and-operation/operation-and-monitoring/audit-logging/
- https://curity.io/docs/identity-server/facilities/event-listeners/

Source interpretation, worked publisher execution, installed supplier execution and commercial acceptance remain distinct. No customer log, Curity installation, payment, award or customer acceptance is established by these source files.
