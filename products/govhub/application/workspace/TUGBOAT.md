# Tugboat native preview operations

This provider operates one existing Tugboat repository inside GovHub's original environment, operation, worker and whole-project delivery model. It uses the published v3 HTTP API directly. The customer's existing project, Git source, preview configuration and API-key custody remain authoritative.

## Install the complete application

Build the same full GovHub package with workspace/build_application.py after selecting the release commit. Its required-source set includes tugboat_adapter.py, this guide and the unchanged original specification. Start the existing server and worker with the customer's native Python, Git checkout and API-key environment variable. No npm modules, additional service, paid workflow or new Tugboat account is installed.

The selected native host needs Python 3.10 or newer and Git. The local Git origin must identify the same hosted repository returned by Tugboat. Both HTTPS and SSH forms are compared by their original host/repository identity. The provider creates a complete original Git bundle and an archive of the selected commit in the private operation directory. Uncommitted changes do not silently enter a selected commit.

## Configure the original environment

1. Create or open an Environment in the existing operating records. Select provider Tugboat. Its resource ID is the actual project ID followed by / and repository ID; both are the provider's 24-character identifiers. Retain the actual operating authorization.
2. Open Native tools, select Tugboat and supply the original local Git root and existing API-key environment-variable name. The API key value never enters the profile. The native API is fixed to https://api.tugboatqa.com/v3.
3. Refresh native capability. It reads the actual version, project, repository, current preview census and selected original Git source. The preview selection displays original IDs, commit, state, base, URL and active job.
4. Capture original source. The completed operation retains the full provider responses, original configuration, selected source archive and complete repository bundle. A selected preview also contributes its original services, full log and job collection.
5. For a new preview, place the captured full commit in source_revision and the captured configuration_sha256 in expected_config_sha256. Select one exact original base-preview ID or none. This avoids the provider's implicit multi-base expansion. Optional config_json supplies an explicit reviewed services object; otherwise the original commit's .tugboat/config.yml is used.
6. For rebuild, refresh, start or stop, select the actual existing preview_id. The current repository census must contain it. Rebuild and refresh use their own explicit children and force booleans, both false by default.

The environment's profile revision and target fingerprint are pinned when an operation is queued. A subsequent profile change does not rewrite a queued request.

## Execute the complete preview lifecycle

Open Operate preview on the same Native tools screen. The PREVIEW purpose exposes Create, Rebuild, Refresh, Start and Stop. Choose the action and the original operating authorization, then queue it in the existing worker.

Create always supplies type=commit and the full selected commit, repository and single selected base. It retains the exact original request body before the native POST. Other actions address the selected preview itself. The provider records one actual HTTP invocation, complete original response bytes, headers, status and timing.

An accepted operation records the original PreviewJob and Content-Location. The worker then reads the same /jobs/{id}; it preserves a native 303 response instead of automatically following and discarding the job. The body supplies the original success, error or cancelled result. The job log is captured in full. A successful job is joined to the actual preview and services, checked for project/repository identity, expected operating state and—on creation—the exact reviewed source commit. That original result completes the PREVIEW operation directly.

Tugboat's native job cancellation and preview deletion are not exposed by this programme. GovHub cancellation requests retain the current original execution and stop further reads; the provider operation can still be reconciled through Resume. Starting or stopping an existing preview does not destroy it.

## Continue interrupted work

Every operation retains its prepared instruction and request hash, pre-dispatch job identities, native dispatch timing and all completed response files.

- If the original accepted response was saved before the worker stopped, Resume reads it and continues that same job.
- If a job was already accepted and recorded, the worker polls that original ID after restart.
- If the native response was lost, Resume reads current original jobs. The operation screen presents those results and accepts the actual original job ID. The provider checks its action, original scope, time, target preview and source commit before attaching it to the retained request. It never silently creates another preview to resolve an unknown write.
- A complete native HTTP429 retains Retry-After and the provider eligibility time. The original operation can be resumed after that deadline using the same prepared body.
- A complete provider terminal failure remains attached to that operation. The operator can inspect its actual logs and choose a separate corrected operating instruction.

All raw source and response artifacts remain private to the existing project. On whole-project receiving, GovHub's original workspace relocation machinery resolves those retained operation paths. Original local source and API-key references may be rebound explicitly to the receiving machine; project, repository, original source and job identities remain fixed.

## Review and handover

Use the existing complete GovHub project export/receive/open workflow. It includes its native-operation state, selected profile, retained request/response bodies, Git bundle, selected source archive, full logs and original result inventory. Open the same project on the second engineer's machine, restore the selected Git checkout from the bundled original source, set the original API-key environment-variable reference, then inspect the completed operation and preview URL.

An independent handover should demonstrate capture, exact-commit create, native job/log completion, same-ID interrupted read continuation, rebuild or refresh as authorized, stop/start, complete project export and independent reopening. Use the customer-selected original Tugboat account and repository. A native job error is retained and acted on as its own original outcome.

## Complete customer receiving command

See [TUGBOAT_RECEIVING.md](TUGBOAT_RECEIVING.md) and the original selected request example in native/tugboat/receiving.example.json. The complete programme drives the existing saved GovHub queue, retains each actual operation, and cold-opens the whole project with a separately received full application. It can resume the same instruction and produces a complete private handover.

Native job Retry-After is saved as an absolute eligibility time for that original job. Native HTTP429 is also retained in the selected host's private account-scoped state. Manual resume, capability inspection and the background worker consult that actual deadline before another provider request. A worker wakeup does not shorten the provider's deadline. The account selector is a one-way digest of the existing key; secret values never enter the profile or shared result.

The HTTP receiver compares every declared native body length before marking an original response complete. A partial body remains retained and uncertain. A complete ambiguous server response can be reconciled to its original job without another POST. Lost-create adoption checks the original operation's deterministic preview name, exact commit, selected base and explicit configuration, as well as repository, project, time and native job arguments when returned.

## Source contract

The implementation follows the complete original Tugboat v3 OpenAPI retained alongside this guide, not convenience-route assumptions in a wrapper. Native paths are /repos, /previews and /jobs; Create is POST /previews. The API uses Bearer authorization and the documented propeller Accept flag for structured repository environment variables.

The specification explicitly gives 404 both missing and permission-denied semantics; the operator does not treat 404 as proof of deletion. Job GET can return 200 with Retry-After while active and 303 with Location at completion, with the Job body retained in both cases. Native preview states and job results are preserved exactly.

The original native contract, upstream attribution and current public API endpoint are retained in native/tugboat/SOURCE.md.

## Exact outgoing product and attachment inspection

Before this application, proposal, report, presentation or export is described as customer-ready, the producing peer must open/run/render the exact outgoing version, LOOK at its real screens or returned screenshots, and operate the important controls. Inspect the screenshare and narrow/mobile widths where relevant; exercise populated, empty, loading and error states, downloads/exports and independent reopening. View the actual returned pixels; capturing images alone or source/HTTP/grammar checks do not complete this step.

Apply this to every outgoing attachment: open the final proposal HTML/document in its normal recipient application, open the complete application and project archives, and inspect the rendered content and restored original workspace. Where a final package includes video or audio, play the actual final media and inspect its presentation and natural voice quality. The native operator returns viewable images/files with exact selected source/file identities; the producing peer looks at those outputs and repairs concrete defects in the original product.

Use plain industrial design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Repair unstyled, cramped, clipped, overflowing or unreadable output while preserving the real workflows, data and computation. This is part of finishing the existing product, not a separate verification project or broad test campaign. Continue useful implementation through the original native receiving operation and retain all existing owner boundaries.

This instruction applies to current/future local and cloud peers and must travel in delegated receiving assignments and the active build/receiving guides. Preserve this instruction in the active build and receiving guides.

For Tugboat, use the exact installed GovHub source and the original customer project. Open the native capture/profile screens and saved preview-operation rows; exercise explicit project/repository/base selection, native job continuation and receiving-host Git/key-reference controls. Retain the actual full project/application ZIP, receive it in the explicitly selected independent workspace, reopen the same operations, and return the actual views to the original producing seat. Native provider actions use the already agreed authorized selected account and preserve original jobs.
