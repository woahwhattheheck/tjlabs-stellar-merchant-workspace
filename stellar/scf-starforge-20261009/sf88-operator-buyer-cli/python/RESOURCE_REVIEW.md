# Python resource library and edition review

Operate the maintained SF88 saved-resource library, comparison worker, decision journal and reviewer-return reconciliation from a Python application or command line. This client owns one Node process for its context lifetime. State remains in the original library; Python does not implement another comparison engine, SQLite schema or payment workflow.

## Run the delivered customer package

Use Python 3.11 or later and Node 22.16 or later on Linux/POSIX. The Python base package and this feature have no third-party Python dependencies. All paths passed to the application are absolute. The checkout is the directory containing `stellar/`, not the Python package directory.

The complete source package accompanying this contribution retains the original C12 resource-review runtime. After extracting it, set `CHECKOUT` to its `source` directory:

```sh
CHECKOUT="$(pwd)/source"
BUYER="$CHECKOUT/stellar/scf-starforge-20261009/sf88-operator-buyer-cli"
export PYTHONPATH="$BUYER/python${PYTHONPATH:+:$PYTHONPATH}"
python -m stellar_forge_buyer.review_cli --help
python "$BUYER/python/examples/review_deliveries.py" \
  --checkout "$CHECKOUT" --out "$HOME/python-review-example" --rows 100000
```

The example requires a new output directory. It writes authored before/after CSV and JSON examples, operates them through the actual native library, exports the complete documents, and removes only its own sender directory. The returned JSON reviews remain directly receivable by a new independent library. The example's retained SQLite workspaces use their original absolute source paths; use the portable JSON review, not a relocated SQLite file, for another operator.

An installed `stellar-forge-buyer` wheel includes the four new Python modules automatically through its existing package definition. Its native Node runtime stays in the chosen original checkout. There is no new registry dependency or installation-time network access for this feature:

```sh
python -m pip install --no-deps --no-build-isolation "$BUYER/python"
```

`python -m stellar_forge_buyer.review_cli` is the maintained command entry. No existing package command or application registration is replaced.

## Open a retained source and compare complete editions

```python
from pathlib import Path
from stellar_forge_buyer.review_library import ResourceLibrary

with ResourceLibrary(
    checkout=Path('/opt/starforge/source'),
    state=Path('/private/customer/library'),
    kind='inbox',
    source=Path('/private/customer/buyer-inbox.json'),
    roots=[Path('/private/customer/delivered-files')],
) as library:
    library.scan()
    resources = list(library.iter_resources(page_size=100))
    # Select actual resource IDs from that retained source, not display names.
    before_id, after_id = resources[0]['id'], resources[1]['id']
    review = library.compare(before_id, after_id,
        operation_id='customer-edition-20261012', format='csv', key_columns=['id'])
    if review.observed['state'] != 'COMPLETE':
        raise RuntimeError(review.observed)
    for change in review.iter_changes(page_size=100):
        print(change['path'], change['type'])
    review.export('/private/customer/review.json')
```

Choose resource IDs deliberately for the real source. Source kinds `inbox`, `snapshot`, `collection` and `paid-jobs` keep their original native meanings and source/files-root requirements. Reopen with only `checkout` and `state`; the native library preserves its configured source, scan, annotations, collections, selected resource and selected comparison. `ResourceLibrary.from_buyer(buyer, state=...)` reuses the original Python Buyer's checkout, Node, environment and timeout without starting a purchase.

`library.capabilities` and the CLI `capabilities` command report the actual selected native engine. On a source checkout that has the original resource library but not yet the C12 edition-review product, resources, annotation, collections and exact-file downloading remain available. Comparison, review report and return operations require that original native product to be composed in the same checkout. They are not silently replaced with a Python approximation. The original complete source package supplies all of those modules. B41A's shared-source and F1CB's compatibility composition retain ownership of the native interfaces.

## Review and return work

```python
with ResourceLibrary.receiver(checkout='/opt/starforge/source',
                              state='/private/reviewer/library') as library:
    comparison = library.import_review('/private/reviewer/incoming.json',
                                       operation_id='receive-customer-edition')
    changes = list(comparison.iter_changes())
    change = changes[0]
    comparison.decide(target=change['id'], expected_revision=0,
        operation_id='review-change-01', status='FOLLOW_UP',
        actor='Receiving reviewer', note='Confirm the exact source quantity.')
    comparison.export('/private/reviewer/returned.json')
```

Use the actual current target revision from its native history. An `expected_revision` of zero means no decision exists for that target, not “append anyway.” `target='*'` is the original whole-case decision. Native statuses are `ACCEPT`, `REJECT` and `FOLLOW_UP`.

A receiver uses the original empty snapshot configuration and comparison handover importer. The received comparison keeps its original ID, typed changes, decision history and review provenance. The sender need not remain available. Receiving a comparison review does not transfer every raw source file automatically; download those complete original files separately when the operator requires them.

Compatible later histories append through the original writer. Older histories preserve the later local review. Divergent histories are staged together without partially applying the compatible targets:

```python
with ResourceLibrary(checkout='/opt/starforge/source',
                     state='/private/customer/library') as library:
    returned = library.stage_return('/private/customer/returned.json',
                                    operation_id='customer-return-01')
    plan = returned.inspect()
    for target in returned.iter_targets():
        print(target)
    # Pick a conflict from the actual returned targets and retain the exact plan.
    returned.choose(target=conflicting_target_id,
        plan_sha256=plan['planSha256'], expected_revision=0,
        operation_id='resolve-return-target-01', choice='TAKE_INCOMING',
        actor='Resolving reviewer', note='Incoming quantity confirmed against source.')
    returned.apply(plan_sha256=plan['planSha256'], operation_id='apply-return-01')
```

All three original choices are available: `KEEP_LOCAL`, `TAKE_INCOMING`, and `CUSTOM` with an explicit `status`. The choice revision is the native saved-choice revision, not the local decision revision. All required conflicts must have a saved choice before apply. A local decision made after planning changes `planSha256`; inspect again, review the new frontier and save the intended choices against the new plan. Do not retry an old operation ID with a changed request body.

`decision_history(target=..., side='local'|'incoming')` and `choice_history(target=...)` return native pages. `export_original()` returns the complete originally received document. Export the comparison itself to transfer the newly reconciled history; its original provenance survives subsequent independent receiving and prevents reapplying an already-resolved return.

## Complete reports and restart-safe file receiving

`Comparison.export()` produces the original JSON, CSV or HTML report. `ReviewReturn.export_original()` returns the original incoming review in those formats. JSON is the native portable receiving format. CSV and HTML are complete operator reports, not import replacements. The existing industrial HTML/report presentation is unchanged.

`download_resource`, comparison export and return export use a stable native file descriptor, chunk hashes and a final complete-file hash. Python writes private `0600` output files and a `0700` transfer directory. The default receiving cursor is beside the destination as `.NAME.sf88-review-transfer/`. A chunk becomes committed only after the partial file and cursor have been flushed to disk. The final file is published create-only after verifying the whole body. An existing differing destination is never overwritten.

```python
from threading import Event
from stellar_forge_buyer.review_library import ReviewTransferError

cancel = Event()
try:
    result = library.download_resource(resource_id, '/private/customer/full.csv',
        chunk_bytes=1024 * 1024, cancel_event=cancel,
        progress=lambda p: print(p.committed_bytes, p.total_bytes))
except ReviewTransferError as error:
    print(error.code, error.progress.committed_bytes)
```

Reopen the library in a fresh process and repeat the same selected resource/report and destination. The receiving code checks the committed prefix, discards an uncommitted suffix and continues. Keep the same transfer directory, on the same filesystem as the output. A changed source/report hash yields `REVIEW_TRANSFER_BINDING_CHANGED`; choose a new output to receive the new version. A completed output deleted by another process yields `REVIEW_COMPLETED_OUTPUT_MISSING`; select a fresh receiving destination instead of erasing its retained cursor. The resource-library-wide review contains the native export time and is a fresh snapshot on each export, so use a new destination for a later library-wide snapshot.

The control protocol accepts at most 8 MiB per frame. Transfer chunks are at most 1 MiB. Native pages have at most 200 items. These are transport sizes, not whole-product truncation: the full file travels through repeated native reads, and `iter_resources`, `iter_changes`, `iter_returns`, and `iter_targets` traverse all native pages. Paged reads detect changed counts/generation or return plans and ask for a new scan. They are not a transaction-wide snapshot across concurrent edits with an unchanged count; use the native exported report for a coherent retained review.

## Process lifetime and recovery

Use `with ResourceLibrary(...)` or call `close()`. The client starts one Node process, retains comparison workers across requests, and drains native output while also draining stderr. It does not pass full source through command-line arguments, start a host service or create a scheduled worker.

`compare(..., wait=False)` returns the original comparison handle while this context remains open. Save its ID, then `inspect`, `wait`, `cancel`, or `resume(operation_id=...)`. `compare` and the CLI `compare run` wait by default. An interrupted native owner is recovered by the original comparison engine after reopening the same state; `resume` preserves that comparison ID and its original inputs.

Timeout, cancellation and interrupted output errors retain `action`, `request_id`, `operation_id`, `dispatched`, and any native result that arrived during cancellation. A dispatched mutation with a lost reply is not treated as absent. Inspect its original state and retry the identical original operation ID/body. The RPC request UUID is only transport correlation; it never substitutes for the caller's durable application operation ID. Close terminates only this client's owned Node child when it must, after attempting native close and process drain.

## CLI map

```sh
python -m stellar_forge_buyer.review_cli --checkout "$CHECKOUT" --state "$STATE" capabilities
python -m stellar_forge_buyer.review_cli --checkout "$CHECKOUT" --state "$STATE" resources --all
python -m stellar_forge_buyer.review_cli --checkout "$CHECKOUT" --state "$STATE" compare changes "$COMPARISON" --all
python -m stellar_forge_buyer.review_cli --checkout "$CHECKOUT" --state "$STATE" compare export "$COMPARISON" --format json --out "$OUT"
python -m stellar_forge_buyer.review_cli --checkout "$CHECKOUT" --state "$STATE" return targets "$RETURN" --all
python -m stellar_forge_buyer.review_cli --checkout "$CHECKOUT" --state "$STATE" return show "$RETURN"
```

Use command help for `init`, `scan`, `resource`, `download`, `annotate`, `export-resources`, `collection`, `compare`, and `return`. `--all` emits one complete native item per NDJSON line, starting at offset zero; otherwise `--offset` and `--limit` select one page. Mutation commands require the original operation ID and relevant revision/plan. Normal commands print JSON to stdout. Native errors print structured JSON to stderr and exit with status 2.

## Operated customer journey

The included `examples/review_deliveries.py` is one complete runnable customer example. It covers all 100,000 rows per CSV with reordered columns and reversed row order; a change to the exact JSON number 9007199254740995; native annotation/collection replay; a full 4,177,795-byte original file interrupted after 131,072 committed bytes and resumed after reopening; killed and cancelled comparison recovery; compatible, older and divergent reviews; a saved choice surviving a killed Node process; stale-plan rejection; all three resolution choices; lost-apply-response replay; complete JSON/CSV/HTML export; sender removal; editable independent receiving; and a fresh-process CLI reopening the same applied return.

Run it locally or in an existing cloud container. It does not install a GitHub Actions workflow or invoke paid compute.
