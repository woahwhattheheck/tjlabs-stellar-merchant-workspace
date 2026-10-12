# Evidence synthesis in the Research workspace

This is the complete installed operator and receiving path for accepted study
results. It uses the original private Analysis workspace, the selected Research
publication, and the source-owned Python Runtime. The [source adoption map](SYNTHESIS_ADOPTION.json)
records every complete application and reference file in this maintained edition.

## Synthesize complete reviewed study results

Open **Evidence synthesis** from the original Analysis browser. This workspace
retains full publication files, immutable protocol editions, native jobs and every
result file in the same Analysis SQLite database. Its private launch capability,
background worker, source history and ordinary workspace archive remain the
existing Analysis ones.

Start from a complete source publication exported by the selected original
Research programme. Keep the original UTF-8 bytes and choose its real results
array and descriptor pointers. For the source-owned Research publication format
used by the BCG programme, those pointers are `/publications/0/rows` and
`/result`. Inspect the actual file before selecting that publication index.
Other complete source shapes use their own explicit pointers. The source page
keeps original descriptor fields and lexical numeric values; its local descriptor
digest is a separate envelope field.

1. **Import and inspect.** Choose the complete file, name the publication and
   supply its current revision for a following edition. Open each original
   accepted result, Study reference, field value and source binding. Source
   paging stays pinned to the selected publication revision.
2. **Define and select.** Name the protocol, question, reviewer and rationale.
   Record population, outcome, intervention, comparator, timepoint, estimand and
   unit. Include or exclude each intended result with a reason and explicit
   comparability/independence choices. Select one independent contribution per
   Study; preserved exclusions and unselected source rows remain inspectable.
3. **Map and choose methods.** Select accepted original field IDs or a declared
   sum of fields. Choose the compatible binary, continuous or reported-effect
   input, effect measure, model, interval, variance method and zero-cell rule.
   Save prespecified subgroup and sensitivity definitions against their exact
   result IDs. Original fields and each transformation travel with the result.
4. **Save, reopen and review.** Save an immutable protocol edition, reopen it
   against its original publication, and choose **Review saved edition**.
   Inspect all included/excluded decisions, duplicate-Study conflicts, numeric
   operands and runtime availability. An edited draft must be saved and reviewed
   as its following edition before running.
5. **Run and receive.** Choose **Run reviewed synthesis**. The original worker
   retains its 32-hex job ID, protocol revision and digest. Refresh, cancellation
   and deliberate resume keep that same job. Open the completed primary,
   subgroup, sensitivity and leave-one-study-out results and receive its original
   figures, report, CSVs, full JSON, publication and complete ZIP.
6. **Continue the whole workspace.** Export the normal Analysis workspace,
   restore it through the original archive receiver and reopen the saved
   publication, protocol and run. A later source or protocol edition becomes an
   explicit following selection, with earlier complete results still available.

The [complete synthesis operator and SDK guide](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/SYNTHESIS_OPERATOR.md)
documents every input structure, numeric field and method control, seven-part
comparability, original source projection, browser recovery and verified file
receiving. The [installed synthesis receiving section](#receive-the-complete-synthesis-product)
connects that same workflow to the selected Python runtime and its CLI.

**Recovery** retains and reads back each original request before dispatch.
A lost or malformed reply leaves its exact source/protocol/run request available
for the same retry. Drafts and in-progress row decisions remain attached to the
original workspace. Exporting that recovery file carries the original requests
and draft; importing it after opening the same workspace selects them without
automatically dispatching a new operation.

## Receive the complete synthesis product

Build the existing complete `research-workspace` selection using the
[original installation and receiving guide](RECEIVING.md). It
includes the original Analysis host, synthesis engine/store/reports, complete
browser module, Python SDK, CLI and guides. The selected source retains the
complete buyer Python project and distribution. The original Python Runtime
command map exposes its `stellar-forge-synthesis` entrypoint; this product keeps
the Research selection’s existing contribution list.

Select the customer's existing Python environment and this release's original
package. The calculation dependency is the declared `synthesis` extra; combine
it with `workbooks` when both products are required:

~~~sh
python3 -m pip install \
  '/absolute/installed-source/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python[workbooks,synthesis]'

python3 -m stellar_forge_buyer.synthesis_cli engine
~~~

The extra selects `statsmodels==0.15.0` and `matplotlib==3.10.8`; the native
engine reports its actual statsmodels, NumPy, SciPy and Matplotlib versions.
Keep an existing matching installation. The original Python Runtime workspace
can also review, install, activate, export and receive that exact source/extra
selection; its returned command map identifies this installation's synthesis
entrypoint.

Use the existing private Analysis directory and its original launcher. The
browser's **Evidence synthesis** link uses the same host and capability. Import
the complete original publication, inspect accepted results and their source
fields, save the full reviewed protocol and create the first run in that browser.
Retain its actual source name/revision, protocol name/revision/SHA and original
job ID.

The CLI's `--live` mode borrows that same running workspace through the shipped
SDK. Inspect and receive the browser's original result:

~~~sh
python3 -m stellar_forge_buyer.synthesis_cli \
  --database /srv/starforge/customer/analysis --live \
  result --id ORIGINAL_SYNTHESIS_JOB_ID

python3 -m stellar_forge_buyer.synthesis_cli \
  --database /srv/starforge/customer/analysis --live \
  receive --id ORIGINAL_SYNTHESIS_JOB_ID \
  --output /srv/starforge/customer/delivery/synthesis
~~~

Use the actual 32-hex ID returned by the original browser. Source and protocol
commands list and reopen their named immutable editions; write commands consume
a complete retained request JSON, its original ID and a private operation
directory. The full CLI supports original import/save/review/run/cancel/resume,
history and complete source/result receiving. The [complete operating guide](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/SYNTHESIS_OPERATOR.md#python-sdk)
also provides the corresponding `WorkspaceSynthesisClient` methods.

Every received file binds its full name, byte count, MIME and SHA-256. Interrupted
HTTP receiving resumes the same partial file through original Range/If-Range
headers and checks the complete digest before publication. An already complete,
matching file reopens. Keep the original private receiving directory and full
manifest with the delivered report, figures, publication, protocol, diagnostic
CSVs, JSON and ZIP.

The complete synthesis state is part of the normal `datasets.sqlite3` archive:
publication raw bytes, every protocol edition, native run result and output
BLOBs. Receive the ordinary full Analysis workspace with its original archive
helper, then reopen the same publication/protocol/job identities and compare each
delivered file's byte identity. The received workspace supports continued
source/protocol authoring and subsequent native runs.

The [source-native browser receiving programme](../../stellar/scf-starforge-20261009/distribution/receiving/synthesis/BROWSER_RECEIVING.md)
operates the actual source import, protocol editing/reopening, review, first
original run, complete downloads and desktop/narrow views. Its caller supplies
the retained original publication and selected protocol file, owns the existing
Analysis host and keeps its stable workspace and listener identity for resume.
The same complete native operation continues through SDK, installed CLI and
ordinary archive/reopen; the original receiving owner retains its one job and
output directory.

## Receive the original reference programme

The selected source includes the complete thirteen-study BCG reference under
`stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/examples/synthesis-bcg-reference/`.
It retains the original table, dictionary, construction source, package metadata,
complete methods article, exact source-token projection, protocol and publication
programme. Its [source and method guide](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/examples/synthesis-bcg-reference/README.md)
explains the selected trial cohort, original quantities, accepted-result projection
and method comparisons.

The full native programme uses the complete original Research extraction and
publication implementation, carried by the following Research customer/workbook
edition from public source PR2320. Keep that source closure with the synthesis
files when selecting its original receiving configuration. The standalone
Research source owner composes that producer in the same maintained product.

Use the [complete native controller instructions](../../stellar/scf-starforge-20261009/distribution/receiving/synthesis/BROWSER_RECEIVING.md#continue-the-complete-native-programme)
with the actual retained source digest and the original private receiving
directory. `receive_synthesis_reference.py --phase prepare --config ...` uses
the original runtime resolver and selected installation, receives the real
publication, lets the browser create the first protocol/run, then opens that same
job through the SDK and installed CLI. It retains the original complete archive,
reopened workspace, verified resumed download and complete customer outputs.

The original operation's source selection, workspace, protocol, job and native
file-transfer identities remain fixed across interruption and continuation.
Its final receiving record links the complete report, numerical files, figures,
source publication, Research dossier, workspace archive and actual operator
screenshots to that same execution.
