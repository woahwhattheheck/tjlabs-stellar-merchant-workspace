# Receive the complete Tugboat customer preview project

This command drives the existing GovHub application and saves its whole original project. It uses the selected customer's actual Tugboat project, repository, Git revision, preview configuration, native jobs and authorization. The final handover contains the complete original application, all supplied inputs, the saved operating workspace, native response bodies, logs, Git source and independent reopen result.

## 1. Select the existing native environment

Use the complete GovHub application checkout on the customer's native Linux host, with Python 3.10 or newer and Git. Reuse its original existing workspace, operating user and password environment variable. The target environment record must already identify the customer's Tugboat repository. The provider resource is the actual 24-character project ID and repository ID joined with a slash. The local environment record ID is a different, existing GovHub identity.

The Git checkout must identify the same native repository through its origin. Its exact commit and original .tugboat/config.yml are captured before writes. An explicitly supplied config_json instead selects the reviewed complete services object. The original API key stays in a host environment variable; the request carries its name only.

Choose a single original base preview or the explicit value none. The receiving programme will create one preview, then run only the selected explicit lifecycle actions. A refresh or rebuild may consume native account resources and execute the repository's original setup tasks. Select the actual customer's operating authorization and nonproduction source/data boundary before running.

Open the original application if a new workspace must be initialized, using its START_HERE.md and existing native account setup. Create its customer site/environment through the normal operating records. This receiver does not invent an account, create a paid service or supply fixture credentials.

## 2. Build and retain the complete application

Use the existing builder against the final selected complete repository commit. The source lock includes the full GovHub programme, shared assessment core, all current feature source and this provider/receiver. It excludes the original private case-assets tree.

```sh
python3 /ABS/merchant/products/govhub/application/workspace/build_application.py lock --repository /ABS/merchant --revision FULL_SELECTED_COMMIT --output /PRIVATE/APPLICATION_SOURCE.json
python3 /ABS/merchant/products/govhub/application/workspace/build_application.py build --source-root /ABS/merchant/products/govhub/application --manifest /PRIVATE/APPLICATION_SOURCE.json --output /PRIVATE/GovHub-Complete-Application.zip
python3 /ABS/merchant/products/govhub/application/workspace/build_application.py verify /PRIVATE/GovHub-Complete-Application.zip
```

Retain the complete native build result and ZIP SHA-256. Use the same original source revision for the checkout, lock and application. The builder verifies every ordinary ZIP member against its original full source lock and package index. Optional unrelated provider executables are included only when selected through their existing native source inputs.

## 3. Prepare one immutable receiving request

Copy native/tugboat/receiving.example.json to a private file and replace every placeholder with the actual original values. Retain that exact file for the whole operation.

| Field | Actual input |
| --- | --- |
| operation_id | The existing agreed customer receiving operation |
| work_directory | A separate absolute private receiving directory |
| workspace.workspace | The customer's saved original GovHub project |
| workspace.source_root | Its complete original supplied-input tree |
| workspace.assessment_core | The exact installed bundled assessment-core directory |
| workspace.username/password_env | Its existing operating user and password variable |
| environment_id | The original local GovHub environment record ID |
| profile.environment_id | The actual Tugboat project/repository IDs |
| profile.site_root/git_path | The actual original Git checkout and executable |
| profile.access_token_env | The existing authorized API-key variable name |
| profile.base_preview_id | A selected native base preview ID, or none |
| authorization_reference | The actual operating instruction for this customer/repository |
| actions | The explicit lifecycle to execute, in order |

The full request hash binds the work directory. Changing the request is a new programme, not a resume. One create action may occur only first. The default complete course is create, refresh, rebuild, stop, start; an existing preview can receive an explicitly selected course without create. Original provider profiles and each native operation remain separately versioned in the saved project.

## 4. Execute and continue the original course

```sh
python3 /ABS/govhub-operations/workspace/tugboat_receive.py run --request /PRIVATE/original-tugboat-request.json
python3 /ABS/govhub-operations/workspace/tugboat_receive.py status --request /PRIVATE/original-tugboat-request.json
```

The receiver first configures the original environment through the existing operation service and captures its native source. It selects that actual commit/configuration hash, then queues each lifecycle step with a stable original request key. The saved GovHub worker executes the actual operations. Every queued ID, complete native result, source and final preview identity is retained before advancing.

A return state complete means the selected native course completed. A return state attention and exit 2 preserves the current original step and operation ID. Open that same operation in the existing browser, inspect its complete provider record, and Resume it there. A lost accepted response may need the original native job ID. Its project, repository, preview, action, native time, original name/base/source and available job arguments must match. The original dispatcher never repeats an uncertain POST.

After that original operation is resolved, repeat the exact run command. Completed saved steps are reopened; the same course advances through its remaining original request keys. The account's absolute native Retry-After remains authoritative, including manual resume and capability reads.

For a receiving-host path change, use the operation's Receiving machine section. Supply the original restored Git checkout, actual Git executable and existing API-key variable. The target project/repository/source/job identity remains the original operation. Keep the same private native workspace and full original request/response history.

## 5. Save and independently reopen the complete customer project

Create a second private JSON selection:

```json
{
  "destination": "/ABSOLUTE/PRIVATE/customer-handover",
  "application_zip": "/ABSOLUTE/PRIVATE/GovHub-Complete-Application.zip",
  "application_sha256": "ORIGINAL_COMPLETE_APPLICATION_ZIP_SHA256"
}
```

Then run:

```sh
python3 /ABS/govhub-operations/workspace/tugboat_receive.py handover --request /PRIVATE/original-tugboat-request.json --selection /PRIVATE/original-handover-selection.json
```

The destination is distinct from the operating workspace, its inputs and receiving state. The programme receives the unchanged complete application ZIP and verifies every member. It retains the full original supplied-input tree with file hashes. The original workspace.backup service then copies the complete original database, blobs, native-operation journals/files and private reconciliation key.

A new process executes the receiver from that received application, using the copied input tree and separately saved workspace. It opens the existing operating user and checks the exact original workspace identity and full operation population. The completed result reports RECEIVED, the original workspace ID, operation count, native reopen command and complete handover result path.

Repeat the exact handover command after an interrupted copy. Already received complete members are checked before use. A partial workspace backup stays retained under its original receiving destination before the original coherent backup is run again. The receiver never deletes another workspace or changes its target selection.

The private destination contains:

- application/govhub-operations: complete independently received application source and original manifests.
- govhub-application.zip: unchanged complete application ZIP.
- original-inputs: every original supplied source/input file.
- private-workspace: full original database, native-operation source, responses, logs, file history and reconciliation key.
- The original receiver's handover.json: full selection binding, copied-source inventory, original backup result, exact separate-process reopen and receiving state.

Transfer that complete private destination with the customer's authorized secure delivery mechanism. Keep its full original bytes and permissions. The original user password and API key remain with the customer; their values are not printed or placed in the commercial package.

## 6. Reopen with the second engineer

Use the received application and the original operating credentials. The independent inspect command is:

```sh
python3 /RECEIVED/application/govhub-operations/workspace/tugboat_receive.py inspect --workspace /RECEIVED/private-workspace --source-root /RECEIVED/original-inputs --assessment-core /RECEIVED/application/govhub-operations/workspace/vendor/assessment-core --username ORIGINAL_USER --password-env ORIGINAL_PASSWORD_VARIABLE
```

The saved native operation lists its complete original Git bundle and selected source archive. Restore its checkout with the existing Git bundle, check out the exact retained commit, and keep the repository's actual original origin. Select that checkout and existing key variable in the operation's Receiving machine controls when more native work is authorized.

Start the received original server according to START_HERE.md. Inspect the completed capture and lifecycle operations, their full source/log downloads and the actual native preview URL. Reopening and inspection do not create a new preview. Additional mutations require a new authorized operating instruction or continuation of an existing unfinished operation.

## Retained source and real outcomes

The programme returns actual provider states. A failed build retains its original log and job failure; the operator corrects its source through the customer's existing Git/configuration flow. Provider 404 retains its native missing-or-inaccessible meaning. HTTP bodies with incomplete native length remain partial, and ambiguous writes require original-job reconciliation. The supplied request example is an input template; the completed native account operation and independent reopen supply the actual receiving outcome.

## Exact outgoing product and attachment inspection

Before this application, proposal, report, presentation or export is described as customer-ready, the producing peer must open/run/render the exact outgoing version, LOOK at its real screens or returned screenshots, and operate the important controls. Inspect the screenshare and narrow/mobile widths where relevant; exercise populated, empty, loading and error states, downloads/exports and independent reopening. View the actual returned pixels; capturing images alone or source/HTTP/grammar checks do not complete this step.

Apply this to every outgoing attachment: open the final proposal HTML/document in its normal recipient application, open the complete application and project archives, and inspect the rendered content and restored original workspace. Where a final package includes video or audio, play the actual final media and inspect its presentation and natural voice quality. The native operator returns viewable images/files with exact selected source/file identities; the producing peer looks at those outputs and repairs concrete defects in the original product.

Use plain industrial design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Repair unstyled, cramped, clipped, overflowing or unreadable output while preserving the real workflows, data and computation. This is part of finishing the existing product, not a separate verification project or broad test campaign. Continue useful implementation through the original native receiving operation and retain all existing owner boundaries.

This instruction applies to current/future local and cloud peers and must travel in delegated receiving assignments and the active build/receiving guides. Preserve this instruction in the active build and receiving guides.

For Tugboat, use the exact installed GovHub source and the original customer project. Open the native capture/profile screens and saved preview-operation rows; exercise explicit project/repository/base selection, native job continuation and receiving-host Git/key-reference controls. Retain the actual full project/application ZIP, receive it in the explicitly selected independent workspace, reopen the same operations, and return the actual views to the original producing seat. Native provider actions use the already agreed authorized selected account and preserve original jobs.
