# Reopen complete archives through durable chunks

The ordinary ZIP range reader reopens the actual ZIP bytes emitted by the maintained
writer. It reads a bounded central directory, then processes the local records in
their original order. Every local header, name, compressed payload, CRC, expanded
length and SHA-256 is checked. The ordered whole ZIP SHA-256 is calculated in that
same member pass by appending the retained central directory and end record last.

No complete ZIP or complete expanded archive is allocated. By default the reader
retains member metadata, up to 32 MiB of central-directory bytes, 64 KiB inflater
output chunks, and explicitly selected captured members up to 16 MiB each. The
chunk adapter retains at most two decoded parts. Initial directory lookahead may
fetch those parts again when the member pass reaches them; it does not require a
second full provider pass.

## JavaScript

Use `readZipRanges({bytes, async read(offset,length)}, options)` for ordinary ZIPs.
The range callback must return exactly the requested `Uint8Array`. The returned
receipt contains every member's name, mode, size, compression method, CRC and SHA,
plus the exact complete archive size and SHA.

Use `createStreamedArchiveSource(manifest, async readPart(part,index))` for the
publisher's `commons.streamed-archive-storage.v1` manifest. The callback returns
the original canonical base64 text. It may fetch the exact Git blob or immutable
path/head supplied in the part/provenance metadata; this module does not choose a
network provider. Every fetched part's original text bytes/SHA, canonical base64,
and decoded bytes/SHA are checked before any bytes are returned.

Use `readCompleteExportRanges(source, options)` to additionally reopen
`EXPORT_MANIFEST.json` and compare every other member's exact path, size and SHA
against that original inventory. Supply `expectedSha256: manifest.sha256` to bind
the complete archive receipt to the publisher's output.

`visitEntry(record)` is awaited. It receives metadata and, only for selected
`captureEntry(record) === true` members, their original `data` bytes. The complete
export wrapper also captures the export manifest. Visitors should retain tentative
results until the function returns: a later member or the final archive SHA can
still fail.

The supported dialect is the same strict ordinary classic ZIP emitted by
`connected_zip.cjs`: UTF-8 relative file paths, STORE or raw DEFLATE, Unix regular
file modes, contiguous local entries, exact central/local agreement, one disk, no
extra fields, comments, descriptors, trailing data or ZIP64. The reader rejects
normalized case collisions and paths that are also parent files.

Set capacities explicitly for the real workload. Limits are bounded by classic
ZIP fields: archive up to 0xffffffff bytes, 65535 members, expanded bytes up to
0x7fffffff. The defaults remain 128 MiB compressed/expanded and 2000 members.

## Native receiving

After retaining the publisher's manifest and its `objects/` directory together:

```sh
node read-streamed-archive.mjs /path/to/archive/manifest.json /path/to/new-result.json
```

The CLI verifies all chunks, every member, the original export manifest and the
complete ZIP SHA. An optional result file is created exclusively and includes all
member identities. It prints a compact final receipt. Use the existing publisher
and assembly tool for transport; this reader supplies independent ordinary ZIP
readback.

## Executable course

`verifyOrdinaryZipRange(files, workingHtml)` in
`verify-ordinary-zip-range.cjs` accepts the actual complete application source bank
and its actual generated working HTML. It packs them with the maintained ordinary
writer, compares every reopened member against production `readZip`, and checks
Unicode/binary/empty captures and focused malformed layout, UTF-8, path collision,
capacity, trailing DEFLATE, chunk mutation and archive-identity cases.
