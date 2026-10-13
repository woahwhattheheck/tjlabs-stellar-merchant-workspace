# Delivery Risk original execution owner

This owner runs the maintained risk course and its browser companion against one explicitly selected original SF47 installation. It creates a separate private WALKTHROUGH receiving workspace from the supplied original scenario; it never modifies the earlier Contributor case.

## Complete selection

Use schema `stellar-forge.sf47-risk-execution.v1` and a stable operationId. Required fields are repositoryRoot, outputDirectory, sourceManifest, scenario, python, node, browserScript and browser. sourceManifest/scenario/python/node are complete absolute path/bytes/SHA256 descriptors. sourceManifest contains the exact repository-relative files array with bytes/SHA256/mode, including every current original BOOT_FILES member, operations_walkthrough.py, operations_risks_walkthrough.py, RISK_REGISTER_RECEIVING.md, this execution owner and the exact browser companion. The Python and Node original source selections remain unchanged by the receiving files.

browser has playwrightModule, executablePath, playwrightSha256 and executableSha256 from the actual selected runtime. browserScript is the workspace companion's basename. Browser runtime acquisition is outside this command; it never downloads a replacement runtime or substitutes another host.

The optional library object selects the complete current unchanged three-file Library helper cohort: helperDirectory and files (full descriptors for library_upload.py, library_hosted_apps.py and library_file_transfer.py). An optional retained target identifies an existing original saved item and observed expected_current_version. Without it the first closed archive is a create, and a subsequent completed result provides the same item identity for replacements. Omitted or zero current version is retained as returned, never invented.

Keep source and output as separate non-overlapping roots. Output must be an owned 0700 directory. The program checks source/runtime before original domain writes and holds one original flock guard through host, course, browser, actual child close, cold reopen, archive and save.

## Run and resume

Run the selected interpreter:

    python -B operations_risks_execution.py --input /absolute/private/input.json

The first host uses the original server.create_server and managed_launch selection/require_selection/retain_launch functions. Its actual port is saved before serving. All resumed and cold-reopened hosts select that same port and verify the original origin. The original Workspace lock prevents competing database writers. A stale external listener is not borrowed.

The owner starts one child for the complete native course, then one browser child holding an inherited duplicate of its guard. Each child has a create-only input/stdout/stderr directory. The parent forwards the first stop signal to the same child and retains it through its actual close. The browser's original Chromium/context/download owners drain before the Python owner closes the host. No two-second kill is applied to this nested owner.

After the browser finishes, this owner checks every manifested file, the closed candidate and its closure, then calls the unchanged native verified_archive for all three ZIPs. It validates each original risk review, the immutable first two editions, selected document bytes and the actual third command event. NATIVE_ARCHIVE_VERIFICATION.json retains these complete checks.

The original host drains all HTTP threads, retires its managed launch and closes its original Workspace. A second actual host opens the same private state and same port. The course's fresh-process verify checks the original and both received cases. That host also closes completely before packaging.

NATIVE_OUTCOME.json is frozen only after the complete native/browser/ZIP-validation/cold-reopen course and both host closures. Once present, a save-only continuation verifies those original outputs and reuses the retained pending archive without starting a host or browser.

Resume with the exact same input. The native course retains its requests and result, the browser retains its exact third-edition command and original downloads, and the execution owner retains every child attempt. Reentry never substitutes new native commands for an accepted course.

## Artifacts and durable save

EXECUTION_SELECTION.json retains the complete immutable input. EXECUTION_JOURNAL.json retains all original child attempts and managed host lifetimes. Each closed archive includes the original workspace, complete native and browser outcomes, immutable sources attached to the case, native ZIPs and full attempt logs. Browser profiles, caches and screenshots are not delivered. Repository-backed code is excluded; the complete source manifest and original Git revision provide source reacquisition.

Archives are private full-state handovers and contain authentication material required for this installation's recovery. They must remain in the authorized private destination. They are not public source exports.

With the library cohort selected, the owner invokes the unchanged full upload workflow once for the closed archive, saves its exact request and original ordered result under upload-state, and emits every ordered result before aggregate failure. A passive observer retains the exact original prepare/finalize request and response envelopes under upload-state; an observer failure never prevents or changes the original delegate invocation or result. Provider/helper state stays outside the case archive. An existing request without a returned result is retained for reconciliation before any second upload. It does not rerun a native case to recover a save. Ordinary successful successors use the original returned file identity and actual observed version.

The final immutable closure receipt is published only after the execution guard's owned descriptor closes. It identifies the complete closed ZIP and save result. Native or browser failures still produce an interrupted closed-case archive only after all actual owners drain. A source-level prepared package is not a completed runtime result.
