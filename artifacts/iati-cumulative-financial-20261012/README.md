# Complete cumulative IATI application source

This complete edition combines the original Results and programme workspace, organisation planning, publisher refresh, financial reconciliation and the already merged AMP commissioning application. Its source selection is `3bbeeb3cef95dd159343ec298b5595ffa4e970dd1606469ed03f5152f475d873`.

The immutable input lineage retains Results author commit `7f010cbc26344f840c8b864ea59edbabec5d02d5`, financial author commit `ae8a650025f6e9ec53275751aa36d7770d58b25f`, merged AMP source `c3aa292f1b60db1473c11a43a844d02ec5ac759a`, the original Results transfer correction `ad07e749861424e732440d0af11f985b657a5f2c`, and the complete receiving and transport corrections. Every selected byte is bound by the full member inventory. The original owner branches and current main are preserved in the cumulative commit history.

## Exact source

| Item | Complete identity |
| --- | --- |
| Source and public inputs | 203 members; 4,510,505 bytes |
| UTF-8 source | 201 files; 3,846,277 bytes |
| Original binary inputs | 2 files; 664,228 bytes |
| Native and Applications source declarations | The same 167 names |
| Complete gzip | 1539216 bytes; SHA256 `2ee3332f9e254d40076fad1a0f5bd8dc8c5c3f3286383d64296c830183f1b952` |
| Decoded JSON | 4952476 bytes; SHA256 `600a4ad86a698d68e0ee3f582dfef1fd0ae008e12a37f2f91d393c4c698ed3be` |
| Exact packet commit | `9bfca6df8ebbd8e6c4583557df1978accd015a23` |

The schema is `stellar-forge.iati-results-complete-source.v2`. Each `files[]` entry has its path, complete content, byte count and SHA256. The two binary members use `encoding: "base64"`. `sourceCommit` remains null; `sourceSelectionSha256`, the retained original source identities and the complete inventory identify this composed source edition.

## Materialize this edition

Use the existing Python and Node executables with the supplied maintained installer:

```sh
python3 -B prepare_source.py \
  --root /absolute/private/iati-source-3bbeeb3c \
  --packet-file /absolute/complete-source.json.gz \
  --node /absolute/existing/node
```

The exact files are materialized beneath the returned `source` directory. The original create-only publisher accepts an already present identical file and rejects different bytes. It verifies the complete input envelope and every member, then parses the selected Python and JavaScript. It neither installs a replacement engine nor creates a receiving case.

Use a new source-preparation destination for this following source edition. Keep the existing native case and its request identities. If the accepting runtime uses private `/dev` storage, perform source installation, the operation and durable output retention within the same accepting process; a later process may have a different mount.

## Continue the original workflows

The financial programme is `stellar/scf-starforge-20261009/sf30-seller-sdk/iati/reconciliation_receiving.py`, 83109 bytes, SHA256 `959c74abf9734944b4bc30c60a49bc757fae071c349c5b2ce4113fcd9505b8bb`. Its complete matched guide is `RECONCILIATION_RECEIVING.md`, 17584 bytes, SHA256 `cd8a34d06cee78b0591c9eb6e8b98c0ffd30480549410276b1f95e617a2c0feb`.

Set the IATI directory to the materialized `stellar/scf-starforge-20261009/sf30-seller-sdk/iati` path. The original financial continuation uses:

- `--organisation-source` with `examples/fcdo-organisation-2026/organisation.xml`.
- `--organisation-acquisition` with its adjacent `publisher-receipt.json`.
- `--activity-source` with `examples/fcdo-wadi-2026/FCDO-set-20.xml.gz`.
- `--activity-receipt` with its adjacent `publisher-receipt.json`.
- `--output` with the same original private case directory.
- `--mcp-directory` with the materialized `stellar-forge/mcp-merchant-operator` directory.
- The original explicit actor and existing Node, Playwright and Chromium selections.

The original financial programme supports a following installed source edition while retaining its assessed organisation, four-quarter selection, five financial revisions and request history. Its full guide governs the actual continuation.

The complete organisation XML remains 99,013 bytes/SHA256 `c18e63db2d543eaeb5525a4df21cd16561f0316dab831789bfdd176e1accdfce`. The full activity gzip remains 647,227 bytes/SHA256 `4df991d0ce8bbcc2ff44d0c71644f9f6fb2f4b10c9edd037294d146634433645`. The retained SNV ZIP remains 17,001 bytes/SHA256 `1ef7186ef080158ab15c0815ae1c18107cea7d981d0567a069912a7fa5935b9d`. Their original complete acquisition/provenance records are included.

Use the maintained `results/delivery/PREPARING.md` for the original SNV operation and `AMP.md`, `amp/DESTINATION.md` and `receiving/AMP.md` for the original AMP commissioning operation. The original native engines, sender ownership and existing receiving operations remain authoritative.

## Complete retrieval through text-only connectors

The same exact gzip is also available in 5 ASCII base64 parts, each below the provider's inline file limit. Fetch every complete part at the same immutable packet commit before decoding.

| File | ASCII bytes | SHA256 |
| --- | ---: | --- |
| complete-source.base64.part01 | 500000 | `a0feda340025727974eb3c78b6f2a0cc1a22c41b36691b2635e02428455a0fac` |
| complete-source.base64.part02 | 500000 | `e1a978bb5dd33bc73579683f7235c70c1cf04b5c815ca9211df111c5a79bf240` |
| complete-source.base64.part03 | 500000 | `55fdc0a1a3db4c32950fe628bf2836bc6b5b6ef316bcff2b423d80707229e2c9` |
| complete-source.base64.part04 | 500000 | `eb2d20f33a7d673063f3e4a8001230e39caf9547c24a5e2fef1b98dd39ef58c8` |
| complete-source.base64.part05 | 52288 | `969e99f83a39d106956c46264b5a55476192e266df3c2170f0e1f544137054a4` |

Join the complete ASCII bodies in numeric order, base64-decode once, then verify the full gzip size/SHA above. Inflate once and verify the whole decoded JSON. These transport files preserve the original source packet exactly.

```python
import base64, hashlib
from pathlib import Path

parts = [Path('complete-source.base64.part%02d' % n).read_bytes()
         for n in range(1, 6)]
packed = base64.b64decode(b''.join(parts), validate=True)
assert len(packed) == 1539216
assert hashlib.sha256(packed).hexdigest() == '2ee3332f9e254d40076fad1a0f5bd8dc8c5c3f3286383d64296c830183f1b952'
```

Retain the verified bytes through the original complete-file publisher before passing the resulting file to the installer.

## Following cumulative source corrections

This edition preserves the original Results, organisation, refresh and financial engines while adding the already merged AMP commissioning hooks and their complete native destination source. Both explicit source declarations contain the same 167 names. The native packet dispatcher, Merchant exports, HTTP routes, typed client and browser retain all five workflows.

The selected financial receiving programme reads ordinary installed source through its original `digest_file` and includes the actual subprocess return code in a failed continuation receipt. The selected private HTTP client uses the maintained Node HTTP carrier with a byte-counted Readable queue, preserving the original Request/Response APIs, body lengths, cancellation and timeouts. The historical financial comparison types and Merchant preflight remain the current original author's complete corrections.

The Results transfer is the original owner's legacy-compatible complete postimage `bb11009027ad4eca01fca30998a1718775951fb8` from commit `ad07e749861424e732440d0af11f985b657a5f2c`. It reconstructs the original exporter report basis from validated projections when reopening the retained ZIP. The original `report.py` stays unchanged; old report bytes are preserved.

Source preparation, a native operation result and a durable customer handover are separate receipts. This source capsule contains original application code and public publisher inputs, without an executed private customer workspace or an assertion that every native receiving phase has completed.
