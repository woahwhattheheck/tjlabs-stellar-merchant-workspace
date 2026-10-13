# Receive and reopen a complete Upsun operating project

Use the current equipped GovHub owner and its existing installed account, Python/Git/native CLI, working directory and browser. This programme composes the original GovHub operation queue and private backup; it does not provision a new account or replace the current project.

## Inputs and identities

Keep these actual receiving inputs private:

- The complete installed GovHub application with APPLICATION_SOURCE.json and its unchanged vendor closure.
- The existing workspace directory and complete supplied-input directory.
- The actual staff username and the environment variable name containing its existing password.
- Existing local environment record IDs, each bound to the actual Upsun project/environment identity.
- The selected native source checkout, installed CLI/Git/SSH/rsync and original credential environment reference.
- The current reviewed plan/revision and source inventory for any cohort restore, synchronize, deployment or cutover operation.
- The actual native snapshot ID for a restore, plus the subsequently observed RESTORED inventory.
- An original receiving-operation ID, private work directory, complete immutable request file and existing operating authority.
- For whole handover, a verified complete application ZIP, its SHA-256 and a separate private destination directory.

A new account, invented provider identity, fabricated backup or substitute data does not satisfy an existing source input. Preserve the real account and original operation while its concrete input is received.

## Original course request

The request schema is govhub-upsun-native-receiving/v1. The example at native/upsun/receiving.example.json shows the complete shape. Replace its explicit SELECT_ values with the actual original values before the **first** run. Keep that original file unchanged afterward.

The workspace object contains workspace, source_root, assessment_core, username and password_env. These are the same arguments consumed by the existing native receiving helpers. The private work_directory retains receiving.json, exact original request/result files and full handover records.

steps is an ordered list of one to 64 selected native steps. Each has:

| Field | Meaning |
| --- | --- |
| id | Unique plain step name within this original course. |
| type | Original purpose: CAPTURE, PREVIEW, BACKUP_CREATE, REHEARSAL, CUTOVER or ROLLBACK. |
| native_action | Actual provider action from its published schema. |
| environment_id | Existing local GovHub environment record ID. |
| profile | Complete selected current Upsun configuration. |
| authorization_reference | Optional step-specific reference; otherwise the course reference is used. |
| plan_id and expected_plan_revision | Required for a reviewed cohort operation. |
| agency_ids | Optional actual cohort selection, preserving original plan semantics. |
| backup_sha256 | Only the original retained inventory/source binding when required by that cohort. The provider snapshot is selected by profile.backup_id. |
| restored_snapshot_id | Actual existing RESTORED inventory to reconcile after native completion. It may instead be supplied later through the continuation file. |
| profile_sources | Optional exact scalar selections from earlier completed original course operations. |

A profile_sources row contains field, step and pointer. The programme reads the earlier original operation, proves it remains COMPLETE, resolves its explicit JSON pointer and retains the original operation ID, revision, full-object digest and selected value. It accepts only declared native profile fields; host/runtime and credential references cannot be sourced this way.

For example, the original capture's exact native head is available at /native_result/observations/native_inventory/environment/head_commit. A source_revision binding can select it for a subsequent operation. A successful branch has original affected_environment.id and parent. Those fields remain the native provider values; the programme does not synthesize a project/environment identity from a guessed slug.

A newly observed backup cohort is a collection, not a promise that a particular index is the intended restore target. Choose the actual returned snapshot before preparing its restore instruction.

## Run and continue

Use the existing host interpreter and original application path:

    python /ABS/GOVHUB/workspace/upsun_receive.py run \
      --request /PRIVATE/original-upsun-course.json

The programme saves each original request before calling the existing writer. Original request keys let a repeated invocation receive the same operation after a lost local response. Every queued source or lifecycle operation uses the existing native worker. A same-course receiving lock serializes the programme; the original workspace and native worker retain their own locks and journals.

Outcomes:

- Exit 0 with state complete means all selected original steps are COMPLETE, including any required restored-source comparison.
- Exit 2 with state attention retains the actual step and operation IDs. Read the original native result and resolve its stated condition in the same project.
- Exit 1 retains the original source and receiving state and reports the actual exception. Supply the concrete missing input or correct the selected invocation, then continue the original course.

Read the saved course at any point:

    python /ABS/GOVHUB/workspace/upsun_receive.py status \
      --request /PRIVATE/original-upsun-course.json

The request SHA identifies the exact first input. Changing that file is rejected by the saved receiving directory.

## Supply an original-operation continuation

Use a separate file with schema govhub-upsun-native-continuation/v1 and the original request_sha256 reported by status. operations is keyed by the actual retained native operation ID. A selected operation may include:

- upsun_activity_id: actual provider activity that resolves the original uncertain request.
- upsun_activity_ids_json: a JSON string containing the full array of actual activities when the original write accepted several. Controlled deployment can release activities staged before this dispatch; the provider verifies the retained original staged cohort.
- runtime_bindings: actual receiving-host source/executable and credential reference names accepted by the provider.
- restored_snapshot_id: actual retained RESTORED inventory.
- reason: the specific current operating instruction.
- resume_cancelled: true only when the original operator explicitly directs continuation of that cancelled operation.

Example shape:

    {
      "schema": "govhub-upsun-native-continuation/v1",
      "request_sha256": "SELECT_ORIGINAL_REQUEST_SHA256",
      "operations": {
        "SELECT_ORIGINAL_OPERATION_ID": {
          "upsun_activity_id": "SELECT_ACTUAL_ORIGINAL_ACTIVITY_ID",
          "reason": "Continue the original provider activity after receiving its native ID"
        }
      }
    }

Run the same request with that actual continuation:

    python /ABS/GOVHUB/workspace/upsun_receive.py run \
      --request /PRIVATE/original-upsun-course.json \
      --continuation /PRIVATE/original-upsun-continuation.json

The programme retains the complete continuation and its source identity. It waits for provider eligibility, preserves explicit cancellation and associates an uncertain write with its original activity. It does not allocate another native operation because a response was lost. A native-complete cohort action still needs its actual RESTORED inventory; the existing observation engine compares that original result.

## Build and receive the complete application

Use the unchanged complete application builder in build_application.py with the documented build/verify commands in ../START_HERE.md. The native commands are: 
    python /ABS/GOVHUB/workspace/build_application.py build \
      --source-root /ABS/GOVHUB \
      --manifest /ABS/GOVHUB/APPLICATION_SOURCE.json \
      --output /PRIVATE/COMPLETE_GOVHUB_APPLICATION.zip

    python /ABS/GOVHUB/workspace/build_application.py verify \
      /PRIVATE/COMPLETE_GOVHUB_APPLICATION.zip \
      --expected-sha256 SELECT_ACTUAL_BUILD_SHA256

Retain its actual full ZIP and exact SHA-256. Its explicit required-file manifest includes the Upsun adapter, source exporter, receiver, native guides, example and browser programme.

Create a separate original handover-selection file:

    {
      "destination": "/PRIVATE/SELECT_NEW_RECEIVED_PROJECT",
      "application_zip": "/PRIVATE/SELECT_COMPLETE_GOVHUB_APPLICATION.zip",
      "application_sha256": "SELECT_ACTUAL_VERIFIED_APPLICATION_SHA256",
      "source_exports": [
        {
          "step": "01-source",
          "file_name": "SELECT_ACTUAL_COMPLETE_SOURCE_ZIP_NAME",
          "runtime_bindings": {
            "git_path": "/ABS/SELECT_EXISTING_GIT",
            "upsun_path": "/ABS/SELECT_EXISTING_UPSUN",
            "ssh_path": "/ABS/SELECT_EXISTING_SSH",
            "rsync_path": "/ABS/SELECT_EXISTING_RSYNC"
          }
        },
        {
          "step": "04-following-source",
          "file_name": "SELECT_ACTUAL_FOLLOWING_SOURCE_ZIP_NAME",
          "runtime_bindings": {
            "git_path": "/ABS/SELECT_EXISTING_GIT",
            "upsun_path": "/ABS/SELECT_EXISTING_UPSUN",
            "ssh_path": "/ABS/SELECT_EXISTING_SSH",
            "rsync_path": "/ABS/SELECT_EXISTING_RSYNC"
          }
        }
      ]
    }

Select the actual full source ZIP file name shown on each completed capture operation. Include every CAPTURE step. The received source helper preserves complete SQL and mount archives as original inputs and reopens the native Git bundle, index and working changes in a new private checkout. It never imports SQL into a live database or overwrites an active environment. The receiving Session uses the same original command admission and one course lock; original target and credential-reference names remain bound.

Then:

    python /ABS/GOVHUB/workspace/upsun_receive.py handover \
      --request /PRIVATE/original-upsun-course.json \
      --selection /PRIVATE/original-upsun-handover.json

The receiver:

1. Proves the selected native course is complete.
2. Retains every original supplied-input file, verifying original bytes and SHA-256 while resuming complete prior members.
3. Receives and verifies the complete application ZIP and every original package member.
4. Verifies and independently receives every selected complete source ZIP, then reopens and compares its original Git/index/working changes through the unchanged native source helper.
5. Uses the existing workspace.backup operation to capture the database, native journal, private sources and identity in one coherent backup generation.
6. Retains incomplete prior copies instead of overwriting them.
7. Opens the copied workspace using the original engine and confirms that it contains every completed course operation.
8. Starts a separate interpreter from the received application to inspect that copied project.
9. Compares the whole saved operation population and original workspace identity.
10. Saves the original completed handover receipt and preserves it on replay.

No native provider write is required by cold inspection. To continue later work on another host, reopen the received application and set the explicit runtime references on the same original operation. Supply the actual native Git/database/mount source package according to UPSUN_SOURCE.md.

## Render and operate the actual application

Use the existing browser allocation. The programme installs neither Playwright nor a new browser:

    node /ABS/GOVHUB/workspace/native/upsun/browser_receive.cjs \
      /PRIVATE/original-upsun-browser-course.json

Input schema govhub-upsun-browser-receiving/v1:

    {
      "schema": "govhub-upsun-browser-receiving/v1",
      "origin": "http://127.0.0.1:SELECT_EXISTING_PORT/",
      "username": "SELECT_EXISTING_STAFF",
      "password_env": "SELECT_EXISTING_PASSWORD_ENV",
      "output_directory": "/PRIVATE/SELECT_RENDERED_OUTPUT",
      "environment_ids": ["SELECT_ORIGINAL_LOCAL_ENVIRONMENT_ID"],
      "operation_ids": ["SELECT_ORIGINAL_COMPLETE_OR_WAITING_OPERATION_ID"],
      "downloads": [
        {
          "operation_id": "SELECT_ORIGINAL_OPERATION_ID",
          "name": "SELECT_ACTUAL_COMPLETE_SOURCE_ARTIFACT_NAME"
        }
      ],
      "playwright_path": "/ABS/SELECT_EXISTING_PLAYWRIGHT",
      "browser_executable": "/ABS/SELECT_EXISTING_BROWSER",
      "headless": true,
      "browser_args": []
    }

Use exact installed references; omit the optional executable/module fields if the equipped owner's existing defaults resolve them. Existing host browser flags can be supplied explicitly. The programme does not silently disable the browser sandbox.

The browser course opens the actual application at 1440×1000 and 390×844, signs in as the original staff user, reads the selected native environment inventory, selects and discards an actual backup editor choice, operates native action selection, opens every actual course operation and receiving-host controls, downloads selected complete original artifacts and compares their bytes/SHA, exercises local browser offline/error/recovery, and opens the same operation in a separate signed-in browser session. It does not submit an extra native operation or alter a saved profile.

The full result contains actual screenshot paths, file identities, original operation IDs, checks, browser errors and separately retained downloads. A real absent collection is recorded as empty; the programme does not manufacture provider rows. An already-completed native course may have no waiting-operation controls; select the actual waiting operation too when that receiving journey is part of the delivery.

RENDERED_AWAITING_VISUAL_INSPECTION is an intermediate result. The producing peer must **open and look at every actual screenshot or rendered screen**, check populated/empty/loading/error presentation, operate the important controls and fix concrete problems. Record which actual version, screens and downloads were seen. Code review, screenshot capture without viewing, HTTP200, DOM counts and another peer's approval are insufficient. Inspect and repair unreadable, clipped, cramped, overflowing or unstyled output using readable tables, restrained controls, consistent spacing and clear labels.

This delivery inspection remains part of the original project. It must not become a broad suite, peer-approval gate, new timer or parallel execution programme.

## Receiving report for the original owner

Return the existing workspace and application source identity, actual provider project/environment, original course and native operation IDs, actual activity IDs, snapshot selection, source-export file identities, completed restored comparison, full private handover receipt, separate-process reopen and rendered output/findings. Keep tokens, database content and private source payload on the authorized host; publish only the selected receiving result in the original GovHub/company thread.

If a required account, native source tool or existing environment is unavailable, return its actual result and preserve the same request and source. Continue independent authorized product work while that concrete receiving input is resolved.
