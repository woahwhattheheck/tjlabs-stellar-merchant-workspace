# Records operations: selected installation and complete receiving

This product installs the original Records workbench, its reconciliation engine,
the complete workbook and custody receiving interface, and the maintained Python
workspace. Operators use one retained source history for ledger correction,
invoice review, inventory and transitions, customer mapping, monthly reporting,
original-file delivery, and subsequent reopening.

The `records-operator` recipe selects this whole application and the original
runtime installation, Applications and Python operating tools. It declares eight
runtime/product commands, eighteen explicit package exports, and the Records
and Python Applications providers. The normal common `starforge` commands remain
available. Private source workbooks, issuer documents, customer ledgers, proposal
material, credentials and native operating histories are supplied by their owners;
they are not embedded in this source product.

## Select the original committed product

Use the existing [Build a product workspace](../runtime-workspace/SOURCE_BUILDS.md).
Choose an actual retained repository, resolve its committed source and select
**Records operations and original workbook receiving**. Review the returned
commit, recipe, commands, applications, original browser sources and package
identity. Build with that saved review in the existing output and retain the
original operation UUID through interruptions.

The same original builder is available at the command line:

```sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/existing/tjlabs-stellar-merchant-workspace \
  --ref ACTUAL_COMMITTED_SOURCE \
  --selection records-operator \
  --out /absolute/releases/records-operator
```

Use the source commit returned by the actual completed builder. A later source
revision belongs to a new selected release/output; an interrupted build retains
its original source, recipe, UUID and output. [Source selections](../SOURCE_SELECTIONS.md)
and [building and continuation](../BUILDING.md) describe that original behavior.

The recipe retains the complete Records component, original Python workers and
workspace, native seller-release and customer-client source, original managed
release code, runtime workspace UI and workers, Python runtime preparation,
canonical browser manifest reader and schema package declarations. The original
builder collects static relative imports and all declared browser modules from
their actual source; dynamic workers and source-read files are explicitly selected.

## Receive and install that archive

Use the completed builder's archive path, full SHA256 and original manifest.
If a local command environment is required, install that exact existing archive:

```sh
npm install --ignore-scripts --offline --omit=optional /absolute/downloads/original-records-package.tgz
./node_modules/.bin/starforge registrations --source records-operator
```

For a new private operator runtime, the original selected installation is:

```sh
./node_modules/.bin/starforge runtime-install prepare \
  --dir /absolute/private/records-runtime \
  --archive /absolute/downloads/original-records-package.tgz \
  --sha256 ACTUAL_ARCHIVE_SHA256 --feature schema --operator
./node_modules/.bin/starforge runtime-install install \
  --dir /absolute/private/records-runtime
./node_modules/.bin/starforge runtime-install run \
  --dir /absolute/private/records-runtime -- source
```

The operator profile retains the selected archive and exact declared dependency
versions. Its existing host requirements include Linux, Python 3.11 or later and
`flock`; use the Node version required by the selected archive/profile. An existing
Node 24 runtime is suitable for the maintained native SQLite workspace. The OOXML
workbook receiver and Records decimal engine use Python's standard library. This
workflow does not install an additional spreadsheet parser or another database.

If native paid Python serving is part of the actual deployment, select `--native`
in the same original runtime review and supply the real merchant declaration and
existing signer/facilitator setup. Private Records previews and file exports do not
make a buyer payment. A service implementation quote is not an API-call price.

Use [runtime installation and recovery](../RUNTIME_INSTALL.md) for the retained
install operation and [runtime transfer](../RUNTIME_TRANSFER.md) for a complete
already-prepared runtime. A source archive alone is not a READY installation.
Preserve the actual archive, runtime directory, profile, lock, source root and
read-back status returned by the original installer.

## Open an existing Records workbench

Prefer an already initialized workbench or its original complete portable bundle.
Select the actual READY runtime/source root from the installer. In a command
environment for that selected runtime:

```sh
starforge records-workspace status --dir /absolute/private/records-operation
starforge records-workspace serve --dir /absolute/private/records-operation --port 8431
```

The source root defaults to the selected installed package. An explicit
`--source-root ACTUAL_SOURCE_ROOT` selects the same canonical layout when an
existing receiver supplies it. The printed operator URL opens
`/records-operator/`; the original Python source workspace remains at `/` on
the same authenticated local origin. Keep the printed token with its operator.

For a genuinely new workbench, use the original complete input contract:

```sh
starforge records-workspace create \
  --dir /absolute/private/new-records-operation \
  --dataset /absolute/received/workspace.json
```

The dataset follows [INPUT_HANDOFF.md](../../sf30-seller-sdk/records-operator/INPUT_HANDOFF.md)
and [CORE_CONTRACT.md](../../sf30-seller-sdk/records-operator/CORE_CONTRACT.md).
It retains exact CSV/JSON ledgers and separately declared original workbooks and
documents. Choose the actual department/site, vendor, period, currency and source
edition. Supplied row identity, source amount scale, retention/rate authority,
custody events and current reviews stay explicit. A new location is create-only;
the existing operation's identical interrupted creation resumes its own inputs.

## Workbooks, ledgers and original evidence

The **Workbook receiving and custody** view retains the original XLSX bytes,
every worksheet, exact selected ranges, all physical rows including blanks,
merged-cell anchors, literal formulas, cached values, styles and original date
system. The operator chooses exact column/cell selectors after viewing those
original values. No generic template profile guesses a worksheet layout.

Record an original mapping and named source review. Blank rows remain visible
until their exact selected range receives an explicit non-record decision.
A temporary transfer number stays a request identifier; a permanent carton ID,
actual site and actual admission/withdrawal/destruction event require their real
source or an attributed reviewed value. A scheduled destruction date is retained
as a schedule and never becomes an actual custody event automatically.

The same view receives original instructions, signed custody documents,
destination receipts and inventory. It records each department's actual
acknowledgment separately. The explicit `requireBothAcknowledgments` option
follows the chosen transfer's actual requirements. Custody-source readiness
by itself does not assert that a two-sided form was signed. An independently
evidenced warehouse receipt may establish an actual event where the selected
source workflow permits it.

Only explicit input actions change the working draft. Merely displaying the
mapping, context or acknowledgment section leaves the saved source untouched.
Local drafts and unresolved original save requests persist in the original
IndexedDB store. Save creates an immutable native revision; source-bound
inspection and review use that saved revision.

For financial work, retain the complete original sites/rates/cartons/events/
invoices inputs. Correct the explicitly mapped source value, preserving the raw
original and its source identity. The same engine calculates decimal amounts,
fractional quantities, original proportional credits, tiers, minimums and
configured fees. Inventory, source findings, human decisions and AP amounts stay
available together. Monthly calculation and full-calendar coverage are distinct:
a known subtotal from a partial month remains labelled partial.

The complete [workbook guide](../../sf30-seller-sdk/records-operator/WORKBOOKS.md),
[operator guide](../../sf30-seller-sdk/records-operator/OPERATIONS.md) and
[browser guide](../../sf30-seller-sdk/records-operator/UI.md) contain the actual
source, decision and delivery shapes.

## Save and operate through Applications

Attach the actual completed runtime to the existing runtime workspace if it is
not already present, then use its original **Applications** view:

```sh
starforge runtime-workspace attach \
  --workspace /absolute/private/existing-runtime-workspace \
  --runtime /absolute/private/records-runtime --label "Records runtime"
starforge runtime-workspace serve \
  --workspace /absolute/private/existing-runtime-workspace
```

Choose **Records operations**, select the initialized workbench root and choose
an explicit local port or `0`. **Review** binds the original marker and immutable
workspace ID, the actual selected runtime/source and all nineteen managed launch
leaves. **Save** retains that reviewed application. Normal source revisions,
preview outputs and review edits remain mutable work inside the same identity.

Use the original **Connect**, **Review Start**, **Start**, **Open** and **Stop**
controls. The native managed wrapper reads the exact source and original
workspace, opens its original server, then emits the startup record. The
maintained observer checks that record and the authenticated live `/api/state`
before exposing Open. Stop closes that owned operation. Starting again reopens
the same saved workspace with a new listener and retained history.

Full CLI request shapes and recovery are in
[INSTALL.md](../../sf30-seller-sdk/records-operator/INSTALL.md). Keep its actual
application ID, review IDs, request UUIDs and start-operation ID. Recover the
same interrupted operation through the original `application-recover` flow;
do not alter its saved request or infer a live owner from a historical PID.

## Export every selected row and reopen

Choose the actual completed `build_records` preview from the saved intended
revision. Its full exporter reconstructs that exact native revision and streams
the original processor's complete selected rows:

```sh
starforge records-workspace handoff \
  --dir /absolute/private/records-operation \
  --preview ACTUAL_COMPLETED_BUILD_ID \
  --out /absolute/deliveries/records-handoff --audience operator

starforge records-workspace workbook \
  --dir /absolute/private/records-operation \
  --revision ACTUAL_REVIEWED_REVISION --workbook ACTUAL_WORKBOOK_ID \
  --out /absolute/deliveries/original-workbook
```

The operator handoff retains the exact native result and full portable history,
complete workbook rows and original source documents, the customer-facing
reports, twenty-two operating application/engine/browser/guide files for a
workbook-capable revision, the original installation declaration, and reopening
instructions. Each output has its byte count and SHA256. The dedicated workbook
handoff also contains the unchanged original XLSX, exact selected worksheet rows,
source review, supporting original documents and full portable workbench.

Workbook-row completeness and financial-ledger completeness are separate fields
in the original manifest. Receiving a complete blank form or transfer request
does not assert a supplied customer inventory or complete financial ledger.
Customer mapping operates on the same safe projection used by
`customer_records`; private notes, source paths and correction context stay
in operator material.

Receive the original portable in a new private directory:

```sh
starforge records-workspace reopen \
  --dir /absolute/private/received-records \
  --bundle /absolute/deliveries/records-handoff/operator/workspace.python-workspace.json
starforge records-workspace serve \
  --dir /absolute/private/received-records --port 8431
```

The original workspace ID, revisions, previews, source bytes and review history
are preserved. Reopen retained completed outputs directly. A new receiver does
not run an accepted baseline again. Review the new directory's actual binding
before adding it to Applications. The packaged application can also serve with
the selected canonical native source, as described by its `operator/REOPEN.md`.

## Adopt the workbook-capable source into older saved work

An older saved Records application retains its original code until explicit
adoption. After installing this complete descendant, inspect its current source
and use the original adoption command:

```sh
starforge records-workspace status --dir /absolute/private/records-operation
starforge records-workspace adopt-workbooks \
  --dir /absolute/private/records-operation --revision ACTUAL_CURRENT_REVISION
```

The original command adopts the reviewed workbook-capable source only where the
expected existing source matches. Preserve custom edits and merge them explicitly
in the native source editor. Review/save the resulting actual launch source in
Applications before starting it. Keep the old source release for its retained
operation/history and use a fresh installed release for the successor.

## Source and actual receiving status

This selected product adopts the complete generic Records source from public
PR1888/1922 and workbook PR2044/2126/2172, final source
`1914f19ac2157b462bf125354d683e59923ae891`. The standalone archive binds its own
subsequent commit and exact selected recipe; it does not relabel the public source
commit as an installed result.

Retain the existing native producer and equipped receiver for the selected
customer work. Its completed source/preview/export phases remain accepted;
Applications/installation receiving appends its own actual runtime, managed
source and process results. The product source, parsed module, selected recipe,
built archive, READY runtime and completed operator/customer operation are
reported as their respective observed states.
