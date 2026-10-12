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
