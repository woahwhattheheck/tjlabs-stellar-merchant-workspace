# TIND scholarly migration

The TIND migration workspace receives an original reviewed OAI edition, maps its metadata to ordered MARCXML, reconciles DOI and OAI identifiers against the selected TIND institution, and prepares immutable native batches. Staff can edit complete records, preserve destination changes, retain file access decisions, receive actual native results and move the complete editable workspace to another operator.

The selected product includes the original OAI intake application, the TIND operator desk, their source and browser assets, the managed Applications entry and the maintained runtime installer. Both applications open the same original repository workspace. Close one before opening the other; the shared workspace lease is also respected by Applications.

## Install and open

Use Linux, Node.js 22.16 or newer, Python 3.11 or newer, npm and util-linux `flock`. The original XML reader requires Expat 2.6 or newer; select the existing Python environment with that parser. Keep the source checkout, installed runtime, private workspace, source files and exported handovers in separate directories.

In the Runtime workspace, choose **Build a product → TIND scholarly migration**, select the full source commit and a new output directory. The equivalent original command is:

```sh
node /absolute/checkout/stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/checkout \
  --ref ORIGINAL_FULL_COMMIT \
  --selection tind-migration \
  --out /private/releases/tind
```

Use the archive path and SHA-256 returned by that operation:

```sh
node /absolute/checkout/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /private/runtimes/tind-01 \
  --archive /private/releases/tind/ACTUAL_ARCHIVE.tgz \
  --sha256 ACTUAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator

node /absolute/checkout/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /private/runtimes/tind-01

node /absolute/checkout/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /private/runtimes/tind-01 --load --source

node /absolute/checkout/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /private/runtimes/tind-01 -- source
```

The installation result supplies the original source and dependency roots. A stopped dependency installation continues with `runtime-install resume --dir /private/runtimes/tind-01`. Prepare upgrades in a new runtime directory and retain the original runtime for the maintained activation and recovery workflow. See [Runtime installation](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md).

The installed `starforge` command forwards to the selected original source:

```sh
starforge tind-migration --python /absolute/python --workspace /private/repository init
starforge tind-migration --python /absolute/python --workspace /private/repository serve --port 8894
```

Use `init` once for a new directory. An existing OAI workspace opens directly with `serve`. The launch result gives the private local URL. The browser runs on `127.0.0.1` with the selected launch session; retain that complete link privately. The Node wrapper also accepts `SF30_OAI_PYTHON` or `SF30_XML_PYTHON` for the original Python executable.

### Managed Applications

Choose **TIND scholarly migration** in Applications. Select the original private repository directory, actual Python executable, desired local port and optional existing environment file. Review and start the prepared application. The maintained lifecycle binds the original workspace directory and marker, Python identity, OAI/XML/TIND source and selected runtime. The returned console link opens this same operator desk.

A source or Python upgrade is reviewed through a new application preparation. The application resource key is shared with the original XML/OAI workspace, which prevents two managed applications from owning the same database concurrently.

## Receive the original repository edition

The original OAI application retains the actual repository responses, continuation tokens, metadata format, selection, observation history, explicit deletion headers and staff-reviewed editions. Open it against the same stopped workspace:

```sh
starforge oai --python /absolute/python --workspace /private/repository serve --port 8893
```

For command operation, add the actual repository URL, start the exact OAI request and continue its original operation ID:

```sh
starforge oai --workspace /private/repository repository \
  --url https://actual-repository.example/oai --label "Institution repository" --interval 2.1

starforge oai --workspace /private/repository start \
  --repository ORIGINAL_REPOSITORY_ID \
  --verb ListRecords --arguments /private/list-records-arguments.json \
  --id ORIGINAL_HARVEST_OPERATION

starforge oai --workspace /private/repository run --id ORIGINAL_HARVEST_OPERATION
starforge oai --workspace /private/repository preview --id ORIGINAL_HARVEST_OPERATION
```

A selection document contains the publisher's actual supported arguments, for example `{"metadataPrefix":"oai_dc","set":"ACTUAL_SET_SPEC"}`. Omit `set` for a complete repository selection. Use the preview's actual digest when accepting the original edition:

```sh
starforge oai --workspace /private/repository review \
  --id ORIGINAL_HARVEST_OPERATION --expected ACTUAL_PREVIEW_SHA256 \
  --reviewer "Actual operator" --note "Original repository selection and source changes reviewed"
```

For an interrupted harvest, use `resume --id ORIGINAL_HARVEST_OPERATION`. The original intake can also receive a complete response captured by the existing native caller with `import-response --body ORIGINAL_XML --transport ORIGINAL_TRANSPORT_JSON`; transport records retain the observed URL, HTTP status, headers, final URL and time.

In the TIND desk's **Migration** tab, create a migration from that reviewed edition and the exact TIND institution origin. The source edition and native destination selection remain distinct. The edition chooser can page through the complete retained edition history.

A later incremental edition continues the same original repository, metadata prefix and set. In **Migration**, choose **Receive updated edition**. Existing staff decisions and last delivered baselines remain attached to their source identifiers. A source deletion is taken from its explicit OAI header; a record missing from an unrelated selection does not silently remove the earlier source.

## Map and edit metadata

The initial profile maps Dublin Core to an editable MARC record. **Mapping** exposes the complete profile JSON, including source paths, field indicators, subfield codes, value selection, transforms, constants and batch size. Namespace paths use their exact expanded XML names.

| Original field | Initial destination mapping |
| --- | --- |
| First title | `245 00 $a` |
| Further titles | `246 3_ $a` |
| First creator | `100 1_ $a` |
| Further creators and contributors | Repeated `700 1_ $a` |
| Subjects | Repeated `650 _4 $a` |
| Description | `520 __ $a` |
| Publisher and publication date | `260 __ $b` and `260 __ $c` |
| Type, format and language | `655 _4 $a`, `500 __ $a`, `546 __ $a` |
| Original rights wording | `540 __ $a` |
| Source relationships | `787 0_ $n` |
| DOI | `024 7_ $a` plus `$2 doi` |
| Other source identifiers | `035 __ $a` |
| Original OAI identifier | `909 CO $o` |

An underscore in this table means a literal blank MARC indicator. The profile stores the actual blank character. Repeated fields and subfields keep their order. The mapping rules can select the first, remaining or all source values; DOI transforms retain normalized identifiers for reconciliation.

Use **Records** to search the complete migration and open a record. The editor shows original source identity and date, current mapped source, previous delivered source, native destination, proposed result, source files and remaining decisions. **Original OAI observation** opens the retained source document.

The complete editable MARC JSON is available in the record editor. A saved override becomes an attributed staff record and retains its DOI/OAI identity in the source index. **Reset to mapped source** returns that record to the current mapping rules. Destination `001` is selected separately so a source edit cannot accidentally assign another institution's generated record ID.

### Destination edits and identifier reconciliation

Receive a complete native destination export before preparing new records. The workspace matches DOI and OAI identifiers against the native `001` records. Multiple candidates and duplicated active source identifiers remain visible in the record editor; choose the intended native record or exclude the duplicate source entry.

For an existing destination record, merging works on complete ordered groups of fields and indicators. The three inputs are the last delivered source, the newly mapped source and the latest native destination. Destination-only metadata is retained. Unchanged source groups preserve current destination edits. A group changed on both sides requires the staff choice **Current source**, **Current native destination** or **Complete custom field group**, with the reason.

Each field decision binds the exact three input groups. If the source or native export changes, the editor presents the new comparison. Generated native `001`, `005` and file-related `856` metadata remain attached to the actual destination record.

TIND's release 24 documentation identifies duplicate DOI `0247_a` and OAI `909COo` checks during record creation. Reconcile these identities before sending a create request; keep each article and its full issue under their own original identifiers. See [TIND release 24](https://info.tind.io/roadmap/24.0.0-ils).

### Journal and access decisions

The staff editor keeps journal title, volume, issue, pages, native parent record ID, ISSN and relationship separately. These produce ordered `773 0_` host-item subfields. Source dates and citations stay in their original fields; an issue label does not replace an article's publication date.

Metadata visibility and file visibility are separate decisions. File options are public, restricted, embargoed, none and unreviewed. Preserve the source's restriction wording. An embargo records its actual release date; an indefinite campus restriction keeps its restriction wording without inventing a release date. Record the original license URI when present.

Access decisions are retained with the frozen record and each original file. Use the selected native institution's permission and embargo settings when receiving those files. MARC rights text, metadata visibility and file permissions each retain their own operational meaning.

## Source cases and complete staff review

Use **Source cases** to turn an original observation collection into reviewed repository records. A collection can contain access terms, explicit release dates, creator and advisor roles, named ORCID assignments, journal relationships, licence terms and source discrepancies. Every case retains its original page or export URLs and observation date.

The desk matches exact identifiers, landing URLs and DOIs against the original OAI observation in the selected migration. It compares identifier elements, including the original OAI header; a DOI mentioned in an abstract does not identify that source record. HTTP and HTTPS forms of the same landing URL share an identity, with the host normalized and a trailing slash ignored. Paths and query arguments retain their original meaning. A case with multiple original matches requires an explicit selection. An unmatched case remains visible while the original intake receives its source edition.

### Receive and review a collection

1. Import the complete `stellar-forge.tind-source-cases.v1` JSON document. The original submitted JSON values and the normalized working collection are retained separately. The intake reports single, unmatched and multiple identity matches.
2. Open the collection and inspect each case's complete source facts. Choose the actual original record for each selected case, then choose **Prepare selected staff records**.
3. Review the complete editable input. The proposed MARC starts from the current complete source record, including any existing staff override. Source supplements add fields and enrich the matching personal name entry with its explicit role, named ORCID and affiliation. Existing metadata stays present. Repeated matching names or different ORCIDs appear as review notes; inspect the full name entries before saving.
4. Review proposed metadata visibility, file restrictions, release date and journal hierarchy. Keep an explicit release date separate from a degree or publication date. Keep an indefinite or undated restriction's release date empty until its original policy supplies a date. Date discrepancies and unassigned identifiers remain in the source facts.
5. Review `filePolicies`. Each entry selects an existing original file by its ID, SHA-256 and byte length. Set `apply` to `true` for the files whose role or access should change. Other files retain their current policies. A changed policy preserves earlier native observations so the file receiving desk can compare the new desired policy with the actual last native result.
6. Enter the reviewing operator and decision note, then save the selected cases. The save uses the revision at which the plan was prepared and retains the exact original observation IDs. If the source or working migration has changed, prepare the current records again.
7. Continue in **Records and decisions**, **Native export and files**, and **Batches and delivery**. Each saved case review has a complete download containing its collection identity, original source observations, before/after staff decisions and selected file-policy changes.

When the proposed MARC is accepted without additional manual edits, the saved staff record retains a reference to its source-case supplement. Subsequent repository editions remap their complete current source and reapply those reviewed fields. A deliberate complete MARC edit stays as the existing editable override. Differences in repeated names or assigned ORCIDs on a later source edition appear in the normal record decisions.

The entire collection and its review history travel with the existing editable handover. An exported staff draft includes the migration, collection and revision, and can be received again in this collection after restoring the complete workspace. Drafts remain editable before they are saved. Pending saves use the same durable browser request and operation ID as every other TIND mutation.

### Source collection format

The top-level fields are `schema`, `title`, `observedOn`, optional `context`, and `cases`. `observedOn` is the original date in `YYYY-MM-DD` form. `context` retains original case source identifiers or acquisition details as JSON values. Each collection contains 1–250 cases, and the complete encoded save body must fit within 8 MiB.

| Case field | Contents |
| --- | --- |
| `caseId`, `title` | Stable case identity and original source title. |
| `sourceUrls` | Original public page or authorized export URLs. |
| `match` | Arrays named `identifiers`, `urls` and `dois`; use the actual original values. Omitting `match` uses `sourceUrls`. |
| `facts` | Complete original factual observations, including unresolved dates or person assignments. |
| `proposedAccess` | The existing access object: `metadata`, `files`, `releaseDate`, `restriction`, `licenseURI`. |
| `proposedHierarchy` | Existing `journalTitle`, `volume`, `issue`, `pages`, `parentRecordId`, `issn` and `relationship` fields. Native parent IDs are retained only when the selected destination supplies them. |
| `people` | Ordered entries with `name`, `role`, and optional `aliases`, `orcid`, `affiliation`, `nameIndicator` and `mainEntry`. Attach an ORCID only to its explicitly identified person. |
| `fields` | Ordered supplemental MARC data fields with `tag`, `ind1`, `ind2` and `subfields`. Native control, file and OAI identity fields remain outside this supplement. |
| `notes` | Ordered original observation and mapping notes. |

People use the same MARC `100`/`700` model as the original source mapping. `$e` retains the role, `$1` the person's ORCID URI, and `$u` the original affiliation. Existing exact name spellings are retained; reviewed aliases help recognize an existing entry. The collection validates ORCID check digits before proposing a person field. [MARC personal names](https://www.loc.gov/marc/bibliographic/bd700.html) describes those subfields.

Access restrictions and reuse terms stay separate. MARC `506` carries restrictions, authorized users and the explicit availability date; its `$g` prefers `YYYYMMDD`. MARC `540` carries licence or reuse terms and their original URI. The working access object's date remains `YYYY-MM-DD`. See [MARC 506](https://www.loc.gov/marc/bibliographic/bd506.html) and [MARC 540](https://www.loc.gov/marc/bibliographic/bd540.html).

### Command operation and retained downloads

The same complete source-case workflow is available through the original command. Save a regular operation request whose `kind` is `source-cases` and whose `input` is `{"document": COMPLETE_SOURCE_COLLECTION}`, using the current project ID and revision:

```sh
starforge tind-migration --workspace /private/repository apply \
  --request /private/source-case-intake-request.json

starforge tind-migration --workspace /private/repository source-cases \
  --project ACTUAL_PROJECT_ID --offset 0 --limit 50

starforge tind-migration --workspace /private/repository source-case \
  --project ACTUAL_PROJECT_ID --id ACTUAL_COLLECTION_ID
```

Write the selected actual bindings as `[{"caseId":"ACTUAL_CASE_ID","identifier":"ACTUAL_ORIGINAL_IDENTIFIER"}]`. Prepare complete staff records in one original operation:

```sh
starforge tind-migration --workspace /private/repository source-case-plan \
  --project ACTUAL_PROJECT_ID --id ACTUAL_COLLECTION_ID \
  --choices /private/original-case-bindings.json
```

The returned `input` is the complete editable case review. Set each reviewing operator and note, edit the desired fields, then save it with `kind: "source-case-review"` and the returned `revision`. The normal apply command retains the same operation-ID replay behavior.

```sh
starforge tind-migration --workspace /private/repository source-case-reviews \
  --project ACTUAL_PROJECT_ID --id ACTUAL_COLLECTION_ID --offset 0 --limit 50

starforge tind-migration --workspace /private/repository source-case-review \
  --project ACTUAL_PROJECT_ID --id ACTUAL_REVIEW_ID

starforge tind-migration --workspace /private/repository source-case-export \
  --project ACTUAL_PROJECT_ID --id ACTUAL_COLLECTION_ID
```

Collections and reviews are paged independently. Original source files, current migration records, native snapshots and file results keep their existing complete downloads.

## Receive or continue the native export

In **Destination and files**, receive the full native MARCXML export with its actual source URL, retrieval timestamp including timezone, selection, exact record count, operator and completeness flag. Record the native field coverage, actual export permissions and selected instance version separately. The parser requires native record `001` identities and rejects duplicate native records. Count and original-byte identities are retained with the snapshot.

A complete set of public search pages can still omit suppressed fields. Native replacement uses an export covering the complete selected record fields and retains the actual staff/export permissions that supplied them. Public or selected-field snapshots remain available for source comparison and record inspection. TIND release 1.16 separately documents authenticated record/file APIs and configured submission dashboards; a MARC import and the journal submission workflow retain their distinct native settings. See [TIND release 1.16](https://info.tind.io/roadmap/1.16.0).

The browser save envelope is limited to 8 MiB, including JSON escaping and the operation fields. For a larger original export, use a local file operation so the XML bytes stay outside the JSON envelope:

```json
{
  "operationId": "institution-export-001",
  "kind": "destination-file",
  "projectId": "ACTUAL_PROJECT_ID",
  "expectedRevision": 1,
  "input": {
    "path": "/private/exports/actual-native-export.xml",
    "provenance": {
      "url": "https://actual-institution.tind.io/search?of=xm",
      "retrievedAt": "2026-10-12T16:00:00Z",
      "scope": "Actual complete native selection and permissions",
      "recordCount": 0,
      "complete": true,
      "fieldCoverage": "complete",
      "authority": "Actual staff role and export visibility covering this selection",
      "instanceVersion": "ACTUAL_INSTANCE_VERSION",
      "reviewer": "Actual receiving operator"
    }
  }
}
```

Replace the example timestamp, count, project ID and revision with the actual export and current state. The direct-file import accepts a complete metadata object up to 256 MiB. For larger populations, use the paged native export.

### Paged native search

The hosted native search interface uses `/search` with `of=xm`, one-based `jrec` and requested page size `rg`. Choose the actual collection/search arguments in the form. The exporter retains each original response and advances by the number of records actually returned. It continues to an actual empty MARCXML page, including when the native server returns fewer records than the requested page size.

```sh
starforge tind-migration --workspace /private/repository native-search \
  --project ACTUAL_PROJECT_ID --id ORIGINAL_NATIVE_EXPORT_ID \
  --selection /private/tind-search-selection.json \
  --page-size 100 --interval 2.1 \
  --export-context /private/tind-export-context.json \
  --authorization-env EXISTING_TIND_AUTHORIZATION
```

The selection document is an object of literal native query arguments, such as `{"p":"collection:ACTUAL_COLLECTION"}`. The exporter owns `of`, `jrec` and `rg`. Its original hosted interface is documented by the [native search help](https://worldveg.tind.io/help/search-engine-api).

The export-context file records `fieldCoverage` (`public`, `selected` or `complete`), `authority` (the actual native export permissions) and `instanceVersion`. An omitted context retains the public hosted-search scope. The actual complete field context is required when preparing native replacement.

The authorization environment value is the complete existing HTTP Authorization header. The workspace records the environment variable's name, keeping its value in the original process environment. Redirects are not followed with that authorization. Public exports omit the authorization option.

After a provider error, the saved export remains at its current offset with the original response. **Continue this same native export** resumes that exact operation. A repeated native record or moving-page conflict retains the original pages and explains the changed membership, so staff can choose a fresh complete native selection.

## Receive source files

A file row binds the exact source record identifier, stable source file ID, original filename and role, media type, exact SHA-256, byte count, original URL or relative local path, and its access decision. Import a JSON array in **Source file manifest**. Up to 5,000 complete rows fit in one transaction, within the whole 8 MiB save limit.

```json
[
  {
    "identifier": "ACTUAL_OAI_IDENTIFIER",
    "id": "original-main-document",
    "filename": "actual-document.pdf",
    "role": "article",
    "mediaType": "application/pdf",
    "sha256": "ACTUAL_64_CHARACTER_SHA256",
    "bytes": 123456,
    "path": "journal/volume/issue/actual-document.pdf",
    "url": "https://actual-source.example/original-file",
    "access": {
      "metadata": "public",
      "files": "embargoed",
      "releaseDate": "2027-06-10",
      "restriction": "Original restriction wording",
      "licenseURI": ""
    }
  }
]
```

The values above illustrate the complete row shape; retain the publisher's actual date, terms, file identity and byte count for each file.

Select the original local file directory with **Bind source directory**, then **Verify original bytes**. The workspace binds the directory's real device/inode identity and hashes regular files by streaming their bytes. Relative paths remain inside that original directory. A single original file can be up to 1 TiB.

The same file identity preserves its prior source-byte observation and native destination result when a staff manifest edit changes its description or access terms. The original native observation keeps its own role, access terms and time. The receiving desk compares that observation with the current planned file, so a changed access policy remains visible even when the bytes still match. A changed file hash or byte length receives its own current byte check and native file result.

### File receiving desk

In **Destination and files**, use **Native file receiving** to search the complete file inventory. Each row shows the source record and filename, intended role/access, selected native record, byte result and attachment/access result. Pagination continues through the full retained inventory. **Receive result** opens the exact file in the receiving form. **Working file** downloads its complete editable record, and **History** opens the retained original native observations.

Byte receiving records the native record and file/object IDs, original native URL, actual SHA-256 and length, observation time, operator and complete returned text. Select **Include the observed native attachment role and access settings** when the actual native attachment and policy result is available. Record its role, metadata/file visibility, original release date, restriction wording and licence URL, together with its separate observation time, native source URL and original returned text.

The byte observation and attachment observation retain their own source text. A later byte observation for the same native object preserves an earlier attachment observation with that observation's original timestamp. Each complete file result has its own retained ID and remains available through history. Current source file edits therefore preserve the earlier native history while exposing any difference in intended access or role.

The local commands expose the same complete file desk:

```sh
starforge tind-migration --workspace /private/repository files \
  --project ACTUAL_PROJECT_ID --query "original-file.pdf" --offset 0 --limit 50

starforge tind-migration --workspace /private/repository file-history \
  --project ACTUAL_PROJECT_ID --identifier ACTUAL_SOURCE_IDENTIFIER \
  --file ACTUAL_FILE_ID --offset 0 --limit 50

starforge tind-migration --workspace /private/repository file-receipt \
  --project ACTUAL_PROJECT_ID --id ACTUAL_FILE_OBSERVATION_ID
```

Use the returned `next` offset to continue each complete selection. A downloaded observation contains both original native response texts and their retained byte identities.

The `file-receipt` save operation accepts an optional `attachment` object with `role`, `access`, `observedAt`, `sourceUrl` and `original`. Its `access` object uses the same explicit `metadata`, `files`, `releaseDate`, `restriction` and `licenseURI` fields as the reviewed file. All values describe the observed selected institution; the original returned text retains the provider's native field names and values.

## Prepare, deliver and reconcile

In **Records**, select the intended source entries, or choose **Every ready record** in **Batches and delivery**. Record the actual preparer and batch scope. Explicit selections support up to 10,000 identifiers. Every-ready preparation streams the complete current population, records unresolved and excluded counts, and freezes only the ready records.

The frozen batch contains the source edition, native snapshot, mapping profile, project revision, complete staff records, access decisions, file rows and ordered MARCXML. Native XML is split at the selected record count, default 500, or 64 MiB. Complete JSON-line working records, file manifests and withdrawal records also split into bounded parts at record boundaries. File names and byte hashes appear in the batch inventory.

Download an individual native MARCXML file or the complete batch ZIP. The ZIP includes the frozen records and manifests plus subsequently received original native receipts and reconciliation reports. The complete editable workspace handover, described below, includes the original source files themselves.

### Native batch submission

Select one frozen MARCXML file and its current native request contract. The exact request document specifies:

| Field | Meaning |
| --- | --- |
| `batchId`, `file` | The retained batch and exact MARCXML member. |
| `url`, `method` | The selected institution's documented native endpoint and POST, PUT or PATCH method. |
| `encoding` | `raw` or `multipart`, as defined by the native contract. |
| `contentType` | Native content type for a raw body. |
| `fileField`, `fields` | Native multipart file field and literal accompanying fields. |
| `headers` | Literal non-secret native contract headers. |
| `documentation` | Original native article URL for the chosen contract. |

Use the institution's current [Batchuploader API](https://docs.tind.io/article/ivm6ow3pha-batchuploader-api) contract. A selected native mode such as insert-or-replace or append belongs in the actual native request fields defined there. The original batch configuration remains attached to its exact frozen XML.

The CLI uses the same native sender:

```sh
starforge tind-migration --workspace /private/repository native-send \
  --project ACTUAL_PROJECT_ID --id ORIGINAL_NATIVE_TRANSFER_ID \
  --request /private/actual-native-request.json \
  --authorization-env EXISTING_TIND_AUTHORIZATION
```

The sender retains its exact outgoing body before transport, saves the actual status/headers/response, and associates later native receipts with that same transfer. A network interruption leaves the operation's result available as unknown. Resume the existing native job observation before sending a replacement. The native batch and its original file remain identifiable throughout.

For large native objects, TIND's original file workflow has separate upload and receiving semantics. Use its current [direct object-storage upload article](https://docs.tind.io/article/u8l72x0kp2-beta-how-to-upload-files-directly-to-object-storage) with the original file manifest. File parts, native object IDs and the actual final native file bytes belong to that original file operation.

### Native results

Receive the actual batch uploader job ID, selected institution's job URL, observed timestamp, operator, original returned text and record results. Each record result identifies the exact source identifier and observed status: accepted, pending, failed or withdrawn. Accepted and withdrawn results include the native record ID; failed results retain the original error. A linked transfer ID joins this result to the original outgoing request.

Receive each actual native file result separately through the file receiving desk. The checksum and length must match the original retained file. Receive the actual attachment role and access observation as part of that same file result when it is available. Byte identity, correct native record association and observed role/access each appear in the current receiving state.

After native delivery, receive a current native destination export and choose **Reconcile current native export** on the batch. Reconciliation joins the frozen metadata, observed native record IDs, current native MARC groups and original file identities. It compares the union of reviewed native before-state groups and proposed groups, including groups removed by the source update. An update or withdrawal keeps the exact reviewed native record ID.

Each file is reconciled against the frozen batch's original byte identity, intended native record, attachment role and access/release terms. Results expose `fileBytesConfirmed`, `filePolicyConfirmed` and `filesConfirmed` separately; a complete file has both observed bytes and the matching attachment/access result. The batch records confirmed and remaining records with their concrete receiving issues. The complete batch ZIP includes original native file observations and their attachment/access source texts under `file-receipts/`.

Successful receiving updates the last delivered source baseline. Later source editions can therefore preserve staff edits in the destination. A staff decision edited after batch preparation remains the current working decision when the older delivery is reconciled; only the unchanged frozen decision receives the delivered target binding and cleared field choices. Repeated receiving does not duplicate deliveries, and an earlier batch cannot replace a newer delivered baseline.

A prepared batch can be withdrawn before native submission. A batch already sent continues through its original native result; a revised selection is frozen as a new batch. An explicit OAI deletion requires the staff withdrawal or exclusion decision and actual native withdrawal result.


## Continue destination jobs and receive original outcomes

Open **Destination jobs** after the original native transfer has been submitted or interrupted. Bind the actual job ID and its documented GET URL to that exact transfer. Retain the original documentation URL, literal non-secret headers, existing authorization environment name, operator and source note. The URL must belong to the selected TIND institution. Saving a changed current GET contract for the same original job retains its preceding contract, operator, source note and selection time. Earlier observations keep their exact original request. This binding describes the institution's actual contract; the application does not infer an endpoint from the MARCXML file name or assign meanings to undocumented status strings.

Choose **Read the original job now** to save one GET observation. It keeps the exact request, original HTTP status and headers, unchanged response bytes and observation time. A network error stays in the history; select another explicit read to observe the job again. An interrupted GET whose response never completed can resume under its same original observation ID after reopening. A returned HTTP error remains an observed response, with its bytes available for inspection.

If the institution's original authenticated browser or export has already returned the job response, receive its unchanged file and actual HTTP receipt in the same desk. The receipt contains `method: "GET"`, the exact requested `url`, returned `finalURL`, integer `status`, response `headers` as name/value pairs, and `observedAt` including timezone. Request credentials and session cookies are omitted from the saved response headers. This is the same original observation path as direct GET, with the source operator and acquisition note retained.

### Review the source and bind its record results

Choose an observation and read its complete original response. A successful HTTP response permits result interpretation; HTTP success alone does not mark records as accepted. Select the actual observed job state and either enter explicitly reviewed original record results or declare a JSON result mapping.

A reviewed record names its exact source `identifier` and the observed `accepted`, `failed`, `pending` or `withdrawn` state. Accepted and withdrawn records include their actual `nativeId`; a failed result retains its original `error`. Omit records not reported by this response. The receiver shows the number of unreported members of the exact transferred MARCXML file.

For a JSON response, the mapping declares `records`, `identifier`, `status`, optional `nativeId` and `error` JSON Pointers, plus `statuses`: a literal mapping from the returned strings to their reviewed meanings. The records pointer selects the original array; the other pointers select values within each original row. Empty pointer selects the complete value. Literal `~` and `/` in field names use RFC 6901's `~0` and `~1` escapes. An absent field, unknown status or record from another transferred file must be resolved in the original source before receiving.

Preview the complete result, enter the operator and interpretation note, then choose **Receive these reviewed outcomes**. The saved request binds the exact response identity, current project revision, selected mapping and complete result rows. Editing the source or interpretation requires another preview. The existing native receipt engine records these outcomes against the original batch and transfer. Continue that same batch through current destination export, original file/access receiving and reconciliation; the production wave reads its existing result.

### Reopen, download and command operation

Saved jobs, observations and reviews live in the same original SQLite database. Complete editable handover includes that database and every unchanged response object. Reopen the received migration, bind the existing local authorization environment when operating the original tenant, and select the saved job. **Download complete job history** streams its binding, original transfer, all observation metadata and bytes, and every receiving review and receipt into one archive. Its final file is published only after the complete archive is synchronized.

All lists expose `offset`, `limit` and `next`; continue until `next` is null. The browser lists jobs and observations independently. Original response and review JSON remain subject to the existing 8 MiB save envelope. The browser accepts a response file up to 6 MiB before base64 encoding; the complete envelope is checked before sending. Direct GET retains responses up to the existing object limit, and an oversized response remains downloadable while the operator selects the institution's actual narrower result page for interactive review.

~~~sh
starforge tind-migration --workspace /private/repository destination-jobs --project ORIGINAL_PROJECT_ID
starforge tind-migration --workspace /private/repository destination-jobs --project ORIGINAL_PROJECT_ID --id SAVED_JOB_BINDING_ID
starforge tind-migration --workspace /private/repository job-read --project ORIGINAL_PROJECT_ID --job SAVED_JOB_BINDING_ID --id ORIGINAL_READ_OPERATION
starforge tind-migration --workspace /private/repository job-preview --project ORIGINAL_PROJECT_ID --input /private/review-input.json
starforge tind-migration --workspace /private/repository job-export --project ORIGINAL_PROJECT_ID --job SAVED_JOB_BINDING_ID --out /private/original-job-history.zip
~~~

Use ordinary saved apply requests for `native-job-bind`, `native-job-import` and `native-job-receive`. The bind input is `{transferId,nativeJobId,url,documentation,headers,authorizationEnvironment,reviewer,note}`. The imported response input is `{jobId,bodyBase64,transport,reviewer,note}`. A preview input is `{jobId,observationId,status,mode,records,mapping}`, where mode is `reviewed` or `json`. Receiving uses that same exact input plus `expectedPreviewSha256`, `reviewer` and `note`. Preserve its saved operation ID and expected project revision when replaying a lost response.

The application owns all original native worker lifetimes. Closing stops further export pages, allows each current request to return or record its interruption, joins the owned workers and then closes the database. A complete workspace handover waits until the source/native worker is inactive. Submitted requests retain their original transfer identity throughout shutdown and recovery.

## Complete editable handover

In **Handover**, download the complete working package. The producer streams its SQLite backup, original OAI responses and reviewed editions, mappings, TIND source and browser assets, native export pages, exact native request/response objects, frozen batches, staff decisions and every retained source file.

```sh
starforge tind-migration --workspace /private/repository handover \
  --out /private/handover/institution-migration.zip
```

The complete package requires the original local file tree for every retained file row. To move the metadata workspace while a separate original file-tree transfer is in progress, explicitly choose the metadata-only package:

```sh
starforge tind-migration --workspace /private/repository handover \
  --metadata-only --out /private/handover/institution-metadata.zip
```

The manifest records whether source files are included. The receiving workspace retains all original file rows; a metadata-only receiver binds the actual transferred source tree before continuing byte operations.

Receive into a new private directory:

```sh
starforge tind-migration receive \
  --archive /private/incoming/institution-migration.zip \
  --destination /private/received/institution-migration
```

Receiving checks the complete archive membership, lengths and SHA-256 values, opens the original database in a staging directory, relocates complete file bindings and checks the native database before publishing the completed directory. It creates `received.json` with the handover identity. Repeating the same receive operation returns the existing received workspace and preserves subsequent edits.

Open the received original source directly:

```sh
python3 /private/received/institution-migration/source/oai-pmh/tind/cli.py \
  --workspace /private/received/institution-migration/workspace serve --port 8894
```

The returned source remains editable, including the original intake and the TIND browser and core. An installed Applications session can instead select the received workspace with the reviewed maintained runtime. The native launch binds whichever complete original source the operator selected.

### Capacity and working directories

| Item | Implemented allowance or behavior |
| --- | --- |
| Complete encoded save/import operation | 8 MiB; the browser counts UTF-8 bytes including the full envelope. |
| Original XML input / retained metadata object | 256 MiB, independently of the catalogue database. |
| Original XML record | 16 MiB through the original reader. |
| Retained catalogue database at reopen | 4 GiB, matching the original OAI backup member allowance. |
| Native XML file | Selected record count or 64 MiB, whichever occurs first. |
| Frozen JSON-line manifest parts | Split at 64 MiB boundaries between complete records. |
| Bulk staff/file transaction | Up to 5,000 complete rows within the encoded request limit. |
| Original source file | Up to 1 TiB, streamed. |
| Complete receiving package | Up to 4 TiB of declared members, streamed through ZIP64. |

These are source limits and operational choices. Runtime duration and collection size are measured from the actual source edition and selected machine. Before a full file handover, allow space for the produced archive; the receiver needs the full uncompressed inventory size in its selected parent directory. Keep downloaded archives outside the working source-file tree.

## Continue after interruption

Browser saves are written to IndexedDB under the exact workspace identity before any mutation. If a response is lost, the desk retains the same complete request and operation ID. **Resume saved operation** replays that exact request. The database returns the saved result for an already committed operation. A different request cannot reuse that operation ID.

If browser persistence is unavailable or full, the desk downloads the exact operation JSON for the original local command. The complete request can be applied after stopping the desk:

```sh
starforge tind-migration --workspace /private/repository apply \
  --request /private/tind-retained-operation.json
```

Ordinary save documents have exactly five top-level fields:

```json
{
  "operationId": "one-stable-original-operation",
  "kind": "review",
  "projectId": "ACTUAL_PROJECT_ID",
  "expectedRevision": 2,
  "input": {
    "identifier": "ACTUAL_OAI_IDENTIFIER",
    "staff": {
      "action": "migrate",
      "targetId": null,
      "access": {
        "metadata": "public",
        "files": "none",
        "releaseDate": "",
        "restriction": "",
        "licenseURI": ""
      },
      "hierarchy": {},
      "decisions": {},
      "reviewer": "Actual operator",
      "note": "Complete original metadata and intended native destination reviewed"
    }
  }
}
```

Create uses `projectId: null` and `expectedRevision: null`. Later operations select the current project and revision returned by `state --project ACTUAL_PROJECT_ID`. Accepted operation kinds are `create`, `edition`, `profile`, `review`, `review-many`, `destination`, `destination-file`, `files`, `file-root`, `verify-files`, `prepare`, `receipt`, `file-receipt`, `reconcile` and `withdraw-batch`.

A retained browser native-task document has `task` in place of `kind`; continue that task through its corresponding `native-search` or `native-send` CLI with the same operation ID and exact saved input. Native read and write histories remain in the workspace database across desk restarts.


## Acquire original source documents

The **Native export and files** desk can acquire the original repository documents directly into the existing migration. A saved acquisition contains the exact source record/file pairs, original HTTPS URLs, expected file names, roles and access terms. Its original selection and every returned HTTP status, final URL, validator and byte checkpoint stay in the same database.

### Select and acquire the complete population

In **Acquire original repository documents**, enter the selection title, selecting operator and the original acquisition authority. Import or edit the complete JSON array of document rows. The source identifier must belong to the selected migration:

```json
[
  {
    "identifier": "ACTUAL_ORIGINAL_OAI_IDENTIFIER",
    "id": "original-article",
    "filename": "article.pdf",
    "url": "https://actual-repository.example/original-document.pdf",
    "role": "article",
    "mediaType": "application/pdf",
    "access": {
      "metadata": "public",
      "files": "public",
      "releaseDate": "",
      "restriction": "",
      "licenseURI": ""
    }
  }
]
```

Use the original document's direct URL from its publisher or retained source page. Each row can also name the original `expectedSha256`, `expectedBytes`, `maximumBytes` and an array of actual `redirectOrigins`. The default allowance is the existing 1 TiB file limit. Up to 5,000 complete rows fit in one selection, subject to the original 8 MiB encoded save limit. Prepare additional selections for larger catalogues.

The receiver follows HTTPS redirects within the original source origin and the explicitly selected redirect origins. It never forwards an Authorization header to another origin. A source using private query credentials should be received through its existing authenticated stable endpoint and host authorization environment. Supply the name of that environment variable in the selection; its value stays on the host.

Save the selection, open it, then choose **Acquire or resume these original files**. Each document is streamed in 1 MiB chunks. Durable checkpoints flush and synchronize the original file before saving its byte count and prefix hash in SQLite. Other selected files continue when one original source returns an error.

The desk shows each original HTTP result, exact bytes, checksum, actual returned media type and remaining source error. **Open original history** shows the complete selected row and all attempts. **Download original bytes** opens the completed original for inspection. A publisher login or error page that arrives as HTTP 200 is still the actual returned document: compare its bytes and actual media type with the intended file before receiving it.

### Pause and continue the same acquisition

Choose **Pause after saving current bytes** before exporting the workspace or moving to another original byte operation. The current read records its complete durable prefix. Reopen the same acquisition and continue its original rows after a restart. A browser save whose response was lost retains the exact operation request in the desk's existing IndexedDB queue.

A resumed HTTP range uses `Range` and `If-Range` with the same strong ETag. The receiver verifies the exact starting offset and selected total length, and checks the returned validator when present. An If-Range response may omit unchanged representation headers under RFC 9110. A server that returns a new full response starts that document from byte zero. A source without a strong ETag also restarts from byte zero. Checkpoints are rehashed before reuse, and bytes written after the last durable checkpoint are truncated before continuation. The receiver checks the selected expected length and SHA-256 when supplied.

The original publisher's request spacing is selected per acquisition; the default is 2.1 seconds between documents. Active source workers stop and save their stream before the application closes its database.

### Receive the existing source operator's original file

When the institution's existing browser or export has already acquired a document, open **Receive an original file from the existing source browser or authorized export**. Choose the acquisition row, its actual complete local file and the original HTTP receipt: requested URL, returned URL, GET/200, response header pairs and observed time. The receiver streams the file into this same acquisition, checks its declared or selected identity, and retains the original result with the receiving operator and context. Private authentication headers are omitted. A changed completed document starts a new acquisition and later follows explicit replacement receiving.

The same operation is available through ordinary apply kind `source-download-import`. Its input is `{acquisitionId,id,path,transport,reviewer,note}`. Source browser downloads and authenticated exports therefore join the same file review, native batch and editable handover as direct HTTP acquisition.

### Receive reviewed files into the migration

Select the completed files and choose **Prepare selected completed files for receiving**. The complete receiving rows remain editable. Review the actual original bytes, file name, role, actual media type and every access/release term. Enter the receiving operator and document review note, then receive the selection.

The operation copies the exact original bytes into the migration's existing bound file tree. A migration without a file tree receives them under its own private source directory and binds that directory automatically. Current native observations for the same byte identity stay with the file. Receiving changed bytes for an existing file also requires its exact current `replaceSha256` in the selected row, so the full replacement has a retained before/after source decision.

The resulting files appear in the existing original-file desk and frozen native batch manifests. Their source acquisition IDs, original URLs, actual returned URL, bytes and source observations travel with the existing metadata, file access review and native receiving history. HTTP acquisition completes the original source-file stage; native file attachment and destination access continue through the existing TIND receiving workflow.

### Original command operation

Create the selection with the ordinary `apply` command and a saved request containing kind `source-download-plan`, the current project/revision and this input:

```json
{
  "title": "Original institution documents",
  "reviewer": "Actual source operator",
  "note": "Original publisher document URLs and source access terms selected",
  "interval": 2.1,
  "authorizationEnvironment": null,
  "files": ["REPLACE_WITH_THE_COMPLETE_ORIGINAL_DOCUMENT_ROWS"]
}
```

The save returns its acquisition ID. Use the same ID throughout the original operation:

```sh
starforge tind-migration --workspace /private/repository source-downloads \
  --project ACTUAL_PROJECT_ID

starforge tind-migration --workspace /private/repository source-download-run \
  --project ACTUAL_PROJECT_ID --id ORIGINAL_ACQUISITION_ID

starforge tind-migration --workspace /private/repository source-downloads \
  --project ACTUAL_PROJECT_ID --id ORIGINAL_ACQUISITION_ID --offset 0 --limit 50

starforge tind-migration --workspace /private/repository source-download-export \
  --project ACTUAL_PROJECT_ID --id ORIGINAL_ACQUISITION_ID
```

The run command optionally accepts `--only /private/selected-acquisition-row-ids.json` to continue an exact subset. Its original source selection remains unchanged. Receive completed files with a normal `source-download-adopt` apply operation; input contains `acquisitionId`, `reviewer`, `note` and the complete editable `files` receiving rows from the desk. Each row names its acquisition row `id` and selected file metadata, role and access.

A complete editable handover includes the original acquisition database, returned source bytes and durable partial files, plus all adopted migration files. Receiving relocates this original cache with the workspace; pending acquisitions can continue from their retained byte checkpoints. A metadata-only handover omits the acquisition binary tree and the adopted source tree. Its selection and HTTP history remain available, and the original acquisition can reacquire omitted bytes on the receiving host. Bind the intended receiving file tree before adopting into a project that previously used another host's directory.

HTTP range and validator behavior follows [RFC 9110, sections 13.1.5 and 14](https://www.rfc-editor.org/rfc/rfc9110.html). Original source-document acquisition remains independent from the selected institution's native Batchuploader and object-storage contracts.

## Source and native references

- [Original OAI operator source](../../stellar/scf-starforge-20261009/sf30-seller-sdk/oai-pmh/): repository transport, reviewed editions and incremental history.
- [Complete TIND implementation](../../stellar/scf-starforge-20261009/sf30-seller-sdk/oai-pmh/tind/): MARC model, migration engine, native transport, CLI, managed application and operator browser.
- [TIND native search and export](https://docs.tind.io/article/cmi2ci71w7-search-and-export) and [hosted search interface](https://worldveg.tind.io/help/search-engine-api).
- [TIND Batchuploader API](https://docs.tind.io/article/ivm6ow3pha-batchuploader-api) and [direct native file upload](https://docs.tind.io/article/u8l72x0kp2-beta-how-to-upload-files-directly-to-object-storage).
- [TIND release 24](https://info.tind.io/roadmap/24.0.0-ils): native identifier checks and batch/export changes.
- [TIND release 1.16](https://info.tind.io/roadmap/1.16.0): authenticated native record/file APIs and configured submission workflows.
- [TIND release 1.8 IR/DA/RDM](https://info.tind.io/roadmap/1.8-ir-da-rdm): original export and file workflow release context.
- [Library of Congress MARC 024](https://www.loc.gov/marc/bibliographic/bd024.html), [773](https://www.loc.gov/marc/bibliographic/bd773.html) and [MARCXML](https://www.loc.gov/standards/marcxml/).

The case-specific issuer documents, commercial programme, source acquisition and partner communication remain in the existing sales operation. This selected product is the reusable engineering workflow and complete editable delivery.

## Prepare the original source before selecting a TIND institution

A complete reviewed OAI edition can open immediately as an editable TIND migration. The institution field may remain empty while the operator maps original metadata, reviews source cases, preserves contributor identities, prepares rights and hierarchy decisions, and saves the full handover. This supports procurement and commissioning work before a receiving tenant has been selected.

When the actual receiving institution is selected, open **Mapping**, set the profile's `instance` to that institution's HTTPS origin, and save the complete profile. Preparing a native batch, running native search, or sending an exact native request uses that selected institution. An institution already associated with received destination records or prepared native batches remains bound to the original migration.

The OAI console also receives unchanged XML through `import-relay` or `import-relay-request`. Its original acquisition receipts, source bodies and replay history are retained through edition review, projection, the TIND project and the full editable workspace handover. See the adjacent OAI operator README for the complete receipt format and original-request recovery commands.


## Complete original staff cohorts

The maintained OAI source desk can now review completed GetRecord operations together as one explicit collection. This is useful when an institution's original staff cases cross thesis, journal, article and issue sets.

Open the OAI console's **Record selections** tab. Receive each actual source record, choose its completed operation, prepare the collection, review the original identifier/datestamp decisions, and save the edition. Its metadata mapping retains the original GetRecord wrapper and can be built through the same SF30 dataset engine.

Create the TIND project from that exact reviewed edition. The existing source-case desk matches the original OAI identifiers, preserves the original rights and release context, enriches assigned contributors and relationships, and records complete before/after staff decisions. The full mapping, destination reconciliation, file receiving and handover continue from that project.

The collection includes references to all original operations and unchanged observations. Its source export carries original bodies, acquisition receipts, original operations, edition lineage, selected metadata paths and the native dataset. The complete handover retains the same collection and source-case history for receiving and reopening.

### Complete MSU original staff-case operation

The private receiving package at opportunities/discoverygarden_msu2026112_20261012/tind-operator contains the exact original responses and the complete 11-case collection request, msu-staff-record-selection.json.

The complete journal receiving operation continues to use its original command and output directory. Receive all eleven original staff cases together using the same original MSU workspace and a separate collection output:

```bash
python3 /absolute/commons/opportunities/discoverygarden_msu2026112_20261012/tind-operator/receive_original_oai.py \
  --source /absolute/merchant-checkout \
  --workspace /private/msu-scholars-junction \
  --out /private/msu-complete-staff-receiving \
  --initialize \
  --edition-mode staff-cases \
  --operator "Actual receiving operator" \
  --note "The complete original MSU staff cohort and its source rights, release rules, contributors and relationships reviewed"
```

This reuses the original received response identities, selects all eleven exact GetRecord sources, reviews and builds the actual collection, applies all eleven original staff cases, and writes the complete editable records, mapped MARCXML, native source export, operator page and whole-workspace handover. The result includes its actual collection operation, edition, build, project, review and archive identities.

The existing complete Endeavors edition remains available in the same workspace. Each output directory retains its own exact receiving context, source selection and saved TIND/case requests. Continue an interrupted run with the same selected mode and output directory.


## Operate complete production waves

Production waves retain the exact original record membership selected from the repository's OAI sets. A plan captures its source edition, profile, working revision, responsible operator and scope. Each selected record appears once, including records omitted from new delivery because they were already received or deliberately excluded. A record belonging to several selected sets is assigned to the first sorted matching set, and the original complete set list stays with that record.

Open **Production waves**, choose all records or the actual source collections, choose the maximum records per wave, and save the plan. The default of 500 is an application planning choice. Each wave can contain up to 10,000 records; the existing native batch still uses its selected MARCXML record/byte partitioning. The complete census and its waves are stored in the original SQLite workspace.

### Review and continue the same records

Open a wave to see current ready, received, excluded, changed, unresolved, deferred, prepared or receiving records. Its selected membership is stable even when the source edition advances. **Open record** uses the original metadata/access/identifier decision desk. Save corrections there, then use **Accept current source and mapping for this wave** with the responsible operator and a scope note. This records each prior/current content identity and retains the original review history.

Use **Defer selected records** for exceptions that must continue separately; the record stays in the original wave with the operator's reason. **Include selected records again** restores its participation. A deferred record prevents a wave from being described as completely received. An explicit staff exclusion remains its ordinary source decision.

A record is already received only when the original confirmed native batch matches its current intended fields, native identity, record access and exact file roles/bytes/access, with the original file receiving results complete. Later source, mapping, staff or file changes re-enter the work. Source timestamps alone do not force another native write when the intended received result is unchanged.

### Prepare and receive the original native batch

Choose **Prepare original native batch**. The wave checks its reviewed source/mapping identity and passes the exact ready identifiers to the existing frozen batch engine. A changed record requires the explicit wave review above. When selected, **Prepare the reviewed ready records now** preserves unresolved records as exceptions in the same wave while preparing the ready portion.

The returned batch retains its production plan and wave identity, original MARCXML parts, full record/file intentions, source edition and destination export. Continue it through **Open native delivery**, using the existing native request, result and file/access receiving controls. A new wave preparation does not replace an unfinished original batch: complete that batch or use its existing explicit withdrawal operation first.

After receiving the actual native result, complete current destination export and original file observations, choose **Reconcile this original batch** in the wave. This invokes the unchanged record/file reconciliation engine and keeps its complete report and counts. Remaining records stay in the wave; a later ready portion creates its own linked batch. Completed and withdrawn batches remain visible in history.

### Source continuation, full exports and receiving

A newer OAI edition can add records outside a saved plan. Create a following production plan from the current complete collections to select those records and changed work. Earlier plans, exact membership, completed native outcomes and staff decisions remain in the same project. The full plan export includes every selected member, omission, wave decision and original native batch reference as streaming JSON Lines.

All production tables travel in the original complete workspace handover. The same installed application opens the saved plans after receiving the whole archive; native credentials remain in the selected runtime configuration. The full source acquisition from PR1059 continues to preserve original document bytes, HTTP history and access decisions in this same project.

### Original command interface

Inspect the real collections and saved waves:

~~~sh
python3 /absolute/installed/oai-pmh/tind/cli.py --workspace /private/original-workspace production-collections --project ORIGINAL_PROJECT_ID
python3 /absolute/installed/oai-pmh/tind/cli.py --workspace /private/original-workspace production-plans --project ORIGINAL_PROJECT_ID
python3 /absolute/installed/oai-pmh/tind/cli.py --workspace /private/original-workspace production-plans --project ORIGINAL_PROJECT_ID --id SAVED_PLAN_ID
python3 /absolute/installed/oai-pmh/tind/cli.py --workspace /private/original-workspace production-wave --project ORIGINAL_PROJECT_ID --id SAVED_WAVE_ID
python3 /absolute/installed/oai-pmh/tind/cli.py --workspace /private/original-workspace production-export --project ORIGINAL_PROJECT_ID --id SAVED_PLAN_ID --out /private/complete-production-plan.jsonl
~~~

All list operations expose offset, limit and next. Continue until next is null. The full production-export streams all records and refuses to overwrite an existing output.

Save one complete original apply request before running it. It uses the existing operationId, kind, projectId, expectedRevision and input envelope. The source state command provides the current project revision. A production-plan input has title, reviewer, note, recordsPerWave and selection:

~~~json
{"title":"Original Scholars Junction staff receiving","reviewer":"ACTUAL_OPERATOR","note":"Reviewed original collections, access cases and exact selected population","recordsPerWave":500,"selection":{"all":true,"sets":[],"unassigned":false,"includeReceived":false}}
~~~

The other operation kinds use these exact inputs:

| Kind | Complete operation input |
| --- | --- |
| production-review | waveId, reviewer, note |
| production-disposition | waveId, identifiers, disposition (include or defer), reviewer, note |
| production-prepare | waveId, readyOnly, reviewer, note |
| production-reconcile | waveId, batchId, reviewer, note |

Replay an interrupted saved request unchanged. The original operation ledger returns its retained result; future changes use a new operation and current revision.

### Join the existing MSU workshare

The existing commissioning workorder retains its agreed work packages, effort, commercial terms and responsible delivery participants. This capability supplies its collection-wave, exception, changed-source, cutover and handover operations. The original eleven-record staff cohort and complete fifteen-record Endeavors edition remain separate selectable projects in the same Scholars Junction workspace; the seven public original-document selections retain their original receiving driver and source rights. The distinct CIIM169 case retains its own original source.
