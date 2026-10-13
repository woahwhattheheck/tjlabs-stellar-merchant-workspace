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

The course retains consumed decisions unchanged. A later conflicting choice cannot silently replace an original approval. Resolve a changed source/native value through its following original review and application workflow; do not erase completed decisions or remint an import.

## Original native processing

The released connector's ItemImport is sent through its actual configured Messenger bus. A dispatch acknowledgement can be WAITING_NATIVE and is frozen separately from the current operation. The course reads operation for the SAME import_operation_id; status never sends the item again. Only state COMPLETE with the original native result is accepted as completed item processing. Source/media/commit uncertainty remains visible.

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

The complete selected catalogue export is created after both editions. It is followed by the original full-project handover and browser stage, composed with this same receiving operation. The current core checkpoint records NATIVE_CATALOGUE_COMPLETE with handover_required and rendered_inspection_required; that state is explicitly not whole-course or customer acceptance. The full transfer must preserve actual code/vendor/lock, SQL, public/private storage, private catalogue/source/media root, original native users and all queue/operation journals. The selected receiving target and host private settings remain bound by the authenticated project review.

Actual final acceptance requires opening the exact native admin screens at desktop and narrow widths; operating project selection, cohort pages, native source/review/approval/result/missing controls; downloading and opening the complete original exports; and independently reopening the full restored project. Producing peers must LOOK at the actual images and usable files. Source checks, native exit0, screenshots merely saved, or another worker's approval are not that observation. The full owner instruction in INSTALLATION.md applies throughout.
