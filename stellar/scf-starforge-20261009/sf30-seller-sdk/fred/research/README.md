# Research source catalogue and customer receiving

The research catalogue runs inside the existing private Economic editions workspace. It uses the original project ID, revision, operation journal, pending-action recovery and complete project export. Its catalogue, retained files, reviews and issued research products travel with the existing FRED, DDP, recurring, publication and county-report material.

The published Econsult Solutions Greater Philadelphia Regional Data Audit describes an inventory of research and datasets classified by topic, geography and release frequency, a searchable/sortable database, source-gap analysis and research-product planning. This application implements that production workflow. ESI's original company owner retains the relationship, quantitative programme, commercial scope and sole sender. The records in a selected customer project are supplied or acquired under that project's own source authority.

## Operating workflow

Open the existing Economic editions application and select **Research sources**.

1. Create or import the complete selected source inventory. Each stable source ID keeps its publisher, title, original URL, kind, topic and geography taxonomy, refresh interval, expected release date, licence and coverage notes. Saving a correction creates a retained definition; older definitions remain available.
2. Open a source and retrieve its public publisher page or upload its complete original retained file. The capture retains the original definition, requested and returned URL, retrieval time, status, media type, response headers, complete bytes and SHA-256. Uploads retain the selected file name and original retrieval time when provided.
3. Review the latest capture for the active definition. Record the reviewer, ACCEPT / NEEDS_WORK / REJECT decision and substantive note. A later capture needs its own review. An unavailable HTTP response remains visible and cannot become an accepted source.
4. Create a research product with explicit source requirements. Each requirement names the selected original source IDs and required topic/geography coverage. The catalogue shows missing sources, unavailable or unreviewed captures, rejected sources and taxonomy gaps. These are editable production decisions.
5. Issue the reviewed product when every selected requirement is covered. The issued edition freezes the exact source definitions, captures and accepted reviews. Later source corrections preserve that earlier edition and its original source files.
6. Export the complete project and receive it through the original Economic editions receiver on another host. The received project keeps the same catalogue, histories, source bytes, product editions and quantitative material. Download the original files and produce a fresh catalogue CSV after reopening.

A refresh interval means days since the latest retained source; an explicit expected release date is a separate staff-maintained next-release expectation. The due indicator schedules attention; it does not send messages or create an automated task. Staff update a passed expected release date when the publisher's next period is known.

## Source collection

The public collector performs a normal GET of the selected source URL. It supports HTTP/HTTPS on standard public web ports, uses the original publisher TLS verification, restricts redirects to the same origin, resolves the selected public address before connecting and excludes private network destinations. No authentication headers or browser session credentials are supplied.

The exact response is retained before any interpretation. Non-success responses, exhausted same-origin redirects and cross-origin redirect responses remain original source editions with their status and location; staff inspect the retained response and explicitly review a changed source URL. A network interruption remains attached to the original pending action and can be continued.

The collector requests an uncompressed representation. If the publisher returns a content-encoded body, that encoding remains in the captured headers and the download uses an .encoded filename suffix. Those original bytes are retained as returned.

Each source file can contain up to 16 MiB. A catalogue carries up to 128 MiB of original source bytes within the existing complete-project capacity. A large statistical source already retained by QCEW or another maintained engine continues through that engine's original acquisition/export path; the catalogue describes its publisher, method and research role without substituting a shortened extract for the original quantitative source.

## Inventory fields

| Field | Meaning |
| --- | --- |
| entryId | Stable source identity; letters, numbers, underscore, dot, colon or hyphen |
| title | Complete source title, up to 500 characters |
| publisher | Original issuing organization, up to 500 characters |
| url | Published source URL without embedded credentials |
| kind | DATASET, RESEARCH, REPORT, METHOD or OTHER |
| topics | Explicit unique topic strings |
| geographies | Explicit unique geography strings |
| cadenceDays | Integer 1–3660, or null when not assigned |
| expectedRelease | Actual expected calendar date, or null |
| licence | Source rights, access and permitted-use notes |
| notes | Method, scope, population and comparability notes |
| retired | Retains the record and history while removing it from current source acceptance |

The catalogue searches IDs, titles, publishers, URLs, topics, geographies and coverage notes. It filters by topic, geography, review status and refresh due state. Every result page returns total count and the next offset.

An inventory import adds new source identities or saves new definitions for existing identities. It never infers deletion from an omitted row. To retire a source, explicitly set retired to true. The complete source CSV preserves the original field names and places taxonomy arrays in JSON-valued CSV cells. Quoted commas, line breaks and doubled quotes round-trip through the supplied parser. Source text remains text.

## CLI

From the installed package:

~~~sh
npx --no-install starforge fred research help
npx --no-install starforge fred research catalog --project /absolute/original-project
~~~

From the complete maintained repository:

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/fred/research/cli.mjs \
  catalog --project /absolute/original-project --query housing --due
~~~

Use the current revision from catalog or the original FRED project view. Every action JSON contains its original id, expectedRevision, action and complete payload.

Example source definition:

~~~json
{
  "action": "research-entry-save",
  "id": "research-source-definition-001",
  "expectedRevision": 4,
  "definition": {
    "entryId": "publisher-research-catalog",
    "title": "Original regional research catalogue",
    "publisher": "Selected research publisher",
    "url": "https://publisher.example/research",
    "kind": "RESEARCH",
    "topics": ["Regional economic development"],
    "geographies": ["Selected original region"],
    "cadenceDays": 90,
    "expectedRelease": null,
    "licence": "Record the publisher's actual reuse terms.",
    "notes": "Retain the original geography and scope.",
    "retired": false
  }
}
~~~

The example URL and labels explain the input shape. Select the actual publisher and complete original input before collecting a source.

~~~sh
npx --no-install starforge fred research action \
  --project /absolute/original-project --request /absolute/save-source.json
~~~

The result returns entryId, immutable definitionId and current project revision. Retain those identities for the selected source action:

~~~json
{
  "action": "research-source-acquire",
  "id": "research-source-receiving-001",
  "expectedRevision": 5,
  "entryId": "publisher-research-catalog",
  "definitionId": "EXACT_RETURNED_DEFINITION_ID"
}
~~~

To import an original file, use action research-source-upload with entryId, definitionId, filename, contentType and optional original retrievedAt. The upload command reads the complete actual file and places its bytes in the retained request:

~~~sh
npx --no-install starforge fred research upload \
  --project /absolute/original-project \
  --request /absolute/original-upload.json \
  --file /absolute/original-publisher-file.pdf
~~~

Review with research-review, snapshotId, decision, reviewer and note. Save a product using research-product-save with definition containing:

~~~json
{
  "productId": "regional-source-review",
  "title": "Regional research source review",
  "audience": "The named customer research team",
  "purpose": "State the actual research purpose.",
  "format": "Agreed report and complete source catalogue",
  "notes": "Retain the original scope and interpretation.",
  "retired": false,
  "requirements": [
    {
      "id": "regional-research",
      "title": "Original regional research source",
      "entryIds": ["publisher-research-catalog"],
      "topics": ["Regional economic development"],
      "geographies": ["Selected original region"],
      "note": "Describe the actual required coverage."
    }
  ]
}
~~~

Issue with research-product-issue, productId, issuedBy and note.

## Original action recovery

The original FRED transaction checks completed operation identity before current revision. Repeating the same action ID and payload returns the retained original result. A changed payload under an existing ID is rejected.

Source uploads are retained in the project's private upload directory before the journal action, so the journal stores source identities rather than a large base64 request. Source acquisitions retain the complete response in the private acquisition directory before adopting it into the catalogue. Both reuse their exact retained source on an interrupted continuation.

The browser's **Continue original catalogue action** uses the original project pending record. Programmatic continuation sends the original action, ID and expected revision with resume: true; it reads the original saved payload and source files. The user can also use the original History & handover controls to abandon a failed pending action while retaining its files.

Each correction after a completed action has a new explicit operation ID. A later publisher edition has a new source capture; the original capture remains intact.

## HTTP and UI integration

The component uses the existing workspace token and original project binding. The server checks the original host/origin, bearer session and project identity before catalogue requests.

| Route | Meaning |
| --- | --- |
| GET /api/research/catalog | Search/filter/page catalogue and product source coverage |
| GET /api/research/entry?id=… | Complete selected definition, source and review histories |
| GET /api/research/catalog.csv | Complete editable source inventory |
| GET /api/research/source?id=… | Original retained source bytes |
| POST /api/action | Existing journal dispatch for research actions |
| GET /api/bundle | Complete existing economic project, including research sources |

The browser uses the same API and full-project download. Forms retain edits while catalogue state refreshes. Asynchronous completions are checked against the original project identity and generation. Original source files download as attachments. The catalogue does not add an independent user directory or alternate project database.

## Complete receiving contract

The new full-project family is stellar-forge.fred-project-bundle.v7. Existing bundles remain accepted. A research-bearing project includes:

- The existing original project state and its operation journal.
- All existing FRED, DDP, recurring, release, publication and QCEW fields required by their original source families.
- Research source definitions and every prior definition.
- Every original source file and response identity.
- All review decisions.
- Research-product definitions, source requirements and every issued product edition.
- The full original source/review bindings of each issued product.

The receiver verifies the complete source set, exact bytes and hashes, definition correspondence, review bindings and product coverage before committing the project. Existing receiving directories resume only their original complete bundle. The same original project functions produce and receive the full package.

~~~sh
npx --no-install starforge fred research export \
  --project /absolute/original-project --out /absolute/new-complete-project.json

npx --no-install starforge fred research receive \
  --project /absolute/empty-received-project \
  --file /absolute/new-complete-project.json

npx --no-install starforge fred research catalog \
  --project /absolute/empty-received-project
~~~

A catalogue CSV is useful for editing and import. The complete project bundle is the handover for original files, histories, reviews and product editions.

## Source ownership and integration

The maintained FRED/QCEW application remains the host. Additive files are under fred/research/ and fred/ui/research.js. Guarded host changes join the original project validator/export/receive, authenticated workspace routes, browser mount, installed CLI dispatch and existing distribution contribution.

The exact donor for this edition is Merchant Workspace merge 2d86f857d9b5be3eb04018111302711e3dfd5bc4. The source packet records complete before/after identities. A receiving owner validates every affected current file before applying the whole join; a different successor is composed against its actual current contents.

Original ESI company operation: ECONSULT-REGIONAL-PRODUCTION-9B2C-20261013. Catalogue component owner: 4593. The original QCEW source intake and R103D quantity/source review remain with their respective owners.


## Complete original-input native receiving

Run `node research/native-journey.mjs --directory PRIVATE_CASE --input INPUT.json --cpi ORIGINAL_CPI.json` from the maintained FRED source. The input uses `stellar-forge.research-native-input.v1`, complete source-file byte identities, source definitions, explicit staff review notes, initial and corrected product definitions, and search selection. `--original-project COMPLETE.json` joins the catalogue to a retained economic/QCEW project. `--chromium EXISTING_EXECUTABLE` additionally runs the original browser and saves desktop/phone views and the actual CSV download. The retained case keeps every request, original source, full project bundle and independently reopened installation. Resume with the same case and original inputs; completed native steps and original actions retain their identities.

The course covers actual source gaps before journaling, complete source intake/review, both issued product editions, original HTTP CSV export and reimport, Unicode original filenames through a header-safe attachment name, whole project export/receive, and replay of the same completed upload after fresh receiving. Original Unicode filenames remain in source metadata; the HTTP attachment name replaces characters unsafe for an ASCII header. The product source and original request body remain unchanged.
