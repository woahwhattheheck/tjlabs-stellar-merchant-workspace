# Publisher document evidence

Operate selected IATI organisation document links in the existing aid-finance workspace. Keep the original publisher XML, exact document URL, every explicit HTTP observation, named review, and following recipient work together.

This component extends the original organisation planner. It uses the same database, writer lease, authenticated console, installed source declaration, and complete-packet machinery as the existing organisation, Results, refresh, reconciliation and AMP workflows.

## What the operator delivers

- A frozen selection of up to 500 document rows from one saved organisation plan revision and source/candidate view.
- Exact published URLs, titles, categories, languages, organisation identities, native row IDs and native URL-edit targets.
- Bounded public HTTP acquisition, one explicitly selected URL at a time, with original request identity, actual redirect/address/header evidence and complete or partial response bytes.
- Named document decisions and an explicit URL-correction request for the original organisation planner.
- Comparisons between saved evidence editions, including changed complete bodies, changed metadata and indeterminate captures.
- Full HTML and CSV reports, every declared response body, immutable histories and a portable packet containing the original parent organisation history and installed operator source.

A successful fetch establishes what this request received. It does not establish that a document is relevant, accurate, authentic, licensed for reuse, or accessible to every reader. The named reviewer makes those decisions.

## Open the original workspace

Use the maintained IATI Applications provider or native command:

~~~sh
python3 /ABS/IATI/cli.py --workspace /ABS/PRIVATE/WORKSPACE serve \
  --connection-file /ABS/PRIVATE/console.url
~~~

Open the private console URL printed by that process, then choose **Document evidence**. The page shares the original session and organisation planner. The URL contains a private bearer fragment; keep it out of reports, source repositories and customer messages.

The connected command borrows the running console:

~~~sh
node /ABS/IATI/document_evidence_client_cli.mjs \
  --connection-file /ABS/PRIVATE/console.url status
~~~

The native command operates a closed workspace directly:

~~~sh
python3 /ABS/IATI/cli.py --workspace /ABS/PRIVATE/WORKSPACE \
  document-evidence-status
~~~

Do not open a second native writer while the original console owns the workspace. Connected commands use that running owner.

## 1. Freeze a document selection

Choose an existing organisation plan, its exact positive revision, and its source or candidate view. Read the complete document pages using the original organisation API; keep their returned snapshot identity. Select actual row IDs from those pages.

An evidence plan freezes that source selection. Later notes, acquisitions and reviews create evidence revisions without changing it. To inspect a later organisation edition or different documents, save a new evidence plan and compare the two explicit selections.

~~~json
{
  "requestId": "publisher-document-selection-001",
  "name": "Publisher planning documents — selected edition",
  "selection": {
    "id": "<original organisation plan SHA256>",
    "revision": 1,
    "view": "candidate",
    "expectedSnapshot": "<original document page snapshot SHA256>"
  },
  "documentRowIds": ["<actual document row SHA256>"],
  "limits": {
    "maxBytes": 16777216,
    "timeoutSeconds": 60,
    "connectTimeoutSeconds": 10,
    "maxRedirects": 5
  },
  "notes": "The selected publisher documents and the purpose of this review.",
  "actor": "Named operator"
}
~~~

~~~sh
python3 /ABS/IATI/cli.py --workspace /ABS/PRIVATE/WORKSPACE \
  document-evidence-save --file /ABS/INPUT/selection.json
~~~

The connected CLI uses the same complete input with command **save --file**. It preserves the complete posted object and request ID.

## 2. Observe one exact URL

An observation selects one or more saved rows sharing the **identical literal published URL**. The engine makes one request for those rows. It does not crawl the document or follow unrelated links.

~~~json
{
  "requestId": "publisher-document-observation-001",
  "id": "<saved evidence plan SHA256>",
  "expectedRevision": 1,
  "rowIds": ["<selected document row SHA256>"],
  "actor": "Named operator"
}
~~~

Use **document-evidence-observe --file** natively or **observe --file** through the connected CLI. The browser can process a locally selected queue one URL at a time. **Stop after current URL** stops after the current observation settles; it does not falsely mark an in-flight request cancelled or complete. Reopening a page does not automatically resume its queue.

If any selected row has earlier evidence, the new input must explicitly set **acknowledgeNewObservation: true**. The new request ID records a new network observation and retains all earlier observations.

| Limit | Default | Permitted range |
|---|---:|---:|
| Retained body bytes per request | 16 MiB | 1 byte–64 MiB |
| Whole acquisition deadline | 60 seconds | 1–120 seconds |
| Individual connection deadline | 10 seconds | 1–30 seconds |
| Redirects | 5 | 0–10 |

Each evidence plan has a 1 GiB retained-body budget, counting every distinct body SHA once across its observations. A new observation requires enough remaining room for its full selected byte bound. Repeated identical bytes do not consume a second retained-body allocation.

The carrier rejects credential-bearing URLs, non-HTTP(S) schemes, malformed or whitespace-containing literal URLs, local/special addresses, mixed public/private DNS answers and HTTPS downgrades. Every redirect is revalidated. Connections pin an approved public address; TLS still verifies the original hostname. It sends no cookies, credentials, referrer or authorization, uses no proxy, and performs no automatic retry.

## Completion has two separate meanings

**body.complete** means the complete HTTP message body arrived after transfer framing. Content-Encoding is retained and is not transparently decompressed. The SHA256 describes those exact captured bytes.

**documentComplete** requires a complete successful response and excludes 204, 205, 206 and any Content-Range response. It is a technical prerequisite for a usable review, not an automatic relevance or authenticity decision.

| State | Retained evidence |
|---|---|
| COMPLETE | The full actual HTTP message body; success/error status remains separate. |
| TRUNCATED | The exact retained prefix at the selected byte limit. |
| FAILED | Actual failed-transfer evidence and any returned body prefix. |
| REFUSED | The exact rejected URL/policy result and any earlier actual redirect responses. |
| INTERRUPTED | The reserved request and identifiable bytes recovered after its process ended without a terminal receipt. |

A zero-byte temporary can predate an HTTP response. A published body file without a committed receipt is still interrupted evidence. Neither is promoted to a completed observation.

A 404 can supply complete HTTP error evidence. A 206 can be a complete HTTP message carrying only part of a document. Prefixes, ranges and different encodings are indeterminate for whole-document comparison.

## 3. Recover the same request

The engine commits an ACQUIRING reservation before network activity. It freezes the request body, plan revision, literal URL, limits and operator. A same-ID call with changed input is rejected.

After a lost response, query the original request:

~~~sh
python3 /ABS/IATI/cli.py --workspace /ABS/PRIVATE/WORKSPACE \
  document-evidence-request --request-id publisher-document-observation-001
~~~

The connected equivalent is **request --request-id**. While the original capture runs, the result remains ACQUIRING. A recorded response reopens the exact historical plan and observation even after the current plan advances.

If the acquiring process ended, the original workspace lease establishes it no longer runs. Reopening reconciles its reservation to INTERRUPTED and retains identifiable bytes as incomplete. It never silently refetches. Another acquisition requires a new explicit request and acknowledgement.

The carrier's private temporary and final-file hard-link boundary are handled as one interrupted byte source only when their inode, permissions, length and stable contents agree. Unrecognized or ambiguous files stay in original custody.

## 4. Record a named review

Save one decision for every selected document row:

- **usable** selects an actual linked observation with documentComplete true.
- **needs_correction** selects the observation and describes the issue; it can propose a complete replacement URL.
- **not_applicable** explains why the document is outside the selected purpose.
- **deferred** explains what remains unresolved.

Not-applicable and deferred decisions may reference no observation. Every non-usable decision requires a note. The review binds the exact document and observation set. A new acquisition clears it; a note/name-only revision preserves it.

An explicit correctedUrl belongs only to a needs-correction decision. It must differ from the original literal URL and is not applied automatically.

Use **document-evidence-review --file** or connected **review --file**. The browser retains its exact request and review draft across a same-workspace reconnect.

## 5. Prepare the original URL correction

Read **document-evidence-correction --id SHA --revision N**. The result identifies the exact evidence/review, original organisation plan/revision, every reviewed row/observation/native attribute target, current organisation revision, rebase requirement, complete original save request and request hash.

The draft appends original URL-attribute edits to the selected parent's cumulative edit sequence. It preserves source, assessment, acquisition, organisations and notes. It does not create another XML editor.

If the selected source view predates existing candidate edits, select and review the candidate view first. A later organisation revision remains current: the prepared request keeps its original expectedRevision, and the original planner rejects a stale new write.

~~~sh
python3 /ABS/IATI/cli.py --workspace /ABS/PRIVATE/WORKSPACE \
  document-evidence-file --id SHA --revision N --kind correction \
  --out /ABS/OUTPUT/organisation-url-correction-request.json
~~~

Review that complete request, then submit it through the existing organisation command or UI. The normal organisation review and release remain separate steps. Evidence acquisition and document review never publish or change XML.

## 6. Compare exact editions

Select explicit evidence plan IDs and revisions for before and after. Omitted rowPairs pairs only original document rows whose identity survives their cumulative edits. Different sources or divergent structural removal/organisation replacement require explicit one-to-one pairs.

An explicit empty rowPairs array suppresses pairing. Unpaired rows remain added/removed; they do not become zero or missing-body equality.

A comparison retains full before/after rows and metadata/review/observation changes:

- **same**: complete document responses have equal captured-body SHA256 under the same Content-Encoding.
- **changed**: comparable complete document responses have different body SHA256.
- **indeterminate**: either response is incomplete, a range, error/non-document response, absent, or encoded differently.
- **added / removed**: an unpaired selected document row.

Comparison makes no HTTP request. Its saved comparison ID can be reopened directly.

## 7. Deliver and receive complete work

The browser verifies Content-Length and X-Content-SHA256 before saving report, register, plan, correction, body and ZIP downloads. Retrieved HTML/PDF bodies are downloaded as bytes; the operator does not execute publisher responses inside its own session.

Connected export:

~~~sh
node /ABS/IATI/document_evidence_client_cli.mjs \
  --connection-file /ABS/PRIVATE/console.url export \
  --id SHA --revision N --out /ABS/OUTPUT/evidence.zip
~~~

Native export:

~~~sh
python3 /ABS/IATI/cli.py --workspace /ABS/PRIVATE/WORKSPACE \
  document-evidence-export --id SHA --revision N \
  --out /ABS/OUTPUT/evidence.zip
~~~

Connected receive:

~~~sh
node /ABS/IATI/document_evidence_client_cli.mjs \
  --connection-file /ABS/PRIVATE/console.url receive \
  --file /ABS/INPUT/evidence.zip
~~~

Native receive:

~~~sh
python3 /ABS/IATI/cli.py --workspace /ABS/PRIVATE/WORKSPACE \
  document-evidence-receive --file /ABS/INPUT/evidence.zip
~~~

The browser packet limit is 64 MiB. Larger packets use the streaming connected/native command. The complete-packet capacity is 4 GiB expanded, up to 16,384 declared members; metadata records are bounded to 64 MiB.

The archive contains selected evidence revisions, every original recorded request, linked comparisons, original organisation packets, every declared body or prefix, readable reports and the installed IATI source declaration. Receiving verifies names, capacities, lengths, hashes, immutable histories, source selection and reconstructed transitions. It uses installed code only.

Receiving returns the selected imported plan and latest currentPlan separately. An old packet can be received again after the recipient adds a note or review; that later revision remains current. Receive has no synthetic request ID: its identity is the complete packet. After an uncertain upload response, use the same bytes.

A definitive rejection is retained with the exact packet descriptor and error. Original verified parent-source joins can survive a later conflict; a rejected import is not described as a rollback. Refresh saved work before explicitly choosing a different packet.

## API and integration

All routes use the original authenticated console under **/api/iati/document-evidence/**.

| Read | Selection |
|---|---|
| status | None |
| plan | id; optional revision |
| history | id |
| request | requestId |
| rows | id, revision; optional offset, limit, expectedSnapshot |
| detail | id, revision, rowId; optional expectedSnapshot |
| observation / comparison | id |
| correction | id, revision |
| file | id, revision, kind=report/register/plan/correction |
| body | observationId |
| export | id; optional revision |

JSON actions are save, note, observe, review and compare. Each complete request includes stable requestId and named actor. Raw receive consumes one ZIP with no request ID.

The connected SDK is IatiWorkspaceClient.documentEvidence. It borrows the existing request transport. Merchant uses configured IATI workspace aliases and the original retained-file read/release mechanism. The connected CLI hashes streamed downloads before exclusive final-file publication.

The native workspace.document_evidence model shares the existing database and mutex. It releases the mutex during bounded acquisition; closing drains active acquisitions before the original database closes.

## Existing ODS opportunity and source context

This is a reusable technical addition for the existing Open Data Services Co-operative opportunity. Its original company owner, sent introduction, 360Giving scope and price remain authoritative. This source creates no second company claim or contact.

ODS describes its IATI data/technology work, document access and publisher guidance in its first-party State of the Data project:
https://opendataservices.coop/work/making-sense-of-what-development-and-humanitarian-data-enables-in-practice/

Its existing IATI CoVE service remains the original conversion/validation workflow:
https://iati.cove.opendataservices.coop/

Use customer-selected XML and purpose-specific named review alongside those services. An accessibility observation is distinct from IATI schema validation, relevance assessment and the customer's publishing decision.
