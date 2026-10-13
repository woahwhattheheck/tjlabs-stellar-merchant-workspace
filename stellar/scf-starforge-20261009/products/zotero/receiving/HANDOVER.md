# Complete Zotero and Research customer packaging

This directory maintains the standard-library launcher and complete handover
builder used for the original OSF customer edition. The launcher receives a
retained full native export with its exact selected SDK and opens the shared
Research operator with its Zotero bridge. Python 3.12 or later and Node.js
22.16 or later are required. The selected operator has no npm dependencies.

`START_HERE.md` describes the exercised 5,503-item OSF library, 1,254-item
project and original revision-5 Research dossier. Its selected SDK source is
`25763fb747c0175889e3b25df9704849cd262736`, published by PR942. The packaging
code can be used with another complete retained edition by supplying its
actual `HANDOVER.json`, byte-identical SDK/export and complete reports.

## Assemble an original completed edition

Run from this maintained source directory, using the actual retained files:

```sh
python3 build-handover.py \
  --edition /absolute/retained/HANDOVER.json \
  --sdk /absolute/retained/Original_Zotero_Research_SDK.tgz \
  --workspace /absolute/retained/complete-native-workspace.json \
  --reports /absolute/retained/reports \
  --operation /absolute/retained/operation \
  --guide /absolute/retained/START_HERE.md \
  --directory /absolute/new-complete-handover \
  --archive /absolute/new-complete-handover.zip
```

Use `--compressed /absolute/retained/Complete_Original_Workspace.json.xz`
to reuse a completed lossless packet. The builder verifies the selected SDK
archive, original source pin, recipe and source-file count; verifies the full
original export's exact length and SHA-256; and checks the entire decompressed
packet against that same original export. It preserves all SDK and data bytes.
New compression uses lossless XZ with CRC64 and a 128 MiB dictionary. Receiving
also accepts retained gzip editions. Allow memory for the original 258.8 MB
workspace; the launcher gives Node a 4 GiB heap.

The complete ZIP includes the original SDK and full compressed workspace,
all five customer reports, completed text operation outcomes, both maintained
Python tools, customer instructions and exact file inventory. New output paths
prevent accidental replacement of an earlier retained delivery. Internal
browser QA images are separate from the text operation outcomes.

## Receive and open

Extract the complete ZIP, then run:

```sh
python3 START_HERE.py --directory /absolute/private/osf-operator --serve
```

The launcher verifies compressed and original packet bytes, extracts the
unchanged selected SDK and invokes its native receiver with the edition's
saved request ID. It writes the current local connection to
`/absolute/private/osf-operator/operator-connection.json`. Open that connection's
`url` locally. Use the same receiving directory to resume the same operation;
use a separate private directory for each independent recipient. Ctrl-C
closes the owned original server. Omit `--serve` to receive without starting
the foreground operator.
