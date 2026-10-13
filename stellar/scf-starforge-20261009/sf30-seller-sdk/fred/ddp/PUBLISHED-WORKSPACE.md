# Current-publication workspace

The **Current publications** desk operates the complete saved Board-to-FRED migration in the original economic project. It calls the maintained current-publication collector and programme, keeps the original native comparison, and opens every mapped series and original observation through paged views.

## Open an edition

1. Open the original economic project with `starforge fred serve` and select **Current publications**.
2. Choose a complete saved migration. **Collect complete publication edition** retains an operation before acknowledging the request. The host acquires every mapped current publication, compares all selected original Board periods, imports the complete public captures into this same project, independently receives the native project and prepares its complete customer archive.
3. Refresh or reopen the same project while an operation continues. **Continue original operation** reuses its immutable request, original intake and completed native sources. A later edition receives a new operation and intake directory.
4. Open the completed edition, find series, inspect exact source meaning and page its observation rows. All six native statuses remain distinct: equal figures, different figures, unavailable in both, availability differs, Board-only periods and FRED-only periods.
5. Download `edition-package.tar.gz` for the complete deliverable, or select any original member. The browser downloads directly from the workspace. Large CSV, JSONL and project files stream from disk.

The report keeps source and target numeric strings, explicit scales, missing codes and exact original-file byte locations. Collection timestamps describe the current-publication retrieval basis. The original migration controls the period/calendar rules.

## Attach an already completed source programme

An existing original source operation can be joined without another collection. Use the original project that contains that programme's native public captures and saved migration:

```sh
starforge fred ddp-publication attach   --project /absolute/original-project   --id original-h15-publication   --migration fred-ddp-migration-plan-EXACT_ORIGINAL_SHA   --expected-revision CURRENT_PROJECT_REVISION   --workspace /absolute/original-programme   --output current-publication   --manifest published-targets/manifest.json
```

The host derives the complete original package, crosswalk and saved plan from project IDs. Attachment verifies the native report against those exact originals and its complete retained public-source manifest, then retains the full customer edition. Use the actual output/manifest names from that original programme.

The browser and remote agent surface select saved IDs. Filesystem attachment is a local host operation using the existing completed programme.

## CLI and typed module

```sh
starforge fred ddp-publication list --project /absolute/project
starforge fred ddp-publication status --project /absolute/project --id ORIGINAL_OPERATION
starforge fred ddp-publication resume --project /absolute/project --id ORIGINAL_OPERATION
starforge fred ddp-publication report --project /absolute/project --id ORIGINAL_OPERATION --offset 0 --limit 100
starforge fred ddp-publication rows --project /absolute/project --id ORIGINAL_OPERATION   --comparison EXACT_COMPARISON_ID --status DIFFERENT --offset 0 --limit 100
starforge fred ddp-publication file --project /absolute/project --id ORIGINAL_OPERATION   --name edition-package.tar.gz --sha256 EXACT_LISTED_SHA --out /absolute/new-edition.tar.gz
```

For a new full collection, `run` takes the original operation ID, saved migration ID and expected project revision. The complete `fred-ddp-published` source programme and `fred ddp-published` dispatch remain available. The public typed export is `./seller/fred/ddp/published-workspace`.

## Complete receiving

The archive contains `edition.json`, original programme inputs, the full target manifest and every retained transport, original native project JSON, programme summary, comparison JSON, HTML and complete CSV/JSONL rows. Member paths retain the manifest's original relative locations. Every member has complete byte length and SHA256 in `edition.json`.

Extract the complete archive into a private directory on the receiving host. Read `edition.json` for the exact `programme.output` and `programme.manifestPath`. Receive `original-project-with-current-publications.json` from that output with the maintained native receiver. Attach the extracted programme to that received project with its original saved migration, then open the same workspace. The original native project identity and complete source/report context travel together.

## Operation and file behavior

Each operation is retained in the project's `ddp-publications/ORIGINAL_ID` directory. Its immutable request binds the project, migration, original revision, intake and output. Progress is replaceable; completion binds the exact native result and complete allowlisted file inventory. Complete replays return the saved result and native project snapshot.

The operation uses its own lock. The native programme continues to own each original project transaction. A lost HTTP response or closed browser retains the same server operation; shutdown drains its original task after passing cancellation to native collection/import. A resumed process opens the retained sources and progress.

Opening a report verifies the complete original comparison once per workspace process. Subsequent pages use the retained sparse JSONL index and original file identity. Filter cursors identify positions in the original rows; clients follow `nextOffset` without deriving a cursor from the count of matching rows.

Authenticated file requests stream from the same checked descriptor. Browser download links use a single-use short-lived ticket scoped to one listed file. Agent file chunks carry the whole file SHA256, original byte offset, chunk SHA256 and next byte offset. Complete file downloads create a new destination and verify every byte before publication.

A programme interrupted after saving its native project snapshot reuses that exact snapshot during receiving. Later unrelated edits in the original project remain outside that already selected customer edition. When several retained captures contain the same public series, materialized originals use the exact capture identity beneath that series directory; single-capture originals retain their established paths.
