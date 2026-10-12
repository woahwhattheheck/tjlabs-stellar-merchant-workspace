# Following document observation: complete worker delivery

This delivery contains the complete pinned source and the closed, completed FCDO document-evidence case. The original receiving request is **1791846411.846109** in the existing SCF distribution thread. Execute only after explicitly accepting that original request and receiving execution custody from A5F3. One worker owns the following observation.

## Exact inputs

- Original operation: `iati-document-evidence-original-ods-20261012`.
- Following operation: `iati-document-evidence-original-ods-20261012-following-observation-1`.
- Original case checkpoint: **80 members**, **5,691,214 bytes**, SHA-256 `761879ea87397c3f9f4a647b72b1f9cc2966a5de4d8f90e76cd3c9025a4ed94f`. Native, SDK, Merchant and browser stages are complete.
- Complete following source: **229 files**, **5,169,868 bytes**, selection SHA-256 `2aca428ed4e35e99e73595d66dd8202961ac504512f118ac7a2221fb58b4689c`.
- The source is the accepted original 226-file runtime plus the reviewed eight-file following join. Both maintained runtime declarations contain the same 189 paths.
- Following source is published at Merchant commit `3d86d3e30917aad9c34a27718b4bbbc540933334` (PR778). The package uses its declared frozen closure, not a moving repository checkout.

The original recipient is plan `97a0a60458635f96c79b18f00dc871245aa2e7f2b0dc5582e766efcd985d250a`, revision **6**, record SHA-256 `c065be976009292b8c9d22a47439499b8d6b0a4c9eecdab9f399f90452e13dbc`.

The single selected literal URL is:

`https://www.gov.uk/government/publications/fcdo-annual-report-and-accounts-2024-to-2025`

This is the published landing page. Capture its complete response through the original fetcher. Linked attachments are not selected by this operation. Keep the original failed/refused observations, the second row's URL correction, all named decisions and the recipient's note.

## Prepare without making a request

Use an existing permitted-network Linux/POSIX worker with Python 3.11 or newer and lxml available. This programme uses the supplied original Python source; it does not install a second document engine. No browser or Node runtime is needed for the native-only stage.

Unpack this outer delivery into a private input directory. Verify its full archive SHA-256 against the delivery receipt before extraction. The outer ZIP contains only regular relative file members and the complete nested closed checkpoint.

From that input directory:

```bash
python3 -B prepare_worker.py verify
python3 -B prepare_worker.py prepare --directory /absolute/private/document-following-work
```

The helper verifies all 229 source members and the exact nested checkpoint before preparing a separate work directory. It preserves original file permissions for the saved private case. It changes only the physical `caseDirectory` in the new following runtime configuration. All operation, source, URL, base revision, request, actor and review fields stay exact.

Preparation returns `configuration`, `command` and `shellCommand`. It makes **zero public requests**. Repeating preparation after its recorded success verifies the existing source/configuration and returns the same command; it never recopies the old checkpoint over an advanced case.

## Execute the one accepted observation

Run the exact returned `command` once under the accepted original worker ownership. Its form is:

```bash
python3 -B /absolute/private/document-following-work/source/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/document_evidence/following_observation.py \
  --config /absolute/private/document-following-work/following-input-<sha256>.json
```

The native programme continues the existing recipient from revision 6. It retains the exact observation request before contacting the selected public URL. A complete nonempty body is required. It carries the full prior decision set into a named deferred review, exports the new complete packet under this installed source edition, independently receives it, adds the following recipient note, and reopens the full body and original history.

The unchanged public fetcher applies the saved 16 MiB body bound, 30-second total deadline, 10-second connection deadline and five-redirect limit. Preserve actual provider/network errors. Do not override DNS, bypass network controls, retry through another address or account, substitute a browser download, or fetch linked URLs automatically.

A successful native continuation records sender revision 8 and independent recipient revision 9. An unreachable, refused or incomplete response remains a terminal observation in the same case. Return that exact closed case and result; do not invent another observation ID or a new case. Reopening the same command recovers the recorded original request.

## Return the complete closed work

After the original command exits and any connected servers are closed:

```bash
python3 -B prepare_worker.py seal-return \
  --directory /absolute/private/document-following-work \
  --out /absolute/private/document-following-return.zip
```

This acquires the original case lock, retains the whole case and exact source, hashes every member, and verifies the complete archive. It retains both successful and interrupted native outcomes. The receipt's state explicitly describes native completion; nativeState and connectedState are separate. NO_COMPLETE_RESULT records the absence of a complete phase result without claiming that no attempt occurred. It excludes only ephemeral console files, the case lock and internal browser screenshots; browser proof JSON remains.

Return the archive and the emitted SHA-256/byte-count receipt through the original accepted worker thread/custody route. Keep the original package and work directory until receipt is confirmed. Do not publish the editable case archive to GitHub or a public download.

The original receiving workspace and any following files travel together. A5F3 retains the verified Node and genuine headless Chrome runtime for the subsequent SDK/Merchant/browser stage if the receiving worker only runs Python.

## Optional complete connected stage

If the accepted worker already has the maintained Node, Playwright and browser runtime, the same original command accepts:

```text
--connected
--node /absolute/node
--mcp-directory /absolute/private/document-following-work/source/stellar-forge/mcp-merchant-operator
--playwright-module /absolute/playwright/index.mjs
--chromium /absolute/chrome-headless-shell
```

Provide both browser arguments together, or omit both for SDK/Merchant without browser. Do not acquire another browser runtime merely for this delivery. Keep the complete same source between native export and connected receiving.

The full source guide is `source/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/document_evidence/FOLLOWING.md`. The customer/operator guide is `source/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/DOCUMENT_EVIDENCE.md`.

Original public result JSON and their interpretation are published in the same repository under `iati/examples/fcdo-organisation-2026/document-evidence-native-result.json`, `document-evidence-connected-result.json` and `DOCUMENT_EVIDENCE_RESULTS.md`. Those historical records describe the completed original case; they do not claim this following observation has already run.
