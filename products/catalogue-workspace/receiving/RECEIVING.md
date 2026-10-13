# Original catalogue native receiving course

Use this course in the selected existing Sylius project with the actual installed bundle and original Akeneo account. It calls the native catalogue:workspace Symfony command, preserves the original project/capture/review/approval/import IDs, observes actual Messenger results and retains every complete native output. It does not fabricate products or source changes, invoke the broad connector reconcile, infer a queue worker command or create a source account.

Keep receive-native.py beside install-source.py. The course uses the same original inherited-lock native command runner. Actual PHP wrapper, bin/console, existing enabled admin actor, original environment, selected identifiers/locales/channels and at least two capture IDs are required. receiving.example.json is an input shape only: replace its explicit placeholders using the real existing project. Store the request and work directory privately.

## Drive the original native course

    python3 receive-native.py --request /PRIVATE/original-receiving.json \
      --work-directory /PRIVATE/original-receiving-work \
      --output /PRIVATE/original-receiving-result.json

Status does not execute native actions:

    python3 receive-native.py --request /PRIVATE/original-receiving.json \
      --work-directory /PRIVATE/original-receiving-work --phase status

If installations.source or installations.target is supplied, each points to its separate exact original installation request/work directory. The course prepares the native review and waits for the actual returned review_sha256 under decisions.installations.source/target before apply. It uses the existing source actor before receiving; the full project handover determines the restored source actor afterward. Source and target installation are serial and preserve their original project boundaries.

The source course calls actual engine, original project-create and capture. It drains every returned cohort page with its original increasing offset and compares the complete ordered identifier selection. Every item receives a native review of its actual source edition, installed engine/mapping and current native entity. Complete outputs and original native streams are retained under the private work directory.

Run again with the explicit decisions file after reading those actual reviews:

    python3 receive-native.py --request /PRIVATE/original-receiving.json \
      --work-directory /PRIVATE/original-receiving-work \
      --decisions /PRIVATE/original-decisions.json \
      --output /PRIVATE/original-receiving-result.json

decisions.example.json describes the complete shape; its placeholder values are not authorization. A decision names the exact returned review_id and review_sha256. Choices:

- keep: retain the current item without import/disable.
- import: explicitly approve the installed native mapping and select rules. A rule is the original native {field_id,owner:"source"|"local",before_sha256,value?} from the actual review. Empty rules means approval of the native mapping with the workspace's existing out-of-scope locale/channel/inventory protections; it does not mean no fields will change.
- disable: only for an actual MISSING review. Also require confirm_selected_disable:true and acknowledge_access_boundary:true. Optional disable_parent_if_no_enabled_variants is separately explicit. An access-limited404 is not proof of upstream deletion.

The course retains every supplied decision file before using it. It validates the current review hash and decision shape before any consumption. Import decisions become consumed only after native approval succeeds; missing decisions only after the native bounded effect succeeds. A rejected native rule remains an attempted input, not an accepted decision.

Before dispatch, an explicit positive review_generations[identifier] value under that edition selects a following native review/approval request. Increase it to correct a stale comparison or rejected rule while retaining all earlier attempts. Reuse the actual returned following review ID/hash. Once an item has a dispatched original import or completed missing effect, its generation cannot be replaced; continue that operation or use the next source edition. A later conflicting choice cannot replace an accepted original decision.

## Original native processing

The released connector's ItemImport is sent through its actual configured Messenger bus. A dispatch acknowledgement can be WAITING_NATIVE and is frozen separately from the current operation. The course reads operation for the SAME import_operation_id; status never sends the item again. Only state COMPLETE with the original native result is accepted as completed item processing. An explicit retain_unapplied[identifier] decision names the original import_operation_id, confirm_no_native_commit:true and a nonempty reason. The native application verifies no commit/uncertain publication before accepting RETAINED_UNAPPLIED. The course records COMPLETE_WITH_RETAINED_UNAPPLIED and lists those identifiers; this is an honest retained disposition, never successful import or queue deletion. Retry cannot reactivate it. Source/media/commit uncertainty remains visible.

The CLI returns a complete envelope with exit0 for successful native invocation, including WAITING_NATIVE, and exit1 for a thrown action's ATTENTION envelope. The runner retains both exits and complete original JSON rather than converting a queue acknowledgement into completion.

If the original owner already runs the selected transport, omit worker and wait for its actual results. Otherwise an optional worker selection contains original owner, authority and exact bounded argv. An explicit worker_drives[edition_id] decision must echo that owner/authority and supply a stable drive_id before the course invokes that command. It must be the actual project's commissioned worker/control operation; no generic messenger:consume main command is inferred. The complete command/process/output is retained under the existing receiving lock. Reusing a drive ID observes its original result; it does not spawn another worker.

An explicit retry is selected at decisions.editions[edition_id].retries[identifier]:

    {"request_id":"ORIGINAL_EXPLICIT_RETRY",
     "import_operation_id":"ACTUAL_ORIGINAL_IMPORT_ID",
     "preserve_original_approval":true}

It invokes native retry with the same original approval and stamped item operation. The application reconciles native transaction and pending media journals. The course does not infer successful rollback, overwrite an uncertain exit or create a replacement import. Each requested retry has its own original retained request ID; repeated receiving adopts it.

## Following source edition

After the first original item results complete, the course waits for decisions.editions[following_id].begin:

    {"capture_id":"SAME_SELECTED_FOLLOWING_CAPTURE_ID","receive_current_source":true}

The source operator supplies an actual following upstream edition through the existing PIM workflow; this read-only receiving course does not change PIM content or manufacture a revision. It captures and reviews the selected current native source, including any genuine missing outcomes, then requires explicit per-item decisions again. Actual source SHA values remain in each edition. Two observations with identical bytes are reported as identical observations, not advertised as an applied content update.

Each complete edition preserves its initial reviews, decisions, native queue/result IDs, source and media journals. Later native value edits do not rewrite those original records.

## Output and recovery

Every action has a stable native operation ID derived from the original course and action label. Incomplete capture continuation preserves that ID/input; native status drives retain separate invocation outputs. A lost parent is covered by the original lock inherited into the direct native child. An admitted command without an observed completed result remains uncertain and is not blindly replayed.

For a definite completed nonzero subprocess, inspect its actual original stderr/output and correct the native cause. --retry-failed EXACT_COMMAND_LABEL permits a following retained attempt of that same exact command. It does not allow replay of an unknown admitted outcome. The application may still require a following reviewed action when its original selection became stale.

## Complete files and original installed-project transfer

After both editions, the course exports the frozen catalogue ZIP, uses the actual native download action, compares its complete byte hash, opens it independently, verifies every declared record/blob/source/journal member, and extracts the original bytes under catalogue-export/opened. The received ZIP and its exact manifest remain in the same operation.

The required handover selection in receiving.example.json names the released application/tools/catalogue-project.php, one existing private 32-byte archive key, the complete encrypted archive destination, and separate original source/target configuration/work/operation bindings. Use the tool's full NATIVE_PROJECT_HANDOVER.md to populate actual SQL, external queue, worker drain/resume, PHP/kernel and storage inputs. The receiving course verifies that export names its original selected project, console, PHP and environment; the target must be a distinct existing site. The native engine retains the actual independently installed target catalogue Store configuration and host secrets.

The course runs source inspect/export and retains the full authenticated frozen manifest.source. It authenticates the archive and prepares the actual existing target backup/review. The target remains drained awaiting decisions.handover.target:

    {"review_sha256":"EXACT_RETURNED_NATIVE_TARGET_REVIEW",
     "receive_original_project":true}

After this concrete review is approved, receive and independent reopen operate on that same original native target. Source comparisons use the frozen authenticated snapshot, never a later live query. A separate native CLI invocation then boots the restored shop using the restored source administrator username with the target's actual PHP/root/environment, opens the original catalogue project, compares the complete selected identifiers/locales/channels, checks every original import/approval identity, and reads every immutable review/approval from the actual restored database against the downloaded frozen catalogue records.

Once an export has been accepted, resuming the course continues that frozen delivery. It does not rerun the original import editions or replace its source snapshot. Native handover failure retains its complete real output and requires a new explicit decisions.handover.continue_request_id for a following drive of the same native operation. An unknown admitted child remains blocked by the original runner; a new continuation ID is not permission to duplicate that child. The native handover also retains a completed nonzero inner command permanently under its original stage. An outer continuation adopts a newly available original receipt; it does not rerun that failed database or queue command. The original owner must reconcile the actual process/receipt, or explicitly recover the reviewed target backup. Never edit the inner result or invent a successful exit.

Explicit target recovery is available through --phase recover with decisions.handover.recovery:

    {"review_sha256":"EXACT_ORIGINAL_TARGET_REVIEW",
     "restore_original_target":true,
     "reason":"ACTUAL_OWNER_SELECTED_RECOVERY_REASON"}

This calls the existing native recovery, restores its exact authenticated target backup and verifies that original snapshot. The result is ORIGINAL_TARGET_RECOVERED, not successful source delivery. Another transfer after recovery requires a separately reviewed native target operation; the programme never silently reapplies over later work.

## Actual browser and visual receiving

browser-receiving.mjs exports runCatalogueBrowserReceiving. Call it from the existing commissioned browser owner with its already authenticated sourcePage and targetPage, the full original receive-native result, a private output directory, and a request containing schema tjl.catalogue.browser-receiving.v1, operation_id, project_id, source_url, target_url, original capture_id and review_id. It creates no browser, login, account or native dispatcher.

The course opens the real original project at each site, pages the complete cohort, opens the retained review and disclosures, operates field search/paging, reads current native operation results, downloads the actual original review and catalogue ZIP, checks the downloaded archive hash, captures wide and narrow screens, and reloads/reopens the same project. Mutating decisions remain in the separately reviewed original native course; no arbitrary browser approval or production write is generated.

Native completion records NATIVE_COMPLETE_AWAITING_VISUAL_REVIEW. Browser completion records CAPTURED_AWAITING_VISUAL_INSPECTION and returns every real PNG/download identity. Neither state claims customer or visual acceptance. The producing operator must open and LOOK at the actual images, open the files and judge usability, clipping, navigation and native original results. Record that actual observation in the original receiving thread with these identities. The full owner instruction in INSTALLATION.md applies throughout.

For a failed installation nested under this course, first reconcile its same original installer work/command and actual exit; if an explicit --retry-failed label is needed, use the installer on that original work. Then the outer course can adopt its original result or explicitly retry its observed failed wrapper. Do not erase either journal, invent an exit or start another installation.
