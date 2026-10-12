# Complete editable research projects

A research project carries the original saved files and the research you performed
on them. It can be received in a new directory, searched without rebuilding the
index, edited independently, and handed over again. Its `.sfrp` file is a gzip tar
archive, not a program or an installer.

## Export, receive and continue

Use Node **22.16 or newer**, with its built-in SQLite/FTS5 support, and Python
**3.10 or newer**. Archive receiving supports Linux with `renameat2` and Windows.
The project remains create-only on both: an existing destination is never replaced.
The Linux path is the operated delivery platform.

In an installed merchant distribution:

```sh
starforge buyer-research-project export --state /private/library --out ./research.sfrp
starforge buyer-research-project inspect --archive ./research.sfrp
starforge buyer-research-project receive --archive ./research.sfrp --out /private/reviewer
starforge buyer-research serve --state /private/reviewer
```

In this source directory, replace `starforge buyer-research-project` with
`node project-cli.mjs`, and `starforge buyer-research` with `node cli.mjs`.
The destination's parent must already exist. Paths containing spaces work when
quoted. Choose `--python /path/to/python3` when Python is not on PATH. A server can
use the same setting through `STARFORGE_PYTHON`.

The existing research screen has **Download complete project** beside saved
searches. It prepares a private download through the original authenticated
listener and verified download registry. Receive that download with the command
above, then open the new private URL printed by the existing research server.
Keep the receiving installation as well as the project: application source and
runtime executables are not embedded in the data archive.

## What travels together

The archive includes the selected resource-library edition, all original resource
IDs, complete original files for the selected and retained research editions,
full content-search passages and build history, saved-query revisions and replay
receipts, resource annotation history, collection histories and saved selections.
Repeated original bytes are stored once by SHA-256. Binary originals travel too;
only the existing UTF-8 search engine determines which files are searchable.

Completed reading-exchange handovers retain their original source archive,
manifest and reading ZIP alongside the existing operation and capture tables.
A currently preparing reading handover must finish before export so a live
producer's changing files are not mistaken for a completed snapshot. This does not
prevent normal read-only research or require another approval.

The receiver uses the original review, collection and saved-query writers. It
rebases file locations into the new directory while preserving IDs, digests,
source provenance and prior review revisions. Refresh reads the received source
edition rather than reaching back to the sender's inbox. The original library and
its files are not edited. A reviewer can change notes, rename saved searches,
make collections, refresh the index and export a successor project.

Historical query bindings and original provenance are retained, not rewritten as
new purchases. A data handover does not contact a seller or execute a payment.

## Archive and recovery behavior

Two writer locks establish a consistent library/search snapshot; readers remain
available with the original WAL stores. SQLite backup produces self-contained
copies, not a raw copy of a database beside a missing WAL. Only private copies
have their receive-time paths and interrupted derived leases adjusted.

Receiving verifies every declared regular member, byte count and SHA-256 before
publishing the new directory atomically. It rejects links, path traversal,
unsupported or repeated members, missing stores, and changed content. The default
expanded-file ceiling is 1 TiB; lower it with `--maximumBytes N`. A manifest is
limited to 32 MiB, 100,000 members and 10,000 current resources. Allow free disk for
the retained original bytes, two SQLite stores, and an export/receive staging copy.
The receiver stages beside the destination so the final publication remains on
the same filesystem.

An ordinary cancellation removes that operation's temporary output. A hard process
or machine failure can leave an unpublished `.research-receive-*` or
`.research-project-*` directory. The previous source and already published archive
remain intact; remove only a confirmed abandoned temporary directory and repeat
into a fresh destination. An archive containing a partial content-index build
keeps its completed selected edition and marks the copied partial build
interrupted for the original indexer's normal recovery.

Projects contain full private text, local-source provenance and review history.
Share them only with the intended recipient. SHA-256 checks detect changed bytes;
they are not a signature or an endorsement of the sender. The archive contains no
executable payload, and the receiver does not fetch remote resources.

## Native application interface

```js
import {saveProject, receiveProject, ResearchProjectClient} from './project.mjs';

const archive = await saveProject(existingContentSearch, './review.sfrp');
const received = await receiveProject(archive.path, '/private/received-review');
// Use openLibrary({state: received.path}) and openContentSearch(library) normally.

const client = new ResearchProjectClient({origin: server.origin, token: server.token});
const downloadTicket = await client.project({signal});
```

The installed typed export is `@tokenjunkielabs/starforge-merchant/buyer/research/project`.
`projectDownload` also returns a file-descriptor download compatible with the
original server; callers must invoke its `dispose()` after receiving all bytes.

## Worked example

The supplied authored demonstration has 111 complete original files, two completed
retained search builds, multilingual passages, a match beyond the first MiB,
revisioned notes and saved searches. `project-journey.mjs` receives the same
original journey state, edits it independently, exports through authenticated
HTTP, and reopens it for another reviewer. It also checks that the sender's
resources, annotations and saved queries remain unchanged. The associated archive
is an example workspace, not a supplier lead or customer record.
