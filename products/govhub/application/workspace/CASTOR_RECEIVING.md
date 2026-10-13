# Receive the complete Castor operating project

This programme uses the installed GovHub application, its original private workspace, existing native Castor tasks and the selected Docker/Compose application. It preserves each original request, command receipt, verification report, declared output, complete source package and project backup. It does not install a task engine, create an account or schedule a deployment.

The source edition includes the provider, complete task and verification controls in the browser, the command-line receiving programme, full source/export helper, existing workspace backup and an independent application receiving path. Source review, actual native execution and rendered acceptance are separate outcomes.

## Inputs and original ownership

Select the existing GovHub workspace, complete original supplied-input directory, staff username and password environment reference. Keep its original application source and assessment engine together. Select one existing local environment record with its actual provider_resource_id equal to the profile's logical deployment identity. For a preview task its purpose must be Candidate or Rehearsal. A reviewed restore, release or rollback also requires its original comparison plan and revision.

Use the actual Castor executable or repacked application, selected native PHP launcher when applicable, complete Git checkout, Docker executable and original Docker context. The selected current source contract is Castor v1.8.1. A PHAR source installation requires the release's own PHP requirement; a static executable carries its own runtime. Do not assume the system PHP used by another product is suitable.

The profile retains exact task name and argument tokens, Castor context, ordered Compose files, Compose project, original release files and selected immutable images. These values are application-specific. No example task or service name is a customer default. Native list and help output identify the actual installed task. Keep private configuration, runtime captures and customer files on the authorized private host.

For every mutating task choose an existing verification task that emits its real JSON report on stdout or in a selected project-relative file. Declare JSON pointers and their actual expected values. A successful process exit alone does not establish a successful release, backup or restoration.

## Complete course request

Copy native/castor/receiving.example.json into the private receiving area and replace every SELECT placeholder with an actual input. The schema is govhub-castor-native-receiving/v1. Each step has a unique id, native action, existing local environment record, complete profile and original authorization. The example contains initial capture, backup, nonproduction operation, reviewed restore and following capture. Select only the authorized course; release/rollback use the same existing operation engine and explicit reviewed plan.

The work_directory belongs to this one immutable original request. The programme saves its whole original request hash and rejects another request in that directory. Do not edit a submitted request to work around a paused or interrupted native task.

Run through the installed public launcher or the same complete Python source:

~~~sh
govhub --python /ABS/ORIGINAL_PYTHON castor-receive run --request /PRIVATE/original-course.json
govhub --python /ABS/ORIGINAL_PYTHON castor-receive status --request /PRIVATE/original-course.json
~~~

Direct equivalent:

~~~sh
/ABS/ORIGINAL_PYTHON /ABS/GOVHUB/workspace/castor_receive.py run --request /PRIVATE/original-course.json
~~~

The whole saved sequence is leased serially. Each native step retains its original profile, configuration result, queue request, operation ID and complete returned operation. Repeating run continues the same original sequence. A completed step is received from its original operation; it is not issued again. Exit 2 means the retained course needs attention. Exit 0 means the command completed its stated action; inspect the complete returned state.

## Receive selected values from earlier steps

profile_sources can select a native scalar from a prior COMPLETE operation using an explicit JSON pointer. The example obtains source_revision from the actual initial capture's native_inventory.head_commit. The receiver stores that original operation ID, revision, hash, pointer and value.

A JSON field may use encoding: json to preserve a complete original value as JSON text. Runtime paths and credential environment names cannot be rebound by these source selectors. They remain explicit host selections.

For backup to restore, use backup_sources:

~~~json
{
  "backup_sources": [
    {"step":"02-backup","path":"ACTUAL_SQL_OUTPUT","target_path":"ACTUAL_RECEIVED_SQL_INPUT"},
    {"step":"02-backup","path":"ACTUAL_FILES_DIRECTORY","target_path":"ACTUAL_RECEIVED_FILES_DIRECTORY"}
  ]
}
~~~

Each selection must name exactly one complete declared output from the earlier original operation. A file contributes its complete SHA-256; a directory contributes the hash of its complete original member manifest. The receiver binds path, role, kind and original hash into backup_inputs_json and preserves the complete output record in its receiving journal. target_path is an explicitly selected project-relative destination; omitting it keeps the original relative path.

The native provider verifies that actual destination file or directory before executing the selected restore task. This selection does not copy files, rewrite native task arguments or invent a backup archive. Receive the original complete package into the authorized target and select the existing native restore task's real arguments. The helper transports directory bytes and modes separately in the complete source archive.

## Same-command recovery

Castor local processes use the original GovHub Session. They are not converted into a polling job service. An unknown mutation remains attached to its original command and process. No new command is launched merely because a previous control connection ended.

When the actual original process has completed, retain its complete Session command JSON and original stdout/stderr files. A continuation has schema govhub-castor-native-continuation/v1, the exact original request_sha256 and operations keyed by the original operation ID:

~~~json
{
  "schema":"govhub-castor-native-continuation/v1",
  "request_sha256":"ACTUAL_ORIGINAL_REQUEST_SHA256",
  "operations":{
    "ACTUAL_ORIGINAL_OPERATION_ID":{
      "castor_command_receipt":"/PRIVATE/ACTUAL_ORIGINAL_COMPLETED_COMMAND.json",
      "reason":"Receive this same original native process and its complete observed outputs"
    }
  }
}
~~~

Run the same request with --continuation /PRIVATE/original-continuation.json. The provider checks exact original argv, working directory, start identity, process ID when known, stdin/mutating selection, actual observed exit and full output sizes/hashes. Supplying a typed exit code is not a completion receipt. A nonzero original exit stays a failed native task.

runtime_bindings may supply only the provider's declared original host path fields: site_root, castor_path, php_path, git_path and docker_path. It cannot replace task, source, Docker context, Compose project or reviewed inputs. Include the existing paths of the receiving host; the complete private project retains its prior command and source history.

The receiver may resume a paused or waiting pre-dispatch step under its saved revision-bound request key. It does not resume an ambiguous mutation without its actual receipt. Cancellation remains explicit: resume_cancelled must be selected in the continuation before a cancelled operation is reconsidered. A failed task is not automatically replayed.

For a reviewed restore/release/rollback, the existing comparison engine may require the actual restored inventory. Supply its original restored_snapshot_id in the step or explicit continuation after that inventory has been retained. Native provider completion is recorded independently from the existing cohort comparison.

## Complete source and project handover

Build and verify the full source application with its selected source lock using build_application.py. Keep the resulting complete application ZIP and SHA-256. The receiving selection names:

- destination: a new absolute private directory separate from source inputs, original workspace and receiving journal;
- application_zip and application_sha256: the complete verified application;
- source_exports: original completed step, exact operation file name and optional existing host path bindings.

Each initial/following CAPTURE step must have a selected complete source archive. Additional before/after task source archives may be selected from their original completed steps.

~~~json
{
  "destination":"/PRIVATE/ACTUAL_SECOND_ENGINEER_RECEIVING",
  "application_zip":"/PRIVATE/ACTUAL_COMPLETE_APPLICATION.zip",
  "application_sha256":"ACTUAL_COMPLETE_APPLICATION_SHA256",
  "source_exports":[
    {"step":"01-source","file_name":"ACTUAL_ORIGINAL_SOURCE_FILENAME","runtime_bindings":{"git_path":"/ABS/ACTUAL_GIT"}},
    {"step":"05-following-source","file_name":"ACTUAL_ORIGINAL_SOURCE_FILENAME","runtime_bindings":{"git_path":"/ABS/ACTUAL_GIT"}}
  ]
}
~~~

~~~sh
govhub --python /ABS/ORIGINAL_PYTHON castor-receive handover --request /PRIVATE/original-course.json --selection /PRIVATE/original-handover.json
~~~

The receiver reads each actual operation artifact and verifies its complete bytes/hash before opening the archive. It checks the original logical environment, Castor entrypoint/context, Docker context, Compose project and ordered files, release/output/backup selections, original capture phase, actual source commit and full original source-result target. The native source helper validates every complete archived member, receives it in a separate directory and reopens original Git and working source through the actual selected Git executable.

Image archives remain complete original recovery inputs. Independent source receiving does not load images, start containers, execute Castor tasks or import a database. An authorized native restore/release is a separately selected original operating step.

The same handover also copies complete original GovHub supplied inputs, verifies/unpacks the full application, creates a coherent private workspace backup, checks all completed course operations, then launches a separate Python process from the received application. That independent process authenticates through the existing staff credential reference and compares the original workspace identity and every saved operation. The original course request/state travel with the backup.

Repeating handover uses its same retained selection, source archives and output directories. It validates already-received files instead of replacing them with another source. Retain complete private archives with their authorized recipient; they can contain account configuration and customer data.

## Actual browser receiving

native/castor/browser_receive.cjs uses the equipped host's already-installed Playwright and browser. It installs nothing and launches no provider task. Copy browser.example.json to the private operation and select actual origin, existing staff credential reference, local environment IDs, completed or attention-state operation IDs, exact download names and output directory.

~~~sh
node /ABS/GOVHUB/workspace/native/castor/browser_receive.cjs /PRIVATE/original-browser-course.json
~~~

The course opens the exact installed application, signs in through its native login, captures desktop and 390-pixel views, operates task and verification selection in the unsaved editor, opens original source definitions, visits the native task instruction, opens original operation and receiving-host controls, and downloads the selected complete artifacts through their actual UI links. Every download must match its original size and SHA-256. It exercises the real browser transport failure/recovery state and reopens the same operation in a separate browser session.

The result records actual screenshots, browser errors, selected views, download identities and original reopened operation. It marks visible overflow or browser errors as repair required. Otherwise its state remains RENDERED_AWAITING_VISUAL_INSPECTION. A person or the actual visual reader must open and inspect every screenshot, record concrete findings and rerun affected views after repair. Missing task/backup/source inputs are reported, not simulated. Retain actual empty/loading/failed/complete states from this course; do not claim a state was reviewed if it never occurred.

## Completion evidence

The delivered private project includes original source, complete task/verification outputs, complete source and image archives, declared backup files/directories, saved operation history, editable application, original upstream notices, actual independent source/project reopen and rendered receiving results. Source publication alone does not establish installed execution, working native access, a successful restoration, rendered acceptance or commercial acceptance. Keep each actual outcome with its original request and source edition.


## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.


### Continuing an independently received Git command

The same continuation document may include `source_commands`, an object keyed by the zero-based index of the original handover's `source_exports` selection. Each value is the absolute path to the actual original completed receiving Session command receipt. For example, `"source_commands": {"0": "/PRIVATE/original-completed.command.json"}`. Preserve the original continuation schema and `request_sha256`, handover selection, private receiving directory and export index. The receiver loads that source Session's saved state, passes the original receipt to `castor_source.receive_command_receipt`, and continues the same `reopen_source` operation. The helper validates the actual original command, process and complete output identities. A claimed exit code, a new command or an unverified receipt cannot replace an unknown native result.

The full handover freezes its original course and complete operation cohort before receiving files or creating its private backup. Repeating that handover compares the saved backup and independent reopen against those frozen revisions. Later changes in the source workspace do not replace its already accepted course.
