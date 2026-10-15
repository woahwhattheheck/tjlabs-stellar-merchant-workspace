# Compass native API runner

This runner executes the published Compass API from the owner's Linux environment. It joins the portable request engine and the Restaurant Integration Evaluation Desk. The native runtime is **Linux, Node 20 or later, util-linux flock, and a private local filesystem**. The offline desk and portable engine remain independent of Linux.

## Start from an actual prepared request

Export the request JSON from the desk, or use the public metadata request provided here. Use a new operation ID for a deliberate new request. The exact operation ID binds its complete body, endpoint, mode, account alias and context. Set the real preparation time and the intended nonsecret account alias.

Run the command from the complete application's root directory:

~~~sh
node native/compass-call.cjs run --journal /absolute/private/compass-journal --request /absolute/path/request.json --out /absolute/path/new-receipt.json
~~~

The first run creates a private journal directory. Existing journal directories must belong to the current user and have mode 0700. Files remain private. Parent directories must exist for output files, and each output name must be new. A response receipt is also retained in the journal, so an interrupted output write does not require another API request.

Metadata is public. Metered endpoints read the API key exclusively from the process environment, under COMPASS_API_KEY. Supply it through the owner's normal secret handling. The CLI accepts no credential argument, and the engine excludes the key from retained request headers. Keep the journal and actual customer records private.

## A complete known-place workflow

1. Prepare an Enrich operation using the actual restaurant name and full address or caller-held place identifier. The browser prepares the exact documented request. Run it with the command above.
2. Inspect the received match, its location and supporting fields. Use the exact confirmed Compass ID. A Search flow similarly requires an explicit choice from the retained candidates.
3. Save the actual supported profile in a JSON file. The included strict-vegan profile shows the field structure. Prepare the next request:

~~~sh
node native/compass-call.cjs prepare-decision --journal /absolute/private/compass-journal --upstream EXISTING_OPERATION --compass-id SELECTED_COMPASS_ID --profile /absolute/path/profile.json --profile-id PROFILE_VERSION --id NEW_DECISION_OPERATION --selected-by "Reviewer name" --mode fast --out /absolute/path/new-decision.json
~~~

The command records the selector and current selection time, binds the complete upstream response and body, and uses the supplied profile ID. It retains the original profile, upstream packet and prepared request. It prepares the request without calling the API. An optional --selected-at accepts an actual recorded ISO timestamp.

4. Run the prepared decision with the ordinary run command. The engine reloads the upstream identity before dispatch. Import its complete receipt or the complete native export into the desk.
5. Review the exact returned dietary result and source wording before adopting an explanation for that place and profile. Changing the place or profile creates a successor request and review.

## Read and export

~~~sh
node native/compass-call.cjs inspect --journal /absolute/private/compass-journal --id OPERATION
node native/compass-call.cjs inspect --journal /absolute/private/compass-journal --id OPERATION --out /absolute/path/new-journal-packet.json
node native/compass-call.cjs export --journal /absolute/private/compass-journal --out /absolute/path/new-complete-export.json
~~~

Run exits 0 for a complete received/revalidated response, 2 for an HTTP error, 3 for an ambiguous dispatch, 4 for a retained prepared operation, 5 for an incomplete response and 6 for exhausted transport limits. Source/argument errors use 1 and a competing writer uses 73. The complete journal remains available for every retained outcome.

Inspect prints a compact operation summary. When an output is supplied, a valid operation produces its exact compass.journal/v1 packet. An invalid or not-yet-dispatched operation produces an explicit native inspection record.

The default export contains all retained operations. To export one decision and its upstream dependency chain, add --id OPERATION. The compass.native-export/v1 file contains each complete journal, all immutable event files, original input bytes and partial or unselected files. Every artifact has its original relative name, byte count, SHA-256 and Base64 bytes. A journal that cannot be validated retains all its raw files with a diagnosis. Each operation has its own capture time; the multi-operation export does not claim one simultaneous global snapshot.

The declared per-file read/publish limit is 32 MiB, covering the engine's 16 MiB response limit and Base64 record expansion. The full export budget is 256 MiB of retained artifact bytes. If a complete workspace exceeds this budget, export complete individual dependency chains; the journal retains every original.

## Interruption and concurrency

The lock file is a stable inode held by the Linux kernel for the full operation. A concurrent writer receives JOURNAL_BUSY and exit code 73. The lock releases when the process exits or is killed. **Leave the lock file in place.** There is no age-based removal or force-unlock command.

The original operation is durable before dispatch; the dispatch event is durable before the HTTP call. Every event is immutable and hash-chained by the engine. Before the journal or an operation becomes available, native storage flushes the physical directory and every ancestor directory entry created along its path. It then flushes each private temporary event file, publishes it exclusively, and flushes its parent directory. A directory-sync failure stops before dispatch. Selected files are never overwritten. An unsuccessful publication leaves its bytes available for the complete export.

Repeating an exact operation returns the retained state, including prepared or ambiguous dispatch states. It does not resume an interrupted call. If the provider might have received a request, retain that operation and inspect the provider's actual usage or outcome. A deliberate subsequent call uses a new operation ID and an explicit relationship in the evaluation record. Automatic retries remain limited to the engine's documented rate-limit responses.

The filesystem protocol is intended for the local Linux filesystem. Network filesystems have different lock and durability semantics and are outside this native runner's runtime contract. Filesystem synchronization remains subject to the operating system and storage device.

## Actual native acceptance

Run this command in the receiving Linux environment:

~~~sh
node native/verify-journal.cjs
~~~

The course uses **actual Node files, child processes and kernel locks**. Its provider response objects are explicitly authored and make no API request. It covers exact original-byte retention, repeat suppression, changed-input rejection, a real competing process, termination after a durable dispatch, automatic lock release, explicit Enrich-to-Decide selection, current profile binding, whole export and partial-file recovery, credential exclusion, exclusive outputs and changed-event diagnosis. It preserves its entire temporary directory and prints the report location.

A syntax and CLI-parser check in the connected V8 runtime is separate from this native acceptance. The report records the actual runtime when the native command executes. The original equipped receiving operation owns Linux/filesystem and rendered-browser execution for the whole product.

## Implementation sources

- Node filesystem API: https://nodejs.org/api/fs.html
- util-linux flock command: https://man7.org/linux/man-pages/man1/flock.1.html
- Linux file and parent-directory synchronization: https://man7.org/linux/man-pages/man2/fsync.2.html
- Linux open-file-description lock semantics: https://man7.org/linux/man-pages/man2/flock.2.html
- Current Compass route and response contract: https://compassfoodtechnologies.com/openapi.json

The child flock process inherits the parent's open file description as descriptor 3. The parent keeps that description open throughout the engine call, then closes it. All subprocess arguments are structured arguments without a shell.
