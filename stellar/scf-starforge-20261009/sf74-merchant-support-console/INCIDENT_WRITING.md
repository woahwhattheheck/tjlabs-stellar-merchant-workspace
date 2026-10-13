# Keep and resume Incident configuration writing

The Incident desk keeps complete unfinished configuration text beside the current
watcher settings. This includes incomplete JSON, the original registered source,
the original configuration and revision, earlier writing, and the exact original
apply request and any server response. A working copy opens through the same
Incident desk and continues through its existing **Apply configuration** action.

Open the original Support console with its existing private incident-source
configuration. The [Incident sources guide](INCIDENT_SOURCES.md) covers that
installation and the original watcher, incident and notification controls.

## Continue unfinished work

In **Watcher registration and notification settings**, edit **Current watcher
configuration**, or add an inspected Object, CKAN, OAuth or merchant source
through its existing registration controls. The complete resulting text is
retained for that selected incident source as you edit. Invalid or unfinished
JSON remains usable writing; Apply still requires a valid configuration.

Switching to another registered incident source keeps the writing for the source
you left. Returning to it restores its own text and original revision. Reloading
the page in the same tab restores the selected source's retained writing once
the console has read its current settings. These working records use the tab's
session storage and the console's exact browser origin.

Use **Working-copy name** to identify the work, then **Keep named working copy**
to retain a complete immutable copy in this browser. Each save creates another
copy rather than replacing an earlier one. Select the copy in **Saved copies in
this browser** and choose **Open selected working copy** to continue it. Opening
another copy carries forward the writing and history already open, including
earlier configuration editions and unresolved requests.

Session recovery is specific to a browser tab. Named copies remain in the
browser's local storage for this origin. Browser clearing, private browsing and
storage limits can remove either kind of storage. **Download complete writing**
creates the complete portable file for another machine, another browser, or
long-term retention. When browser storage is unavailable the status explains that
the writing remains in the current page and should be downloaded before leaving.

## Download and reopen the whole writing

Choose **Download complete writing**. Its JSON contains the raw unfinished text,
original public source selection, original full configuration/revision/digest,
retained earlier editions and every recorded apply request and outcome. The file
opens without its old browser storage.

On the receiving console, first choose the same registered source, then use
**Open a complete configuration working file**. The console checks the complete
file before replacing the visible writing. If the selected source or visible
writing changed while the file was read, it leaves the current work intact and
asks you to open the file again.

The complete file limit is 16 MiB; the editor retains up to 60,000 characters
through the existing text field. All earlier editions are included. Keep a
complete download before starting another working copy when accumulated history
approaches the limit. Treat the file as operational configuration: it can
contain endpoint references, source labels and environment-variable names from
your existing watcher settings.

A source with the same name can have changed since the file was written. The
desk compares the entire original public source selection, its configuration
revision and its configuration digest with the current source. It displays an
outdated source or revision explicitly instead of silently applying the file
to newer settings.

## Continue against changed settings

Open **Review original settings, current settings and unfinished text**. It
shows the complete original settings, original request if present, the newly
read settings and your raw writing.

Choose either:

- **Keep writing against reviewed current revision** to retain the text and
  explicitly use the displayed current configuration as its new base.
- **Use current settings and retain earlier writing** to open the displayed
  current configuration. The previous text, original settings and any request
  remain in the complete working-copy history.

Neither choice applies settings to the watcher. Continue editing, inspect any
source selection again if needed, then use the existing **Apply configuration**
button. The server's original configuration compiler and revision comparison
still decide whether the operation can apply. Another operator changing settings
between this read and that request produces the existing revision conflict.

**Review current settings** beside Apply opens this same comparison. It keeps
unfinished work available instead of discarding it.

## Recover an interrupted apply

Before the browser sends Apply, it retains the exact full configuration and
expected revision selected for that original request. When the server replies,
the browser retains the returned configuration revision and digest before
refreshing the page.

The desk distinguishes these situations:

| Observed result | Continuing the same work |
| --- | --- |
| Server acceptance matches the current revision and digest | The working copy adopts that saved configuration and retains the request and actual response. |
| A response was lost, but the current settings match the selected request | The copy records that observed match. Its history labels the matching current settings separately from a retained server acceptance. |
| No response is available and the original revision remains current | **Retry exact original apply** sends the same retained configuration and expected revision through the original server operation. |
| Current settings differ from the retained request | Review original and current settings. An exact retry keeps the original expected revision; continuing new writing uses the explicit current-revision comparison. |
| The source selection changed | Review both selections and choose how to continue the writing. The old request cannot be retried against a different registered selection. |
| The original server accepted, then current settings advanced again | Both the acceptance and the later current settings remain visible. Review that newer edition before preparing another apply. |

A rejected attempt also retains the original request and its reported error.
Correct or continue the writing through the comparison. A new apply is prepared
only after the earlier request has been retained in the working history.

Text edited after an original request was prepared remains intact when that
request is reconciled. The saved configuration becomes the new base while those
later edits stay as unfinished writing.

## What the complete file retains

The file schema is `stellar-forge.incident-writing.v1`. Its top-level record
contains an immutable copy ID, name, dates, complete public source selection,
`base` configuration/revision/hash, raw `text`, optional `pending` request,
and complete `editions` and `requests` arrays. A pending request carries its
original selected text and exact payload. An accepted response records the
server's revision/hash; later observation records include their full
configuration.

Opening another copy retains both histories in their original order and removes
only identical duplicated history entries. Named browser copies use independent
storage keys. Tabs retain their own unfinished records, and the original server
revision check handles competing applies.

The same complete model is exported by `incident-writing.mjs` for installed
source consumers:

| Operation | Result |
| --- | --- |
| `createIncidentWriting(current)` | Complete writing based on an original Incident list result. |
| `readIncidentWriting(text)` / `exportIncidentWriting(record)` | Validate, open and download the complete file, including unfinished text and history. |
| `incidentWritingState(record,current)` | Compare the original source, base and request with a current original read. |
| `advanceIncidentWriting(record,current,{keepText})` | Retain the earlier edition and continue against reviewed current settings. |
| `prepareIncidentApply(record,current,config)` | Retain the exact request for the original configuration operation. |
| `recordIncidentAcceptance(record,result)` | Retain the actual original server revision/hash response. |
| `reconcileIncidentApply(record,current)` | Continue the same writing from the actual later read. |

These model operations retain writing. The existing Incident server remains the
only configuration writer. Its existing watcher start/stop, notification and
merchant operations keep their original separate controls.

## Receive and inspect the actual outgoing product

Use the complete current SF74 source with `incident-writing.mjs`, the matching
`incident-desk.mjs`, stylesheet and registered static asset. Preserve the
existing merchant case and source directories and use the original equipped
receiver. The normal server invocation and all registered source requirements
are in [Incident sources](INCIDENT_SOURCES.md).

The producing and receiving operators must open the exact outgoing console,
look at its actual desktop and narrow screens, and operate the complete
workflow. Inspect populated, empty, loading and error views; edit incomplete
text, switch and reload, keep a named copy, download it, open that exact file,
review changed settings and reconcile the actual apply result. Open the
downloaded JSON and its retained histories as the recipient. Inspect every
additional outgoing attachment or ZIP's actual contents and rendered documents;
watch or listen to any final media. Repair presentation in the maintained source
before customer readiness.

The focused browser course accepts the existing console's loopback URL and
selected source ID. Its apply step uses that original source's unchanged
configuration, through the original revision comparison. It captures screenshots
and complete downloads alongside the operated case, retains progress and exact
request bodies before forwarding, and checks that its own apply preserved the
selected configuration digest. It does not need a watcher start or notification
send to exercise writing recovery. When this environment cannot run the
console, send the same complete source and original-case course to the existing
equipped receiver and inspect its returned actual views.

### Run the complete private source receiver

From the complete installed repository, use the existing Node runtime:

```sh
node stellar/scf-starforge-20261009/sf74-merchant-support-console/receiving/incident-writing-host.mjs /private/incident-writing-receiving
```

Use the same receiving directory to resume. The program initializes its two
original development stores once, opens the complete maintained Support server,
operates the browser course, drains the original host, and retains the exact
stores, complete files, progress, screenshots and result there. Its configured
loopback seller references are not polled: the watcher remains stopped. Set
`SF74_PLAYWRIGHT_MODULE` and `SF74_CHROMIUM_PATH` only when the installed
runtime needs explicit existing paths. No dependency installation is required.

To use an already opened original receiving console, run
`receiving/incident-writing-browser.mjs INPUT.json` with `base_url`,
`case_root` and `source_id`, plus optional `expected_config_hash`,
`expected_config_revision`, `playwright_module` and `chromium_path`.
Keep that original host alive throughout its course. Both programs retain the
same request and phase checkpoint when resuming the original directory.

The receiver records each private Node and Chromium process group before execution,
including its original boot, PID namespace and process start time. Normal completion,
errors, SIGTERM and SIGINT use the same cleanup path; the receiver checks surviving
group members even after a launcher exits. Chromium's separate process group is
reconciled from its own retained record. Keep `receiving-process.mjs` with both
receiving programs and preserve their process-control receipts when resuming.
`SF74_RECEIVING_PYTHON` may select the existing absolute Python executable used
by the private launch wrapper. These receipts never authorize closing another
operator's browser or a process whose original identity no longer matches.
