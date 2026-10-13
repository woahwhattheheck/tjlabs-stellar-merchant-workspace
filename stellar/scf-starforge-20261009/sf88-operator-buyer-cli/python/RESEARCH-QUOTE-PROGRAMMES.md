# Research quotation programmes from Python

This installed operator carries the original commercial case, quotation reviews,
customer brief and response, paid publication and realized report through one
retained Research programme. It exports the complete selected case and Research
customer files, prepares a destination-specific review, and receives through the
existing case and dossier writers.

The Python client owns its original call journal and complete local files. The
installed Node programme engines own programme steps, package publication and
receiving. The selected Research hosts retain their original case, pricing,
dossier and Buyer operations. Closing a Python client drains its own accepted
calls and leaves those hosts running.

## Installation and directories

Use the Python package and Node checkout from the same installed source cohort.
Python 3.10 or later is required by the typed union syntax. Keep the original
supported Node runtime and Research launch configuration.

The installed entry point is:

~~~sh
python -m stellar_forge_buyer.research_cli --help
~~~

The global arguments precede the command. `--directory` is the Python call
journal; `--checkout` selects the original installed Node source; `--connection`
selects an existing Research connection file. A connection file can contain
authentication material: keep it private and pass its path, not its content.

Keep these directories distinct:

| Directory | Owner and retained contents |
| --- | --- |
| Python `--directory` | Original client identity, complete input files, requests, attempts and replies. |
| `--programme-directory` | Original programme input, selected workspace/case identity and immutable steps. |
| `--handover-directory` | Native export request and first complete handover publication. Use the returned package directory afterward. |
| `--package-directory` / copy `--target` | Complete package with `quotation-programme.json` and every manifest member. |
| `--receiving-directory` | Complete retained incoming package, destination review, native transfer and receiving completion. |
| Example `--directory` | Selection, original input copies, separate client journals and source/destination phase records. |

Use absolute private paths. Reusing one native operation directory for a different
purpose or a changed request is rejected. An exact retry keeps its original
directory, IDs, complete input and expected hashes.

The examples below use shell variables that must point to actual selected
workspaces and original input files. They do not create a Research host, a Buyer
order, a commercial case or customer data implicitly.

## Retain and operate a programme

Prepare a complete programme input with these exact fields:

| Field | Meaning |
| --- | --- |
| `schema` | `sf88-research-quotation-programme/v1` |
| `id`, `name` | Stable programme identity and operator title. |
| `dossierId`, `revision` | Original dossier and selected native revision. |
| `projectId` | Original customer project. |
| `caseId` | Original commercial case UUID. |
| `caseMode` | `EXISTING` selects the existing case; `CREATE` retains the intention for a later original `create-case` step. |

Obtain IDs and revisions from the original Research and commercial views.
`CREATE` does not itself commission a replacement case. Submit its original
`create-case` input as a subsequent retained step.

~~~sh
python -m stellar_forge_buyer.research_cli \
  --directory "$SCF_PYTHON_RUN" --checkout "$SCF_CHECKOUT" \
  --connection "$SCF_SOURCE_CONNECTION" \
  quotes-programme-create \
  --expected-workspace-id "$SCF_SOURCE_WORKSPACE_ID" \
  --programme-directory "$SCF_PROGRAMME" \
  --input "$SCF_PROGRAMME_INPUT" --input-sha256 "$SCF_PROGRAMME_INPUT_SHA256" \
  --call-id customer-programme-create
~~~

The complete raw input bytes are retained before dispatch. Their native request
IDs stay inside the original input. A Python `--call-id` is a separate stable
journal identity; changing an input while reusing that identity is rejected.

Each source step uses an explicit `--step-id`. Native step IDs are lowercase
letters/digits followed by lowercase letters, digits, dot, underscore or hyphen,
up to 80 characters. A step's original input remains a complete file even when
its case record is too large for a useful terminal reply.

~~~sh
python -m stellar_forge_buyer.research_cli \
  --directory "$SCF_PYTHON_RUN" --checkout "$SCF_CHECKOUT" \
  --connection "$SCF_SOURCE_CONNECTION" \
  quotes-programme-submit \
  --programme-directory "$SCF_PROGRAMME" --step-id brief-review \
  --native-command prepare \
  --input "$SCF_BRIEF_INPUT" --input-sha256 "$SCF_BRIEF_INPUT_SHA256" \
  --call-id customer-brief-review
~~~

Supported native commands are `create-case`, `native-case`, `pricing`, `prepare`,
`apply`, `prepare-response`, `prepare-publication`, `enroll-publication`,
`prepare-report`, `prepare-case-transfer` and `apply-case-transfer`.

For `native-case`, supply the original commercial `--action`. For `pricing`,
supply both `--profile` and the original pricing `--action`. Other commands reject
these extra selections. All full input schemas and native commercial/pricing
actions remain those in [RESEARCH-QUOTES.md](RESEARCH-QUOTES.md).

Read the complete source step and its actual review before applying it:

~~~sh
python -m stellar_forge_buyer.research_cli \
  --directory "$SCF_PYTHON_RUN" --checkout "$SCF_CHECKOUT" \
  quotes-programme-step \
  --programme-directory "$SCF_PROGRAMME" --step-id brief-review \
  --output "$SCF_REVIEW_OUTPUT"

python -m stellar_forge_buyer.research_cli \
  --directory "$SCF_PYTHON_RUN" --checkout "$SCF_CHECKOUT" \
  --connection "$SCF_SOURCE_CONNECTION" \
  quotes-programme-apply \
  --programme-directory "$SCF_PROGRAMME" \
  --source-step-id brief-review --step-id brief-apply \
  --review-sha256 "$SCF_DISPLAYED_REVIEW_SHA256" \
  --call-id customer-brief-apply
~~~

The apply step derives the proper original apply/enroll/transfer command from
the selected source step. It requires that exact displayed review SHA. It does
not silently approve a newly computed review.

`quotes-programme-replay` uses a distinct step ID to reach the same original
request. It preserves the original request UUID and input. This is useful for an
explicit replay observation and is different from `--resume`, which continues
the same saved Python call and original native step after interruption.

~~~sh
python -m stellar_forge_buyer.research_cli \
  --directory "$SCF_PYTHON_RUN" --checkout "$SCF_CHECKOUT" \
  --connection "$SCF_SOURCE_CONNECTION" \
  quotes-programme-replay \
  --programme-directory "$SCF_PROGRAMME" \
  --source-step-id brief-review --step-id brief-review-replay \
  --call-id customer-brief-replay
~~~

The complete current programme and all step summaries are available through
`quotes-programme-state`. The programme does not replace the underlying case,
pricing, Research or payment histories.

## Export the complete original selection

The handover input is a complete JSON object:

| Field | Required selection |
| --- | --- |
| `schema` | `sf88-research-quotation-handover-request/v1` |
| `requestId` | Original native export request UUID. |
| `programmeDirectory` | Absolute path of the existing reviewed programme. |
| `caseRevision` | Exact selected native case revision. |
| `deliveryId`, `revision` | Original completed Research customer delivery and revision. |
| `sourceWorkspace` | `null`, or the original included source selection with `library`, string `actor` and `requestId`. |
| `stepIds` | Explicit ordered saved step IDs, or `null` to freeze every completed step at the first capture. |

The exporter retains the original input and freezes the first complete
selection. It includes the exact case record, programme and step inputs, the
complete selected native operation files, each required completed publication
bundle and the original customer handover. Its original semantic inspector
checks the complete selected set and each file.

~~~sh
python -m stellar_forge_buyer.research_cli \
  --directory "$SCF_PYTHON_RUN" --checkout "$SCF_CHECKOUT" \
  --connection "$SCF_SOURCE_CONNECTION" \
  quotes-programme-export \
  --handover-directory "$SCF_EXPORT_OPERATION" \
  --input "$SCF_HANDOVER_INPUT" --input-sha256 "$SCF_HANDOVER_INPUT_SHA256" \
  --call-id customer-programme-export --output "$SCF_EXPORT_REPLY"
~~~

Retain the returned `directory` and `manifestSha256`. The directory is the actual
complete package, which can differ from the export operation root. Copy every
member and `quotation-programme.json` together.

A full native semantic inspection and an original create-only copy are available:

~~~sh
python -m stellar_forge_buyer.research_cli \
  --directory "$SCF_PYTHON_RUN" --checkout "$SCF_CHECKOUT" \
  quotes-programme-inspect \
  --package-directory "$SCF_PACKAGE" --manifest-sha256 "$SCF_MANIFEST_SHA256"

python -m stellar_forge_buyer.research_cli \
  --directory "$SCF_PYTHON_RUN" --checkout "$SCF_CHECKOUT" \
  quotes-programme-copy \
  --source-directory "$SCF_PACKAGE" --target "$SCF_COPIED_PACKAGE" \
  --manifest-sha256 "$SCF_MANIFEST_SHA256" --call-id customer-package-copy
~~~

These operations use the installed Node engine and local files. Copy needs no
live Research host. On an exact retained native copy reopen, the source directory
may be omitted. When retrying a recorded Python call, keep its original arguments
or use `quotes-programme-recover`; changing its retained selection is not a retry.

## Review and receive on the destination

Use a separate Python call journal and the actual destination Research
connection. The receiving input contains:

| Field | Meaning |
| --- | --- |
| `schema` | `sf88-research-quotation-programme-receiving/v1` |
| `requestId` | Stable original receiving UUID. |
| `expectedWorkspaceId` | Exact destination Research workspace. |
| `expectedCasesWorkspaceId` | Exact destination commercial case store. |
| `expectedRevision` | `null` for a new destination case, or the exact current destination case revision. |
| `sourceActor` | Original source actor where required by an included Europe PMC source; otherwise `null`. |

~~~sh
python -m stellar_forge_buyer.research_cli \
  --directory "$SCF_DESTINATION_PYTHON_RUN" --checkout "$SCF_CHECKOUT" \
  --connection "$SCF_DESTINATION_CONNECTION" \
  quotes-programme-receive-prepare \
  --expected-workspace-id "$SCF_DESTINATION_WORKSPACE_ID" \
  --receiving-directory "$SCF_RECEIVING_OPERATION" \
  --source-directory "$SCF_COPIED_PACKAGE" \
  --manifest-sha256 "$SCF_MANIFEST_SHA256" \
  --input "$SCF_RECEIVING_INPUT" --input-sha256 "$SCF_RECEIVING_INPUT_SHA256" \
  --call-id customer-receiving-review --output "$SCF_DESTINATION_REVIEW"
~~~

Read that full review. It binds the complete incoming selection, destination
identities, original case transfer and customer receiving selection. The receiver
retains its own complete incoming copy. Applying uses the displayed review:

~~~sh
python -m stellar_forge_buyer.research_cli \
  --directory "$SCF_DESTINATION_PYTHON_RUN" --checkout "$SCF_CHECKOUT" \
  --connection "$SCF_DESTINATION_CONNECTION" \
  quotes-programme-receive \
  --receiving-directory "$SCF_RECEIVING_OPERATION" \
  --review-sha256 "$SCF_DESTINATION_REVIEW_SHA256" \
  --call-id customer-receiving-apply --output "$SCF_RECEIVING_RESULT"
~~~

The original case and dossier writers retain their exact native histories and
request recovery. The completion identifies the actual destination case
revision, dossier, customer project and delivery. `quotes-programme-receiving`
opens the saved native receiving state and its complete retained package.

A source package or copied donor may be removed after the receiver has retained
the complete input. Its saved completion reopens its own package. Keep the
receiving operation and Python journal; removing those is not donor relocation.

## Complete four-phase Python example

[examples/research_quote_programme_receiving.py](examples/research_quote_programme_receiving.py)
is an executable operator for one already reviewed programme and an independent
destination. It uses the actual methods above. It does not manufacture customer
data, source identities, review hashes or a paid transaction.

Prepare `handover.json` and `receiving.json` from the actual selections above.
Save the source and destination outputs of `quotes-configuration` as
`source-configuration.json` and `destination-configuration.json`. Their original
`workspaceId` and `cases.workspaceId` are the identity inputs below.

This creates the complete immutable example selection beside those four files:

~~~python
from pathlib import Path
import hashlib
import json
import os

root = Path("/absolute/private/reviewed-inputs")
source = json.loads((root / "source-configuration.json").read_text())
destination = json.loads((root / "destination-configuration.json").read_text())

def file(name):
    body = (root / name).read_bytes()
    return {"file": name, "bytes": len(body),
            "sha256": hashlib.sha256(body).hexdigest()}

selection = {
    "schema": "stellar-forge.research-quote-programme-receiving-example.v1",
    "operationId": "customer-programme-receiving",
    "source": {"workspaceId": source["workspaceId"],
               "casesWorkspaceId": source["cases"]["workspaceId"]},
    "destination": {"workspaceId": destination["workspaceId"],
                    "casesWorkspaceId": destination["cases"]["workspaceId"]},
    "handover": file("handover.json"),
    "receiving": file("receiving.json"),
}
body = json.dumps(selection, ensure_ascii=False, allow_nan=False,
                  separators=(",", ":")).encode("utf-8")
path = root / "selection.json"
descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(descriptor, "wb") as output:
    output.write(body)
    output.flush()
    os.fsync(output.fileno())
print(hashlib.sha256(body).hexdigest())
~~~

The example requires distinct source/destination Research and case-store
identities. Keep the printed selection SHA. Its paths are relative to the
selection file; every complete raw input is copied into the example operation
before native dispatch. An exact later continuation can use those retained
inputs when the original donor files are absent.

Run the four phases using the same private example directory and selection:

~~~sh
python examples/research_quote_programme_receiving.py source \
  --selection "$SCF_SELECTION" --selection-sha256 "$SCF_SELECTION_SHA256" \
  --directory "$SCF_RECEIVING_EXAMPLE" --checkout "$SCF_CHECKOUT" \
  --source-connection "$SCF_SOURCE_CONNECTION"

python examples/research_quote_programme_receiving.py prepare \
  --selection "$SCF_SELECTION" --selection-sha256 "$SCF_SELECTION_SHA256" \
  --directory "$SCF_RECEIVING_EXAMPLE" --checkout "$SCF_CHECKOUT" \
  --destination-connection "$SCF_DESTINATION_CONNECTION" \
  --output "$SCF_EXAMPLE_REVIEW"

python examples/research_quote_programme_receiving.py receive \
  --selection "$SCF_SELECTION" --selection-sha256 "$SCF_SELECTION_SHA256" \
  --directory "$SCF_RECEIVING_EXAMPLE" --checkout "$SCF_CHECKOUT" \
  --destination-connection "$SCF_DESTINATION_CONNECTION" \
  --review-sha256 "$SCF_ACTUAL_EXAMPLE_REVIEW_SHA256"

python examples/research_quote_programme_receiving.py reopen \
  --selection "$SCF_SELECTION" --selection-sha256 "$SCF_SELECTION_SHA256" \
  --directory "$SCF_RECEIVING_EXAMPLE" --checkout "$SCF_CHECKOUT"
~~~

The review SHA in the third command is `result.review.reviewSha256` from the
actual prepare reply. The example retains that explicit choice before apply.
It does not use a newer review without your selection.

The first-complete original call is reopened before any live configuration
lookup. Failed or interrupted calls continue through the same native request
and journal. The source and destination clients close before their complete
phase records publish. An interruption after native completion but before phase
publication is recovered from that same saved call.

The final `reopen` reads the original destination prepare/apply calls and all
files of the receiver-owned package. It does not require either live host or
the departed export/copy donor. The installed source is still selected for the
original Python workspace constructor, but this phase starts no Node process.
It verifies the saved receiving record; it does not claim that later mutable
destination state has not advanced.

The example retains `selection/`, `inputs/`, `source-client/`,
`destination-client/`, `handover-operation/`, `copied-handover/`,
`receiving-operation/` and `records/`. Copy the complete operation if you need its
full local operating history. Use the native package itself for portable
customer receiving.

## Saved calls, interruption and offline files

Every writing command requires a stable `--call-id`. For a failed attempt, either
repeat its exact command with `--resume` or ask the original journal to recover:

~~~sh
python -m stellar_forge_buyer.research_cli \
  --directory "$SCF_DESTINATION_PYTHON_RUN" --checkout "$SCF_CHECKOUT" \
  quotes-programme-saved customer-receiving-apply

python -m stellar_forge_buyer.research_cli \
  --directory "$SCF_DESTINATION_PYTHON_RUN" --checkout "$SCF_CHECKOUT" \
  --connection "$SCF_DESTINATION_CONNECTION" \
  quotes-programme-recover customer-receiving-apply
~~~

`saved` validates its complete first successful reply and retained files.
`recover` uses the saved request, source paths, hashes and native IDs. A completed
call is returned without another host request. An incomplete operation may need
the original host; an absent or changed retained member remains an error.

The five pure Python handover commands need neither `--checkout` nor
`--connection`. They require the original manifest SHA and verify the entire
manifest roster before opening a selected file:

~~~sh
python -m stellar_forge_buyer.research_cli --directory "$SCF_OFFLINE_JOURNAL" \
  quotes-programme-open \
  --package-directory "$SCF_RECEIVED_PACKAGE" \
  --manifest-sha256 "$SCF_MANIFEST_SHA256"

python -m stellar_forge_buyer.research_cli --directory "$SCF_OFFLINE_JOURNAL" \
  quotes-programme-case-record \
  --package-directory "$SCF_RECEIVED_PACKAGE" \
  --manifest-sha256 "$SCF_MANIFEST_SHA256" --file "$SCF_CASE_RECORD_COPY"

python -m stellar_forge_buyer.research_cli --directory "$SCF_OFFLINE_JOURNAL" \
  quotes-programme-operation-file \
  --package-directory "$SCF_RECEIVED_PACKAGE" \
  --manifest-sha256 "$SCF_MANIFEST_SHA256" \
  --id "$SCF_NATIVE_OPERATION_ID" --file "$SCF_OPERATION_COPY"
~~~

The other two offline commands are `quotes-programme-file --name NAME --file PATH`
and `quotes-programme-handover-step-input --step-id ID --file PATH`.
`quotes-programme-step-input` opens a step still in a native programme and uses
the installed Node local reader. All copies use the original exclusive file
publisher; an existing exact destination can be reopened, and changed content
is never replaced.

Python callers have the same complete-file access:

~~~python
from stellar_forge_buyer.research_quote_programmes import ResearchQuoteProgrammeHandover

handover = ResearchQuoteProgrammeHandover.reopen(
    package_directory, expected_manifest_sha256=manifest_sha256)
handover.verify()
with handover.case_record.open() as source:
    # Consume complete bytes through this original verified file descriptor.
    consume(source)
with handover.operation_export(native_operation_id).open() as source:
    consume(source)
with handover.step_input(step_id).open() as source:
    consume(source)
~~~

`file(name)`, `case_record`, `operation_export(id)` and `step_input(id)` return the
original `FileDelivery`. Use streaming `open()` or `save_as()` for large files;
use `json(limit=...)` only when deliberate full materialization is appropriate.

## Command reference

All commands accept an optional exclusive `--output` for the complete JSON
reply. Global arguments belong before the command.

| Command | Specific required selection |
| --- | --- |
| `quotes-programme-create` | `--programme-directory --input --call-id` |
| `quotes-programme-state` | `--programme-directory` |
| `quotes-programme-step` | `--programme-directory --step-id` |
| `quotes-programme-submit` | `--programme-directory --step-id --native-command --input --call-id` |
| `quotes-programme-apply` | `--programme-directory --source-step-id --step-id --review-sha256 --call-id` |
| `quotes-programme-replay` | `--programme-directory --source-step-id --step-id --call-id` |
| `quotes-programme-export` | `--handover-directory --input --call-id` |
| `quotes-programme-inspect` | `--package-directory`; optional `--manifest-sha256` |
| `quotes-programme-copy` | `--target --call-id`; source on first copy, original hash when selected |
| `quotes-programme-receive-prepare` | `--receiving-directory --input --call-id`; source on first receipt |
| `quotes-programme-receive` | `--receiving-directory --review-sha256 --call-id` |
| `quotes-programme-receiving` | `--receiving-directory` |
| `quotes-programme-saved` | Original positional call ID |
| `quotes-programme-recover` | Original positional call ID |
| `quotes-programme-open` | `--package-directory --manifest-sha256` |
| `quotes-programme-file` | Package/hash, `--name --file` |
| `quotes-programme-case-record` | Package/hash, `--file` |
| `quotes-programme-operation-file` | Package/hash, `--id --file` |
| `quotes-programme-handover-step-input` | Package/hash, `--step-id --file` |
| `quotes-programme-step-input` | `--programme-directory --step-id --file` |

Complete input commands also accept `--input-sha256`. Writing commands accept
`--resume`. Non-offline commands accept `--expected-workspace-id`. The original
native limits apply independently: ordinary quotation inputs are 96 MiB plus
65,536 bytes; the dedicated original case-transfer bound is 602,962,240 bytes.
Ordinary file bodies keep their 256 MiB bound; handover case members carry the
dedicated case bound plus the native framing allowance. The package roster has
at most 40,000 members. The client does not shrink a full case into a summary.

The original control response deliberately projects large content into files:
a step exposes `inputFile`, a package exposes `caseRecordFile`, and each native
operation exposes `operationFile`. The complete underlying bytes stay included.
The full typed records are in
[research_quote_programme_types.py](stellar_forge_buyer/research_quote_programme_types.py).

## Verification and custody

Source review confirms the command/type/bridge contracts, exact request replay,
file pinning and acquired-client closure. An actual native operation must report
its own result; source publication is not a runtime completion.

For native receiving, retain the exact source selection, original installed
cohort, both workspace identities, complete phase replies and full package
manifest SHA. Reopen the received package and original saved apply call after
closing the borrowed clients. Keep the established customer/Buyer owner and
existing operation identities throughout that continuation.
