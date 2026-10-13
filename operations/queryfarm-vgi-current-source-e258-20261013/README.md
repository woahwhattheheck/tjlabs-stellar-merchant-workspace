# Complete Query.Farm receiving source

This is the complete source edition for the existing `QUERY-FARM-VGI-RECEIVING-20261012-F3BE` operation. The application and receiving programmes are selected from public Merchant commit **830fb6b6111faadf69d60ddcf350713960133c09**. The selected source follows the maintained `VGI_RECEIVING.md` contract: every regular file under the original Python project, its original Python runtime engine and the repository license.

The integrated product is published in PR1936; PR1940 preserves the original browser origin across receiving interruptions. This source archive selects the actual PR1940 merge, retaining the complete integrated application.

The complete source ZIP contains **373 files / 7626840 uncompressed bytes**. It preserves original repository-relative paths, Git blob identities and executable modes. This packet contains generic software source; the original C271 data archive is received separately through its existing private owner.

## Exact files

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| VGI_Source.zip | 2542442 | `0703e89a4c7609451a45d8f98fc35e5c17dfb324d9199dbcd0ec5b6556fe22ea` |
| SOURCE_SELECTION.json | 119810 | `ee44f1dc8ce8f3f2c453272925bfc4e356a8847cc033d55ed36040da4e5cbc02` |

`SOURCE_SELECTION.json` enumerates every selected file with its Git blob, byte count, mode and SHA-256. `source-package.json` describes the source selection and the original receiving input; it does not assert a runtime or browser result.

The source ZIP has been created and independently read back against all selected original members. Native cohort installation and actual application/browser receiving remain the existing operation's next stage.

## Materialize this immutable source

Download the ZIP and manifest from the same exact source packet. Keep their original names. Use a new source directory outside the existing private operation directory. The following standard-library command verifies the entire archive, manifest and every original Git blob before writing any source. It restores executable bits and refuses an existing destination.

```bash
python3 - VGI_Source.zip SOURCE_SELECTION.json /ACTUAL/complete-vgi-source <<'PY'
import hashlib, json, os, pathlib, stat, sys, zipfile
archive, manifest_path, target = map(pathlib.Path, sys.argv[1:])
assert hashlib.sha256(archive.read_bytes()).hexdigest() == "0703e89a4c7609451a45d8f98fc35e5c17dfb324d9199dbcd0ec5b6556fe22ea", "Source archive changed"
assert hashlib.sha256(manifest_path.read_bytes()).hexdigest() == "ee44f1dc8ce8f3f2c453272925bfc4e356a8847cc033d55ed36040da4e5cbc02", "Source manifest changed"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
assert manifest["source_ref"] == "830fb6b6111faadf69d60ddcf350713960133c09"
assert not target.exists() and not target.is_symlink(), "Choose a new immutable source directory"
expected = {item["path"]: item for item in manifest["files"]}
assert len(expected) == len(manifest["files"])
with zipfile.ZipFile(archive) as source:
    members = source.infolist()
    assert len(members) == len(expected) and {x.filename for x in members} == set(expected)
    checked = []
    for item in members:
        path = pathlib.PurePosixPath(item.filename)
        assert not path.is_absolute() and str(path) == item.filename
        assert all(p not in ("", ".", "..") for p in path.parts)
        mode = item.external_attr >> 16
        assert stat.S_ISREG(mode)
        raw = source.read(item)
        record = expected[item.filename]
        assert len(raw) == record["bytes"]
        assert hashlib.sha256(raw).hexdigest() == record["sha256"]
        assert hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest() == record["git_blob"]
        assert format(mode, "o") == record["mode"]
        checked.append((path, raw, mode))
    target.mkdir(parents=True)
    for path, raw, mode in checked:
        output = target.joinpath(*path.parts)
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open("xb") as stream:
            stream.write(raw)
        output.chmod(mode & 0o777)
print(json.dumps({"source_ref": manifest["source_ref"], "source_root": str(target.resolve()),
                  "files": len(checked), "source_archive_sha256": "0703e89a4c7609451a45d8f98fc35e5c17dfb324d9199dbcd0ec5b6556fe22ea"}))
PY
```

If materialization is interrupted, keep or remove only that unfinished new source directory and repeat into a new directory. No runtime, warehouse, request journal or previous operation result is modified by this extraction. Keep the selected source directory unchanged after materialization; the original driver verifies it again.

## Continue the original installed operation

Coordinate with the existing C271/F3BE receiving owner before dispatch. Use the same original private operation root and the exact original data input:

- Input: `receiving.zip`, **227,992 bytes**.
- SHA-256: `2da55e7d4399ab96a530451c99b75b64472f0041b690e862650bc60a1f4a42ac`.
- The input is not inside this public software archive.
- Python must be **3.13 or newer**. Select the actual existing Node, Playwright module and Chromium executable on the receiving host.
- The maintained engine resolves the original `duckdb,vgi` extras and installs the exact retained wheel cohort. Source packaging is not a claim that those runtime dependencies are already installed.

Set actual host paths once. Keep the operation root and selected source/input paths stable for continuation:

```bash
VGI_SOURCE=/ACTUAL/complete-vgi-source
VGI_PACKET=/ACTUAL/downloaded-source-packet
VGI_OPERATION=/ACTUAL/original-private-vgi-receiving
VGI_INPUT=/ACTUAL/original/receiving.zip
VGI_PYTHON313=/ACTUAL/python3.13
VGI_NODE=/ACTUAL/node
VGI_PLAYWRIGHT=/ACTUAL/playwright/index.mjs
VGI_CHROMIUM=/ACTUAL/chromium
VGI_PYTHON_SOURCE="$VGI_SOURCE/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python"

"$VGI_PYTHON313" -B "$VGI_PYTHON_SOURCE/receiving/vgi_service.py" \
  --directory "$VGI_OPERATION" \
  --source-root "$VGI_SOURCE" \
  --source "$VGI_PYTHON_SOURCE" \
  --engine "$VGI_SOURCE/stellar/scf-starforge-20261009/distribution/python-runtime/engine.py" \
  --source-archive "$VGI_PACKET/VGI_Source.zip" \
  --source-manifest "$VGI_PACKET/SOURCE_SELECTION.json" \
  --input "$VGI_INPUT" \
  --python313 "$VGI_PYTHON313" \
  --node "$VGI_NODE" \
  --playwright "$VGI_PLAYWRIGHT" \
  --chromium "$VGI_CHROMIUM" \
  --browser-driver "$VGI_PYTHON_SOURCE/receiving/vgi_service_browser.mjs" \
  --source-ref 830fb6b6111faadf69d60ddcf350713960133c09 \
  --source-sha256 0703e89a4c7609451a45d8f98fc35e5c17dfb324d9199dbcd0ec5b6556fe22ea \
  --source-successor
```

The explicit successor retains the original outer `receiving.lock`. The current edition has its own immutable source selection, adoption record, runtime, warehouse and phase receipts beneath `source-editions/<commit>-<archive-prefix>/`; earlier source/results remain intact. Resume the same command after the original owner reconciles the previous process. Do not start a second receiver.

Within this current edition, `private/operator-origin.json` is retained before the browser starts. Continuation reuses that exact loopback port; a port collision requires reconciliation of the existing process and does not select a new origin. Keep the origin record, browser profile, working-copy journal and phase receipts together. Do not copy an earlier source edition's profile or partial journal into this new edition. The source-successor directory preserves its own exact source identity while the older edition remains intact.

## Receive and inspect the complete result

Follow the current original `VGI_RECEIVING.md`, the acquired-result `RESULT_WORKFLOW.md` and the SQL recipient `CLIENT_HANDOVER.md` carried in this exact source. The full course uses the original 32-row C271 result and operates the application, current-source query workflow, existing VGI listener, original SQL client and complete exported handovers.

Preserve the original phase/result receipts, complete working copies and request history, selected source and wheel identities, native SQL outputs, source/warehouse handovers and every actual browser download. Reopen the complete exported files with the original application/client and retain their actual verification results.

The producing and receiving seats must actually open the outgoing pages, view the saved desktop and narrow screenshots, operate important controls and export/reopen the real files. Preserve user tabs and state on a shared local browser. A source review or a generated screenshot path is not visual completion.

This internal engineering handoff does not authorize a customer send or a contract signature. Bryce reads and personally signs contracts/confidentiality agreements; ordinary authorized account setup remains separate. TJLabs attribution stays present in delivered material. Existing relationship and exact-message approval rules remain with the original company owner.


## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949
