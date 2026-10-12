# Receive the complete Fiscal analyst work

Keep the actual installed source, complete source data and all reviewed native
results. The receiving task reopens a useful customer workspace, while the
source operator and recipient each retain their own process ownership.

## Required delivered material

| Material | Meaning and verification |
| --- | --- |
| Original selected distribution archive | Full source commit, source-selection recipe and source manifest; verify the original archive SHA |
| READY runtime/profile receipt | Actual Node/runtime/dependency selection and installation identity |
| Source and edition exports | Complete original responses, metadata, field/null/unit review, row positions and native CSV/JSONL/configuration |
| Comparison delivery | Full selected rows, exact measures, original before/after source and complete delivery manifest |
| Offline briefing | briefing.tar.gz plus original report.json, report.md, dated-measures.csv and briefing manifest |
| Refresh run handover | Frozen plan/run, field rules, original comparison-source archive and complete briefing |
| Portable source package | workspace.fiscal.gz, manifest.json and sealed package identity from the original checkpoint API |
| Operating inputs | Nonsecret source/query profile, named decision record and the public guides |
| Actual receiving result | Exact workspace/edition/comparison/run/file IDs, hashes, completed steps and remaining review decisions |

Preserve the complete original archives even when also presenting extracted
report pages. Private credentials, live process handles and QA screenshots are
not substitutes for a customer deliverable.

## Select and download every original file

The authenticated client first creates one complete file selection. Bind the
actual native record hash where the command supports it:

~~~sh
starforge fiscaldata-remote select \
  --url "$MCP_URL" --workspace treasury --workspace-id "$FISCAL_WORKSPACE_ID" \
  --kind export --id ORIGINAL_EXPORT_UUID \
  --source-sha256 ORIGINAL_EXPORT_MANIFEST_SHA256 \
  --out /srv/private/receiving/export-selection.json

starforge fiscaldata-remote download \
  --url "$MCP_URL" --workspace treasury --workspace-id "$FISCAL_WORKSPACE_ID" \
  --selection /srv/private/receiving/export-selection.json \
  --out /srv/private/receiving/export-files

starforge fiscaldata-remote verify --directory /srv/private/receiving/export-files
~~~

The selection preserves endpoint, alias, workspace UUID, named reader, every
original file name, byte count and SHA. The receiving engine retains byte offsets
and temporary file state. After an interruption, invoke the identical download
with the same selection and output directory. It reconciles already retained
bytes; it does not recreate the comparison, report or source capture.

A completed repeat verifies the original selection and files and reports reuse.
Keep the actual returned selection digest. A changed endpoint, workspace,
selection or file identity requires explicit selection of its new result.

Use the same procedure for kind capture, edition, comparison, export or package.
A comparison/export manifest SHA and the SHA of its archive file are different
identities; retain both fields under their original names.

## Checkpoint under the original owner

Through the named host:

~~~sh
starforge fiscaldata-remote checkpoint \
  --url "$MCP_URL" --workspace treasury --workspace-id "$FISCAL_WORKSPACE_ID" \
  --operation fiscal-customer-checkpoint-01
~~~

The original adapter gates new writes, drains its borrowed browser and accepted
actions, closes the native model, creates its source package, then reopens the
same model. Retain the returned packageId and original workspace.fiscal.gz SHA.

Select kind package with that returned ID, then download and verify through the
same commands above. The original sealed package contains full source/review
state, reports, received acquisitions and saved refresh plans/runs. Live
publisher or buyer configuration is configured separately on the receiving host.

A direct CLI checkpoint is also available after the browser/MCP owner has closed:

~~~sh
starforge fiscaldata checkpoint --dir /srv/private/fiscal/treasury \
  --out /srv/private/fiscal/source-packages \
  --operation fiscal-customer-checkpoint-01 \
  --operator /srv/private/fiscal/operator.json
~~~

Use a stable operation ID for that exact checkpoint invocation. A later intended
workspace checkpoint has its own ID.

## Receive into an independent private directory

Use the client receiving adapter after the complete package download:

~~~sh
starforge fiscaldata-remote receive \
  --directory /srv/private/receiving/package-files \
  --destination /srv/private/received-fiscal \
  --operation-id fiscal-customer-receive-01 \
  --operator-id customer-fiscal-reviewer \
  --operator-label "Customer Fiscal reviewer" \
  --workspace-id "$FISCAL_WORKSPACE_ID"

starforge fiscaldata-remote reopen \
  --directory /srv/private/received-fiscal \
  --workspace-id "$FISCAL_WORKSPACE_ID"
~~~

This uses the existing Fiscal package parser and receiver. It verifies complete
compressed and member bytes, preserves the original workspace identity and
history, and records the receiving operation. It does not use a second dataset
engine. A receiving revision may advance the original workspace header to record
the receive; compare the retained source identities instead of assuming every
administrative revision remains unchanged.

Use the original direct receive command when the package is already available:

~~~sh
starforge fiscaldata package-inspect \
  --package /srv/private/received-package/workspace.fiscal.gz --sha256 ORIGINAL_SHA256

starforge fiscaldata receive --dir /srv/private/received-fiscal \
  --package /srv/private/received-package/workspace.fiscal.gz --sha256 ORIGINAL_SHA256 \
  --operation fiscal-customer-receive-01 --operator /srv/private/fiscal/operator.json
~~~

Do not run both receiving forms for one operation. The same original receiving
ID/input reuses its retained result after interruption. A different unrelated
workspace in the destination is a conflict.

## Reopen and accept the customer operation

After the receiving command closes its model, start the original browser or
register the received directory under a new local connection. Inspect:

1. Original source definitions, pages, hashes and reviewed metadata.
2. READY editions, exact financial strings, null markers and complete native rows.
3. The selected comparison's keys, full row changes and dated measure results.
4. Original comparison/briefing files and every returned byte/hash descriptor.
5. Saved refresh plans and their prior versions, completed run and baseline.
6. An unfinished received run's actual paused or review-required state.
7. Named history, source-package identity and the actual receiving operation.

Received unfinished captures and refresh runs remain paused or review-required
as documented by the original portable contract. Opening the recipient does not
silently fetch another period or promote a baseline. An explicit customer Resume
uses the original retained request.

Open desktop and narrow browser views from the same received workspace when a
browser is available. Then Stop and reopen the same application and confirm the
same records. Keep source/native evidence separate from visual QA captures.

## Continue a partial result

- A capture/network interruption resumes its original capture/run request.
- A schema-review requirement selects the original captured source and exact
  READY reviewed edition.
- A download interruption keeps its original selection and directory.
- A checkpoint/receive interruption keeps the original operation and package.
- A host transport failure requires original status/owner reconciliation before
  a replacement host is started.
- A completed prior source result remains complete while a later receiving or
  native publication step is pending.

The complete native response, original request and verified files establish
completion. A queued run, ready source branch, uploaded manifest or screenshot
alone does not establish a received customer workspace.
