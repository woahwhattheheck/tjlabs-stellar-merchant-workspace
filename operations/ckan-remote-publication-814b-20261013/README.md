# Complete remote CKAN publication journey

Operation: `CKAN-REMOTE-PUBLICATION-814B-20261013`.

This is the complete operator continuation for the remote catalogue workflow merged in [PR1320](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/1320), commit `6cca3bf0d102d347581aba3a2fb510a2bc631254`. The command receives the original source cohort and full selected Zürich captures, operates the maintained workbench, and retains the complete result and received project in the accepting host's chosen private directory.

## Receive and operate

Use Python 3.11 or later, the original installed Node 24 dependency environment, and Playwright/Chromium for the browser phase. Reuse the installed dependency directory through the command's symlink; no dependency-tree copy is made.

The original `Liip_Zurich_Source_Captures.tar.gz` is version 0, 434,557 bytes, SHA-256 `b093a0a66b12830f7daf507980b77a9f6f692e22dcf44cd195ef2e599998979c`. It contains the complete 3,821-row and 4,389-row selected daily captures. Receive that existing source from the original C271 operation before invoking the command.

```sh
python3 run-native.py \
  --capture /absolute/Liip_Zurich_Source_Captures.tar.gz \
  --work-directory /absolute/new-private-directory \
  --node /absolute/existing/node \
  --node-modules /absolute/existing/node_modules \
  --browser /absolute/existing/chromium
```

The complete Python entrypoint embeds the original Node journey and runtime receiver. It downloads the pinned original 175-file source packet, verifies its complete SHA-256 and byte count, and composes 17 exact merged source overrides. Every override is checked against its Git blob identity. The resulting cohort has 186 source files. The source fetches are public immutable URLs; the capture's exact bytes and hash are checked before operating.

Select a new private work directory on the accepting host. The command preserves an existing operation directory by refusing to overwrite it. Existing installed runtime locations can also come from `CODEX_PRIMARY_RUNTIME_NODE` and `CODEX_PRIMARY_RUNTIME_NODE_MODULES`. Pass the host’s installed Chromium path with `--browser` or `CKAN_REMOTE_BROWSER_EXECUTABLE` when it is outside Playwright’s default cache. The receiver verifies that selected path is an existing executable. The earlier accepting host used `/workspace/scratch/5403360e55a4/counterpress-capture-runtime/bin/chromium`; reuse that path only on a host where it exists.

## Whole journey

The target is an isolated local HTTP implementation of the CKAN 2.11 Action contract, with server-assigned package IDs, retained resource UUIDs, actual request/response bytes, and an intentionally closed response after resource creation commits. The report identifies that target explicitly.

The one journey imports both complete original captures, saves reviewed source selections, prepares and approves a package/resource mapping, publishes it, cold-reopens after the lost response, and reconciles the same original resource without another create. After actually confirming the first creation, it deletes that resource in the isolated target and reconciles twice while it is absent. The retained confirmation must stay a conflict, including after the original target bytes are restored; the old approval cannot recreate it. A newly reviewed following edition patches that restored resource, and a further independent target change is retained as a conflict without overwrite. Exact large integer, decimal and signed-zero metadata are preserved.

It also operates the original browser and authenticated local server when the installed browser is available, and then creates, receives and cold-reopens the full workspace archive. Every retained plan and response download is read through the maintained API. Provider HTML rate responses and credential reflection are exercised through the same target adapter. Opening and receiving the retained project are observed separately from provider requests.

The controller prints the complete result, returns the actual programme status and retains `remote-publication-result.json`, the original operated project, complete archive and received project under the chosen directory. The browser result states whether its installed runtime operated successfully or was unavailable. A browser error after successful launch fails the journey.

## Original ownership

Coordinate acceptance and any recovery in the [original C271 thread](https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791877965655399?thread_ts=1791755739.292459). The 814B SCF owner retains the one product continuation until an actual accepting operator takes it. Preserve its original operation ID, source captures, returned host/control locator and full result when reporting findings.

The product's complete [operating guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/REMOTE_PUBLICATION.md) describes actual target configuration, review, publication, reconciliation and workspace receiving.
