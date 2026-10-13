# Read and deliver complete Application output

Applications and Launch Groups retain each operation's original worker output.
Open **Original operations → Open output**, or a launch-group member's
**Original output**, to read that complete file through the same private Runtime
workspace.

The output reader starts at the live tail. **Beginning**, **Previous output**,
**Next output**, **Selected end** and **Go to byte** browse a fixed selected
range. **Keep this output selection** freezes the currently displayed range.
The selected end remains fixed while the worker appends newer output. Choose
**Follow live output** to read the current tail again.

The operator can follow a long commissioning run, inspect its earlier source
or native error, receive the complete original log, and continue the same saved
Application request. The existing Review, Start, Recover and Stop controls,
worker process and original terminal input remain in their existing workflows.

## Browse a saved operation

1. Select the original saved Application and its operation in the existing
   paginated history. A launch group selects the same member Application and
   original operation.
2. Read the live tail, then choose **Beginning** to inspect its earlier output.
   The description shows the selected byte range, fixed end, current retained
   size and original operation ID.
3. Use **Find in this output page** for exact text matches in the displayed page.
   **Next match** moves through the first 500 shown matches. Paging selects the
   next part of the same original file.
4. **Go to byte** accepts an offset inside the selected range. UTF-8 page edges
   expand around a complete character, so the displayed starting byte may be
   up to three bytes before the requested offset. **Next output** uses the
   returned end offset and does not split those characters.
5. Choose **Download complete selected output** to receive every original byte
   from zero through the displayed selected end, including portions outside the
   visible page. A later append remains outside that earlier selection.
6. **Refresh output** checks the selected original file again. **Follow live
   output** deliberately opens the current source and its current end.

A frozen selection and offset are retained in this browser session by Runtime
workspace, Application and operation identity. Reopening that same operation
restores its selected range. Automatic process refresh preserves a frozen page
and its scroll position.

The displayed text normally removes terminal escape sequences and presents
line endings readably. **Show decoded text without terminal cleanup** shows the
original UTF-8 decoding. Original downloads retain escape bytes, line endings
and every other byte exactly. An incomplete UTF-8 sequence at the selected
end or invalid UTF-8 bytes can appear as replacement characters in the text
view; the original download preserves those bytes.

## Source selection and interruption

A selection records the actual Application and operation, original file
generation, fixed end and hashes of the selected beginning and end. The file
generation uses its device, inode and creation time. Each read checks the
named file against the opened handle and validates the selected range.
A rotated, replaced or shortened output requires an explicit new selection.
The reader does not silently combine that replacement with the earlier page.

This is a view of the existing append-only worker log. It does not create
another saved log or alter the worker. The original Runtime receiving and
backup workflow retains the actual operating files. Keep a completed download
when handing a selected range to another engineer.

A missing output may mean that the original queued worker has not created it
yet. Its original operation remains available through Applications. Reopen or
recover that saved request through the existing lifecycle controls. A failed
download can be requested again against the same selected range. The browser
uses the existing authenticated, short-lived download capability and streams
the original bytes.

## Native API

Open the original Runtime workspace through its existing exported model:

~~~js
import { openRuntimeWorkspace }
  from '@tokenjunkielabs/starforge-merchant/runtime-workspace';

const workspace = await openRuntimeWorkspace({ directory: originalDirectory });
const first = await workspace.applicationsOutputPage({
  applicationId, operationId, offset: 0,
});
const following = await workspace.applicationsOutputPage({
  applicationId, operationId, selection: first.selection,
  offset: first.nextOffset,
});
~~~

The method **applicationsOutputPage** accepts:

| Field | Meaning |
| --- | --- |
| applicationId, operationId | Existing saved Application and its original run |
| selection | Optional original returned selection token; omission selects the current file/end |
| offset | Optional nonnegative byte offset; omission reads the last page of the selection |
| limit | Optional page size, 4–262,144 bytes; default 65,536 |

The response includes selection, sourceId, requestedOffset, actual offset,
nextOffset, endOffset, current totalBytes, appendedBytes, hasPrevious, hasNext,
decoded text, returned byte count and original download filename. Offsets are
zero-based and their end is exclusive. A UTF-8 edge can make a page up to six
bytes longer than its requested size.

The method **applicationsOutputDownload({ applicationId, operationId, selection })**
returns stream, close, exact selected bytes, original identities and filename.
Consume it with Node's stream pipeline and call close in a finally block.
A prepared but unused stream should be destroyed and closed. Reading uses
bounded chunks and rechecks the selected original source before successful
completion.

The authenticated HTTP interfaces are:

- **GET /api/applications/output-page** with those original query fields.
- **POST /api/applications/output-download** with the original IDs and optional
  selection; its response supplies a single-use download URL.
- The existing **/api/applications/output** and **/api/applications/terminal**
  retain their original contracts for current clients.

Unknown or duplicate query fields, invalid ranges and mismatched operation
selection are rejected. The new readers use the existing saved run mapping;
they do not accept a caller-supplied path.

## CLI and complete private file receiving

Use the retained IDs from **application-history**:

~~~sh
starforge runtime-workspace application-output-page \
  --workspace /srv/starforge/runtime-workspace \
  --application-id ORIGINAL_APPLICATION_ID \
  --operation-id ORIGINAL_OPERATION_ID \
  --offset 0

starforge runtime-workspace application-output-page \
  --workspace /srv/starforge/runtime-workspace \
  --application-id ORIGINAL_APPLICATION_ID \
  --operation-id ORIGINAL_OPERATION_ID \
  --selection ORIGINAL_RETURNED_SELECTION \
  --offset ORIGINAL_RETURNED_NEXT_OFFSET

starforge runtime-workspace application-output-export \
  --workspace /srv/starforge/runtime-workspace \
  --application-id ORIGINAL_APPLICATION_ID \
  --operation-id ORIGINAL_OPERATION_ID \
  --selection ORIGINAL_RETURNED_SELECTION \
  --output /srv/starforge/receiving/original-operation.log
~~~

The export streams to a new private file, retains every original byte, and
returns its byte count and SHA-256 with the Application, operation and source
selection. It creates the destination exclusively and does not replace an
existing operator file. Its temporary file is cleaned up after completion or
failure. Omit **--selection** to deliberately select the current complete range.

The maintained distribution includes this reader, browser component and
guide through its original Runtime workspace source component. Both
Applications and Launch Groups use the same reader and original operation
state.
