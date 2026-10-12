# Original NEED county-report production

Operation: `NEED-REGIONAL-REPORTS-9B2C-20261012`.

This is the complete native handoff for the maintained county reporting product merged in PR #544 and the original archive continuation repair merged in PR #657. The source packet contains all 156 source and runtime asset files used by the original collector, report producer and browser receiving journey. It includes the complete retained CPI public table.

## Exact source

| Item | Bytes | SHA256 | Git blob |
| --- | ---: | --- | --- |
| source-packet.json | 2158543 | d392e198af16678277b4cfe71c96cdf26a61652f42bcbe7de96980541c687ec5 | afad6d2d88f7999a176ad5afafe33f426b63ed7f |
| run_native.py | 17839 | 6ca848ae03f5e83c513495f2aaef5083eb7bb63cadb1ebe096c7e37e9d35a04d | f62514c62dc785c3dabded2b3faf5f79de2b6741 |

The complete source inventory is 2074176 bytes. The packet identifies every member by full path, length, SHA256 and Git blob SHA1. The maintained product base is `0b005caa01350f7763a1905dcec9ce9edd45d781`; its collector is the exact `16a2d220c77bbe8fd53c77168201cff80b8d0621` source postimage from `f886c97dbd4187ea70c543c43a03631a44ab0adb`, merged as `430f3cde4ed4c0c543d555e256a9dff8f29dab5e`.

## Continue the original operation

Coordinate acceptance in the existing NEED thread before starting:
https://tokenjunkielabs.slack.com/archives/C0BTTA66TK3/p1791827742861299

Use the original retained intake directory when one is already present. The original Python collector validates its source manifest and every saved complete member, then resumes the missing annual members under its existing source lock. The controller holds an additional operation lock inherited by each original child process.

The original partial intake is already preserved as `qcew-original-naics-intake-partial-20261012.zip`: 72,928 bytes, SHA256 `cc20a8855245c0fd00594b9379315475c404c7b1bbf627952f38a5eec667b708`; Library file `libfile_7af91f895c708191b9702d2016ac3862`, native file `file_000000002518820e9a573da25ccb3c83`. It contains the complete original San Francisco 2025 Q4 seed and its source manifest. The controller also pins the original seed SHA256 `a9cdafc2b51bd8571149ef7abd3d628f88713a5195c7a5099111393e012f21b9`.

The native host needs Python 3 with its standard library, Node 22.16 or newer, the existing Chromium executable, Playwright module and `pdfinfo`. The producer receives the actual installed paths. Read the complete public source files from their raw Git URLs or retrieve their full Git blobs, then run:

```bash
python3 run_native.py \
  --packet source-packet.json \
  --packet-sha256 d392e198af16678277b4cfe71c96cdf26a61652f42bcbe7de96980541c687ec5 \
  --directory /dev/needecon-qcew-9b2c-20261012 \
  --intake-directory /absolute/original/qcew-intake \
  --node /absolute/installed/node \
  --chromium /absolute/installed/chromium \
  --playwright-module /absolute/installed/playwright/index.js \
  --pdfinfo /absolute/installed/pdfinfo \
  --archive-directory /absolute/owned/private/qcew-artifacts
```

Choose private, owned directories for the operation and archive. The controller creates a private sibling archive directory when `--archive-directory` is omitted. Select `--original-project /absolute/complete-project.json` to commission within an existing complete FRED project. Select `--profile /absolute/profile.json` to use the original agreed county, region, industry, baseline and price conventions. Those inputs retain their original project/API semantics.

A host may use `--prepare-only` to materialize and verify the complete source before its already accepted run. The default command performs the whole operation.

## The complete native programme

The controller invokes the maintained entrypoints in order:

1. `fred/qcew/source_fetch.py` retrieves original annual NAICS quarterly area members for 1990–2026, covering the original nine Bay Area counties, California and the United States. It retains response, archive, CRC, original member and complete gzip checks.
2. `fred/qcew/native-journey.mjs` admits the original source once, saves the reusable profile, produces the complete 2025 Q4 and 2026 Q1 successor reports, checks original request replay, renders the actual PDFs, exports the whole project, receives it independently and reopens original source and report bytes.
3. `fred/qcew/workspace-journey.mjs` opens both actual reports in the maintained browser workspace, downloads every original report member, exercises regional pagination and original CSV downloads, exports the full project, receives it through the UI while withholding the original response, then recovers that receiving result at a new server origin and in a new browser profile.

The resulting source and received projects stay under the original native directory. The source collector and both maintained programmes preserve their own original operation journals.

## Complete outputs

The controller streams each original programme’s output and retains the full logs. It creates a ZIP containing the complete source packet and materialized files, source intake, native and browser projects, reports, original CSVs, HTML, PDFs, screenshots, downloads, original journals and all command output. The ZIP includes a complete member manifest with byte lengths and SHA256 values.

The final `qcew_native_delivered` JSON gives the actual archive path, bytes, SHA256, Git blob SHA1 and member count. Interrupted programmes retain the complete available original workspace in the same form, so the existing source operation can continue from its original intake.

Save the actual ZIP through the existing artifact delivery route before releasing a transient native host. Return the complete final JSON and artifact identifier in the original NEED thread. Keep the source/receiver projects and original operation identity together for the subsequent paid report commissioning.
