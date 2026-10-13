# Collection review

Collection review is a proposed, platform-neutral preparation workflow for an institutional collection inventory. It preserves the actual source catalogue while an operator reviews descriptions, records rights/access evidence, proposes relationships and arranges a story. It does not replace ArchiveBlack, connect to an institutional CMS, publish a story, establish permission or fetch linked media.

The complete workflow is available in the local browser, installed CLI and shared JavaScript exports. The same source records, review requests and complete receiving validator are used throughout.

## Install and open

From the intended committed checkout, use the existing distribution builder:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo . --ref HEAD --selection collection-review \
  --out /absolute/new-package-directory
~~~

The existing source-tables selection also includes Collection review. Keep the actual returned archive, commit, manifest and checksum together. Continue an interrupted build through the original builder; do not start another installation for the same output.

Install that actual returned archive in your application directory:

~~~sh
npm install --ignore-scripts --offline --omit=optional /absolute/package.tgz
npx --no-install starforge collection-review serve --port 8787
~~~

Open the printed /collection-review.html URL. Use a fixed local host and port to keep the same browser storage. The original developer-site asset server serves the page; there is no second catalogue service, remote account or database.

From a source checkout, the equivalent command is:

~~~sh
node stellar-forge/developer-site/collection-review-cli.mjs serve --port 8787
~~~

Use Node 22.16 or later and a current browser with IndexedDB and Web Crypto. The read/export commands use only local files.

## Retain a complete source

Create a named workspace and record the actual editorial operator. Under Add a complete source, select its format, original URL, the time the retained source was observed, and its complete UTF-8 file.

The ArchiveBlack adapter reads only main#primary and the institution title, description, topics, characteristics, address and ordered moba-collection anchors. It preserves:

- Every original UTF-8 source byte, source filename, URL, recorded observation time and SHA-256.
- Each occurrence's ordinal, decoded combined title/date string and link.
- Its exact raw anchor, raw title, raw href and UTF-8 byte range in the complete source.
- Repeated URLs as different occurrences when they appear more than once.

The source page presents combined title/date labels. The adapter does not infer a separate date, correct a year, rename historical labels, or infer reuse permission. Institutional metadata and item text are source observations. Comments and script/style bodies are retained in the original HTML but excluded from the displayed-text projection.

For another catalogue, import a complete structured JSON source:

~~~json
{
  "schema": "stellar-forge.collection-input.v1",
  "institution": {
    "title": "Name as supplied by the institution",
    "description": "Original description",
    "address": "",
    "topics": [],
    "characteristics": []
  },
  "entries": [
    {
      "title": "Complete original title and date text",
      "url": "https://example.org/original-record"
    }
  ]
}
~~~

The complete original JSON record is retained for each occurrence, including additional supplied fields. Row identity uses the whole source identity plus ordinal; it never uses URL alone. This format is an explicit original data input, not an automated extraction claim.

Source admission is passive. No link target, image, PDF or media file is downloaded by the component. Original source downloads can contain the source site's own scripts; the workbench never executes that source HTML.

## Review and propose

Select the collections in the draft. The original source list remains visible in its supplied order. Filter by title or review state without changing that order.

Select one occurrence and choose unreviewed, include, exclude or needs-info. Enter a proposed title, summary, question or evidence note separately from the original label. A changed review does not rewrite the source.

Rights/access defaults to unknown. Every non-unknown observation needs a specific basis and an HTTP(S) source citation. The available labels are unknown, metadata-only, permission-recorded and restricted. They are operator-recorded observations, not an independent legal assessment or authorization to copy media. The package contains catalogue metadata and source pages, not linked media.

Only an explicitly included occurrence can be added to proposed story order. Move entries earlier/later or remove them. This order is independent of institutional source ordering. A relationship has two original occurrence IDs, a proposed kind and an evidence/uncertainty note. Relationships and narrative text remain editorial proposals.

The complete draft JSON supports advanced editing. Raw unfinished text is saved separately from structured form fields. Apply validates a complete JSON state before replacing the draft. A malformed raw edit remains downloadable and reopenable.

## Save, restart and receive

Save complete review records the entire submitted state, actual operator, note, recorded time, original request UUID and expected saved revision. The request is retained before processing. Recovery reuses that exact input.

The same UUID with another body is refused. An accepted request replay returns its original revision even if later local revisions exist. A new save based on an older selected head is refused; the draft remains available for comparison. Every revision retains its parent, exact request and content-derived identity.

Browser persistence uses one IndexedDB read/write transaction with an expected local revision. Another tab cannot silently overwrite this browser copy. If browser storage fails, Download current working copy remains available. Reopen the newer browser copy, or open the downloaded copy separately, before further saves.

Downloading a complete editable packet or ZIP captures unfinished raw and structured fields, source-form choices, operator/note and the original pending request as an immutable working copy. Reopening a browser working-copy JSON restores its exact local state. Receiving it into an existing workspace retains that working copy without selecting it or running its pending request.

Receive colleague's history requires the same original workspace ID and original root. It validates every source, extraction, revision, request identity and parent before union. Existing and incoming histories are retained, while the destination's selected head and current draft remain unchanged. Open an unrelated workspace separately.

Use revision as new draft explicitly copies a selected saved revision against the current local head. Restore working text similarly reopens an unfinished copy without executing an old pending request. The replaced local working copy is retained first. Imported branches are never treated as approval or permission.

## Export to an existing platform or colleague

The complete ZIP contains:

- collection-review/workspace.json: the editable packet, every source, immutable saved revision, selected head and retained unfinished copies.
- sources/: original source bytes plus complete source/extraction identity.
- review.json and review.html: the selected saved review, full institutional source order, separate editorial story order, relationships and rights/access evidence.
- occurrences.csv, relationships.csv and story.json: explicit metadata interchange for an existing catalogue/CMS.
- files.json: exact byte length and SHA-256 of every preceding exported file.
- README.md: receiving and operating instructions.

Import CSV fields as text. Original labels may contain spreadsheet formula characters; the CSV preserves those exact strings rather than modifying the source. JSON offers a typed, explicit alternative.

Export with Source Tables workspace adds a complete project, explicit text mapping, reviewed row output and the original merchant generator's native workspace. All 44 example occurrence rows retain occurrence_id as a key and all source/title/date fields as text. Native merchant defaults are the existing nonpayable testnet example; configure deliberate route/payment terms in the original Source Tables workspace before any real service use. This workflow does not start a merchant or make a payment.

A colleague opens collection-review/workspace.json in the installed Collection review workbench. They can also open the included source-tables/project.json in the existing Source Tables workbench to remap fields and configure the original native merchant.

## CLI continuation

Every output uses a new path; input files are preserved.

~~~sh
starforge collection-review init --name "Collection review" \
  --actor "Actual operator" --out workspace-01.json

starforge collection-review source --project workspace-01.json \
  --file original-institution.html --format archiveblack-html \
  --url https://archiveblack.ca/archives/original-institution/ \
  --observed-at 2026-10-13T07:54:47.000Z --out workspace-02.json

starforge collection-review draft --project workspace-02.json \
  --select-all --out editorial-draft.json

starforge collection-review prepare --project workspace-02.json \
  --draft editorial-draft.json --actor "Actual operator" \
  --note "Reviewed original source inventory" --out original-request.json

starforge collection-review save --project workspace-02.json \
  --request original-request.json --out workspace-03.json

starforge collection-review export --project workspace-03.json \
  --out collection-review.zip
~~~

The URL/time above illustrate CLI syntax: use the actual chosen source URL and observation time. Edit the draft JSON between draft and prepare. Keep original-request.json for same-input replay after interruption. A replay against a later workspace preserves its selected head.

Use keep-draft to retain unfinished text, receive to union a colleague's original history, report for the printable review, and tables for the complete original Source Tables project. The help command lists all arguments. The shared APIs are exported as @tokenjunkielabs/starforge-merchant/collection-review and its /source and /report subpaths.

## Actual programme example and limits

The included example uses two complete captured public ArchiveBlack institution pages: Toronto Metropolitan University, 19 ordered occurrences, and Museum London, 25. It preserves all 44 exact links, titles and source byte locations. TMU occurrences 6 and 11 share a target URL but retain distinct labels ending in 1922 and 1895-2006. Museum London's curator attribution and approximate dates stay in their original source text. The example begins unreviewed with all rights unknown.

These pages are related public programme context. They are not established as the target holdings, volumes or requirements of TMU RFI2026-090-TS. This proposed component makes no procurement submission, institutional publication or paid-delivery claim.

Supported bounds are 4 MiB per original source, 64 sources, 20,000 retained occurrences, 1,000 saved revisions and 64 MiB per complete workspace. Every accepted append must leave a reopenable workspace within that bound. Original Source Tables/native generator limits also apply to its optional export, including the native 1 MiB selected resource limit.

## Validation boundary

The retained implementation checks exercise the original functions against the two exact captured pages, complete source/hash/byte-range comparisons, duplicate URL preservation, same-UUID recovery, divergent receiving with later local selection, unfinished draft receiving, source substitution refusal, rights-basis refusal, comment projection and complete original Source Tables ZIP generation/checksums. They run in V8 with controlled platform adapters. They are not a claim of a native browser layout run, customer operation or institutional acceptance.


## Maintain later source editions

The complete [source-edition operating guide](./collection-review-source-editions.md) covers retained old/new source comparison, explicit occurrence correspondence, per-field carry decisions, original save recovery and complete receiving. Use **Maintain a source edition** in the existing browser. Both earlier source and complete review history remain available; a replacement never silently inherits rights or merges repeated target URLs.
