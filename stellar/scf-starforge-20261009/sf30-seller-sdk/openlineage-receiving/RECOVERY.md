# OpenLineage Python receiving continuation

This is a complete continuation of the original BBBD Python connected operation,
not another producer, SDK, event generator, payment engine, or application.
It invokes the same original `native-python` CLI, HTTP application, export writer
and `receiveBundle` implementation against the original two upstream events.

## Selection

Adopt this successor **before the first SDK emission**. Retain the original programme in its existing source archive. An earlier operation that already ran without `continuation.json`
must first be reconciled from its own saved operation record; this command does
not guess completed phases from an arbitrary directory. The command refuses an occupied operation directory that lacks its own
continuation record.

The recovered original in the source archive is `python-connected-operation.original.mjs`, 14,774 bytes,
SHA-256 `02fd5736f1f9b4fba2554581d2ec78677cd806bb3146218c967ab42dfb68fc97`,
from Slack F0C8P3Y8ZND. The original operation identity remains
`SCF-OPENLINEAGE-NATIVE-PRODUCERS-BBBD-20261012/python`.

The selected application provides `APPLICATION_FILES` and `APPLICATION_VERSION`.
Every portable member's original bytes are bound at first opening. A subsequent
application edit therefore cannot silently change an unfinished Python phase.
The selected Java successor is adopted at its own preparation boundary.
The paired native-producer.mjs update retains the inherited operation lease in
the actual Python SDK subprocess. Without the optional lease environment variable,
the native CLI preserves its existing standard-I/O and interpreter behavior.

## Run and resume

Place the complete actual application and the installed, released
`openlineage-python==1.53.0` with its dependencies on the receiving host.
This package does not include or emulate those dependencies.

```sh
python receiving-run.py \
  --root /absolute/private/openlineage-operation \
  --source /absolute/private/selected-application \
  --python-sdk /absolute/private/python-sdk
```

Repeat that identical command after an interruption. The same kernel lease,
source selection, workspace identity, private token files, producer directories,
operation IDs, edition request and export IDs remain selected. Exit 75 means the
same receiving programme still owns its lease; attach to that existing process.

Do not run the original 14,774-byte programme in the same directory after adopting
this continuation: it unconditionally recreates tokens and starts at the original
zero-source assertion. Do not erase `continuation.json` to restart a phase.

## Complete original workflow

The programme retains the original writer-lock HTTP 503 case; restarts the
receiver; resumes the same saved gzip request; verifies the original SDK's wire,
serialization and acknowledgements; restarts and resumes completed requests with
no new revision; saves the reviewed edition; exports the complete selected
application; receives and opens it independently; runs its extracted CLI with
identity transport; replays the saved gzip request; and exports the resulting
four-source, two-event workspace.

Each phase commits its result atomically. The edition's exact expected revision
and request body are persisted before invoking the original writer. Native pending
requests resume through the native CLI rather than receive a replacement event ID.
Original downloads keep their chosen export IDs and original server ports.
This preserves the actual download journal's base-URL binding after restart.
A partial native input capture without plan.json repeats the original prepare
operation; it does not attempt to resume a plan that was never published. Local extraction remains
create-only: an interrupted extraction is retained, and a fresh private staging
copy is published only after the original receiver returns.

Completed phases are not repeated. A completed operation reopens and verifies its
full saved export, then returns that same result without another SDK emission.
Logs use monotonically numbered files, including when a process died after opening
a log but before recording it in the journal. Private token publication uses
fsync plus a create-only hard link, so concurrent creators cannot expose an empty
or rewritten credential file. The full token is never printed in the command
result or public phase journal.

## Retained outputs

All outputs stay under `<root>/python-operation/`:

- `continuation.json` and `python-connected-operation.json`: exact selections,
  completed phase results, interrupted attempts and original command-log paths.
- `workspace-native.json` and `received-native-complete.json`: full original
  exports, with the selected portable application and editable workspace.
- `workspace/`, `received/`, `producer/`, `received-producer/`: the original
  application state, original native request wires and acknowledgements.
- `logs/`: every complete stdout/stderr attempt, never overwritten on resume.

The operator and producer token files, `private-config.json`, raw process logs,
and `last-error.private.json` are private host state. Do not post or include those
files in a public source/review archive. Hand the existing private token-file
paths to the original Java continuation on this same host.

## Executed native recovery

The native filesystem/process recovery exercise completed on Node 22.16 and
CPython 3.13.5, Linux x86_64, glibc 2.41: real SIGKILL and reopening, a retained
request after a lost response, complete log preservation, source-selection
binding, and 32 concurrent private-token creators. Run it with:

```sh
node exercise-recovery.mjs
```

The original complete application's RECEIVING.mjs and
MERCHANT_PRODUCER_RECEIVING.mjs both completed on the exact d684 source.
Their retained independent editable exports contain all 55 application files.
The v4 partial-download exercise retained 65,536 bytes, restarted the actual
server on its saved endpoint, and received and verified the complete 1,100,828-byte,
66-file application export through the original LineageClient and verifyBundle.
The native Python CLI status path also confirmed that the SDK subprocess retains
its kernel lease after SIGKILL of the calling Node process and releases it on exit.

```sh
node exercise-native-boundaries.mjs /absolute/private/selected-v4-application
```

The full released Python/Java SDK emission sequence requires the separately
acquired offline dependencies. It has not yet run on this receiver. The schema
programme retained its original workspace at revision 6; Chromium navigation
returned ERR_BLOCKED_BY_ADMINISTRATOR before browser interaction. The complete
native outputs and the original schema checkpoint remain separate from these
uncompleted SDK/browser stages.
