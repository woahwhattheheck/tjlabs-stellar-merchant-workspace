# Complete customer Support handovers

A Support handover carries the complete editable Operating Plan, the selected returned-work reviews, every compact source descriptor and every original member of each native source companion in one portable TAR. The recipient can reopen the archive, inspect or download its original files, receive the plan through the maintained history receiver, and reopen each native companion through the existing SF74 source engine.

Use the saved original case and source selection. The archive follows the selected case revisions and preserves all recorded observations, results, carried files and later compatible plan work. Creating or receiving it does not dispatch another OAuth observation or alter a live case head.

## Customer workflow

1. Open the saved Support plan in the existing Operating Plans workspace. Save any edited working draft before selecting the edition to deliver.
2. Add every original source companion directory. Each must contain its complete SOURCE.json, MANIFEST.json and all manifest members. Add the complete returned-work reviews to deliver; the opened review can be included directly.
3. Supply a stable handover ID, title and preparing operator. Create and retain the complete package. The browser verifies every member and retains the full archive before receiving any plan.
4. Download the TAR and its readable handover. The recipient opens that same TAR in the Support workspace, reviews its identities, and chooses **Receive editable plan**.
5. Use native receiving to reopen the retained case histories and source artifacts. Keep the returned RECEIVED.json, RECEIVED-PLAN.json and complete receiving directory.

The browser keeps the archive Blob and editable document together in its local package store. Receiving state moves through RETAINED, RECEIVE_PENDING and COMPLETE. The original plan store remains the sole plan writer. If another tab changes the saved handover, reopen that package to continue from its actual state. If local storage is full, the error remains visible and the complete archive can still be downloaded. Keep that portable copy when moving between browsers or devices.

The complete browser procedure, saved-package controls and member downloads are described in [Support Operating Plans browser](SUPPORT_OPERATING_BROWSER.md).

## What the archive contains

The first regular member is HANDOVER.json. It contains the entire plan history, source descriptors, complete returned reviews and the exact original companion manifests. Companion members follow under companions/0/, companions/1/ and so on in the same order as the source descriptors.

Each companion preserves SOURCE.json, MANIFEST.json, every selected case revision, complete workspace and runtime data, original OAuth source pairs, report and handoff artifacts, evidence files and any referenced native delivery. An extra or missing archive member fails verification. Files keep their original relative path, byte count and SHA-256.

The document schema is stellar-forge.support-operating-handover.v1. Its exact fields are:

| Field | Meaning |
| --- | --- |
| schema, id, title, owner, createdAt | Frozen handover identity and exact UTC creation time |
| plan | Complete original OperatingPlan with every revision |
| sources | Complete compact Support source descriptors, in selected order |
| returns | Complete original Support returned-work wrappers |
| companions | sourceIndex, sourceFile, manifestFile and full original manifest |

Every review belongs to the same original plan identity, creation time, origin and first revision. A completed review's resulting history must remain a prefix of the exported plan. The unchanged Support return model verifies the saved outcomes, selected source lineage and carried OperatingFiles. The unchanged plan receiver extends compatible histories, preserves an existing later compatible head and rejects divergence.

## Installed native commands

The maintained merchant-support selection includes the Support operating contribution. Use the same installed command:

~~~sh
starforge support-operating-plan handover-pack --request PACK.json --out PACK-RECEIPT.json
starforge support-operating-plan handover-open --request ARCHIVE.json --out HANDOVER.json
starforge support-operating-plan handover-receive --request RECEIVE.json --out RECEIVE-RECEIPT.json
~~~

PACK.json contains the complete actual values:

~~~text
{
  directory: normalized absolute outgoing directory,
  id: stable handover ID,
  title: customer handover title,
  owner: preparing operator,
  createdAt: exact UTC ISO timestamp retained for this request,
  plan: complete saved OperatingPlan,
  returns: array of complete returned-work reviews,
  companions: [
    {
      directory: normalized absolute retained source directory,
      expectedSource: {path:"SOURCE.json",bytes: original byte count,sha256: original SHA-256}
    }
  ]
}
~~~

The original source exporter/receiver supplies expectedSource. Use its actual identity; do not substitute the hash of a reformatted descriptor. Every companion directory is independently inspected by inspectOAuthOperatingSourcePackage before packing. The outgoing directory must be outside all source directories, and the sources must be outside it.

A completed outgoing directory contains handover.tar, the original request selection and PACKED.json. The CLI receipt identifies the complete archive, document, source selections and original member inventory. The archive is read back through the same reader before completion.

ARCHIVE.json is {archive,expectedArchive?}, where archive is the normalized absolute TAR path and expectedArchive is its original {path:"handover.tar",bytes,sha256}. Opening verifies the whole archive and each complete member, then writes the complete editable HANDOVER.json.

RECEIVE.json is {archive,directory,expectedArchive,existingPlan?}. The destination is a private absolute receiving directory. expectedArchive is required. existingPlan is either the recipient's complete selected plan or null. The original plan-prefix receiver computes the complete resulting plan; this file-oriented command does not overwrite a separate application's plan store.

Native receiving first retains the exact selected archive. It extracts its original bytes under package/, receives every companion through receiveOAuthOperatingSource into received-sources/<index>/, and saves RECEIVED-PLAN.json and RECEIVED.json. The original source receiver validates the full case revision chain and artifacts. The final receipt binds each companion receipt and explicitly records liveCaseHeadChanged:false. The complete retained archive permits later receipt recovery without contacting the sender.

The native owner uses the existing Linux flock lease. Run these native commands in the maintained Linux environment with flock available. Ordinary browser package review and receiving use the browser's existing storage and plan transaction.

## Retrying the same operation

Retain the complete original request and output directory. A replay adopts identical existing bytes and rejects a changed selection. The first request is selected by its SHA-256 in a private filename before publishing REQUEST.json. After a stopped first write, the same leased operation may reconcile only its own UUID staging files whose bytes are an exact prefix of that selected request. Unknown content and other request identities remain conflicts.

The original immutable file helper handles completed-file adoption and removes its owned temporary files on ordinary failure. It never overwrites a different retained result. Package, plan and completion receipts are regenerated from the verified selection and compared as complete immutable bytes.

The CLI installs one cancellation owner for SIGINT and SIGTERM. Native loops check that signal; the original lease closes in finally. Resume with the same request after a confirmed stop. An unacknowledged live operation keeps ownership until its original result or lease state is reconciled.

## Editable document commands

These commands operate on full JSON values:

~~~sh
starforge support-operating-plan handover-create --request DOCUMENT-INPUT.json --out HANDOVER.json
starforge support-operating-plan handover-inspect --handover HANDOVER.json --out CHECKED.json
starforge support-operating-plan handover-show --handover HANDOVER.json --format html --out HANDOVER.html
starforge support-operating-plan handover-receive-plan --handover HANDOVER.json --existing CURRENT.json --out RECEIVED-PLAN.json
~~~

DOCUMENT-INPUT.json supplies id, title, owner, createdAt, plan, sources, optional returns, and companions. These actions validate histories, source associations and declared inventories. Complete member-byte verification is supplied by handover-open, native receiving or the shared browser archive reader.

Every output is create-only. Repeating the same action acknowledges identical bytes. A different output already at the selected path remains intact and produces a conflict.

## Typed APIs and MCP

The installed typed exports are:

- @tokenjunkielabs/starforge-merchant/merchant/support-operating-handover
- @tokenjunkielabs/starforge-merchant/merchant/support-operating-handover-archive
- @tokenjunkielabs/starforge-merchant/merchant/support-operating-handover-native

The pure core exports createSupportOperatingHandover, inspectSupportOperatingHandover, receiveSupportOperatingHandover and renderSupportOperatingHandoverHTML. The shared archive module exports prepareSupportHandoverArchive, createSupportHandoverArchive and readSupportHandoverArchive. A read(path) callback supplies the actual original File or Blob. The prepared result exposes small headers plus original slices as parts, so callers do not concatenate the complete archive into an ArrayBuffer.

The native module exports packSupportOperatingHandover, inspectSupportOperatingHandoverArchive and receiveSupportOperatingHandoverArchive with the same request fields as the commands above and an optional caller-owned AbortSignal.

The existing Merchant Support provider adds four pure actions:

| Tool suffix after merchant_support_operating_ | Request | Result |
| --- | --- | --- |
| handover_create | {input} | Complete validated handover document |
| handover_inspect | {value} | Complete validated handover document |
| handover_receive | {value,existing?} | Original {plan,reused,addedRevisions} |
| handover_render | {value,format:"json" or "html"} | Full value or readable text |

MCP arguments are supplied JSON values. Native archive and filesystem commands remain explicit local operations. The provider's original async lifecycle and error translation are preserved.

## Explicit size and format bounds

| Selection | Maximum |
| --- | ---: |
| Complete HANDOVER.json | 256 MiB |
| Source descriptors and returned reviews | 100 each |
| One original companion metadata JSON | 32 MiB |
| Original companion external binary member | 512 MiB |
| Original companion manifest member total | 4 GiB |
| One original companion manifest | 310,000 members |
| Complete archive companion inventory | 620,000 members |
| Whole portable TAR including headers and document | 16 GiB |

Individual plans and returned-work wrappers retain their original model bounds. The document ceiling is independent of binary companion size. Base64 OperatingFiles already in the selected original histories remain intact within that metadata ceiling.

Archive headers and padding are read through a bounded 1 MiB window. File hashing streams 1 MiB slices. Only regular files and a bounded POSIX path extension are accepted; links, duplicate paths, traversal, unexpected padding and undeclared members are rejected. UTF-8 filenames survive through explicit PAX path records.

Browser hashing embeds the unchanged MIT emn178/js-sha256 1.0.0 implementation, commit 9a54fb31d4594762987e1b5d175265f6bac921de, original blob e3a08633357cb7ca248e14751f9270d95fbbbdf2. Its complete copyright and license remain in support-operating-handover-hash.mjs. Native hashing uses the existing Node SHA-256 implementation.

## Validation and actual receiving

The source checks exercise the complete archive reader/writer, original plan and return engines, long UTF-8 filenames, full hashes, corrupt headers, missing or changed members, source-origin conflicts, completed reviews, later compatible histories and MCP argument rejection. They use explicitly controlled fixtures.

The native command and browser storage lifecycle have also received complete independent source review, including first-write recovery, original immutable file handling, original source receiving and retained history. A real customer receiving result comes from the selected original case and its returned archive/receipts. Keep that execution identity alongside the package; source checks do not create such a result.
