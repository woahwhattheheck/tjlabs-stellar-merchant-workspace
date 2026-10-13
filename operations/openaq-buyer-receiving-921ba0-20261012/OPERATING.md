# Complete OpenAQ Buyer receiving programme

This operation uses the original historical Del Norte study and the selected product at `c7ac4399e3bb419fafd42395841bace7d089036a`. It completes reviewed source intake, publication, a retained release handoff, the original SF88 Dataset acquisition, native accounting, SF100 output, and independent receiving.

## Open the original operation

Keep `receive.py`, `native-journey.mjs`, `source-inputs.json`, `source-manifest.json`, `source-stream.jsonl`, `source-assets.json`, `source-unpaid-repairs.json` and `source-operator.json` together. On the original Linux host, run:

```sh
python3 receive.py --source-stdin < source-stream.jsonl
```

The base stream contains 808 selected source files, including the original OpenAQ study, native workers and SF88 package files. The adjacent `source-assets.json` supplies 19 original files that complete the eagerly loaded seller developer assets and declared runtime browser roots. Together these provide 827 files and 10,763,967 original source bytes from the selected product commit. The adjacent `source-operator.json` supplies the original SF62 console, SF54 intent adapter and SF59 reservation gate: three Python files and 18,632 bytes. Together with the three explicitly pinned source corrections described below, the complete runtime selection contains 830 files and 10,797,561 source bytes. The receiver verifies the fixed manifest, each file's Git blob identity, length and SHA256 before that source can run. The asset packet has its own fixed SHA256 and binds the same commit and base manifest; each asset also retains its original Git blob, length and SHA256. Exact existing files reopen; different existing bytes stop the operation.

The receiver retains its canonical operation in `/dev/shm/921ba0-openaq-buyer-native-20261012` and mutable native records in its `native/` subdirectory. Reproducible source and dependencies use `/dev/921ba0-openaq-runtime-20261012`. The first complete stream is compressed into the canonical `source-capsule.gz`, so the same command can restore the exact source if an invocation-private `/dev` mount disappears. It then reopens the original native requests. Both the retained manifest and `source/SOURCE-SELECTION.json` are checked on every complete-source reopen. The original 808-file capsule remains intact; `CONTROL/source-assets.json` restores the additional asset leaves, and `source/SOURCE-ASSETS.json` records the combined base and asset selection. `CONTROL/source-operator.json` retains the three exact original operator modules; `source/SOURCE-OPERATOR.json` binds them to that same base manifest and asset packet. The receiver verifies each complete body and reopens existing exact files before the original ledger worker runs. The imported Governor and expired-reservation reader remain the original files already selected in the base capsule.

The selected original Buyer signer imported its diagnostic reader from a module that does not export it. This continuation uses the unchanged signer adapter and imports that reader from its existing diagnostics module, matching the other original Buyer callers. The receiver accepts only the exact `053825b1862f3a5b3fc42aaa248f6b8aa6401254` preimage or `c12720ce4f432e24f4972523021d71fa9d85e2ce` corrected file at that one path. It preserves the base capsule, records the correction before applying it, and verifies the corrected bytes again. `source/SOURCE-REPAIRS.json` and the final package’s `SOURCE.json` carry both source identities. Same-directory reopens and fresh source restoration use this same correction.

The original operation's file lock covers source intake, installation, execution and packaging. Each original child inherits that same held descriptor. The receiver retains the child, its process group and output through actual retirement; an abruptly lost intermediary therefore does not free the original lock while its direct child still owns it. Run one continuation on the original host and preserve its canonical directory. When moving hosts, transfer this same canonical operation after its original execution owner has retired.

Node, Python, npm and OpenSSL are required. The exact original SF88 package-lock supplies the dependency graph; `npm ci --ignore-scripts --no-audit --no-fund` installs it into the private dependency directory and reuses `CONTROL/npm-cache`. The receiver records the exact package and lock hashes in `dependency-ready.json` only after that original npm process exits successfully. An interrupted unmarked dependency tree is rebuilt through the same `npm ci`; a partially created package file is not readiness. npm uses a 192 MiB V8 heap setting for the shared host. The source stream does not replace the package manager or SDK. The original configured Git route remains available with `python3 receive.py`; it checks the selected HEAD and clean tracked source. Git source reads have a 180-second deadline and retire their original child group if that deadline is reached.

The original source runs on the installed Node runtime. The local TLS certificate is trusted only through the child process's `NODE_EXTRA_CA_CERTS`. The original Buyer keeps hostname checks and its explicit CONNECT transport. The receiver attaches an actual controlling PTY to the owned Node process and selects SF81's maintained terminal channel. It does not write an approval response.

The fixture serves the actual original versioned Dataset handler over HTTPS. It returns native unsigned HTTP200 pages, so the unchanged SF88 execution reports NO_PAYMENT_REQUIRED. A local signer provider rejects any attempted signing; no payment approval is entered. The complete child and its original helper processes drain before the receiver retires the process group. The separate real merchant purchase stays with its original owner.

## Continue the retained unsigned page

The first original GET reached the selected Dataset service. The receiving driver treated the handler's successful admission value, `true`, as a response and destroyed the connection. The corrected driver uses the original service contract: call `versions.handle(context)` when admission returns `true`, and otherwise return the admission's native response. The first attempt remains recorded as `INITIAL_TRANSPORT_FAILED` / `ECONNRESET`, before signing, with no reservation and no response body.

The exact reviewed attempt is `0c8f89e1292825866d057a28af227d4fa54c76fa02163eacdb35fb936e5c068e` in the original `customer/session-000001/pages/000001`. The driver retains its explicit continuation request before calling the existing `retryUnpaid` path. A different unresolved attempt requires its own original review and is not selected by this programme.

`source-unpaid-repairs.json` contains the complete, pinned `attempt-wire.mjs` and `dataset-unpaid.mjs` successors. It is bound to the unchanged base manifest, asset packet, and exact before/after Git and SHA256 identities. The receiver preserves the original capsule and retains this complete packet before replacing either selected source leaf. `source/SOURCE-UNPAID-REPAIRS.json` records the applied selection.

The original Dataset run lock remains held while this continuation verifies the complete old attempt, current configuration, missing response, and authenticated SF36 ledger with zero reservations for the intent. The existing wire owner and history-transition lock protect the complete original wire directory. Its source, request, dispatch, error, and any unfinished publication inodes move together into the same attempt's `unpaid-history`. The linked SF82 checkout and body-checkpoint records are validated against the original terminal evidence and retained there too. The old attempt marker is the last canonical terminal file retired. A partial archive reopens its retained plan; it does not imply another dispatch.

If the native portable receiver transfers a PREPARED unpaid history to another filesystem, the same manifest verifies its original selection, plan, and complete wire member bytes. The continuation preserves those original records and retains a separate `wire-location-<archive SHA>.json` that binds the received directory and files to their actual current identities. Later resumes require those same received identities. This applies before or after the wire rename; it does not translate or overwrite historical inode records.

The next page admission keeps the original page intent and uses the unchanged Buyer, quote review, approval and budget checks. This fixture returns `NO_PAYMENT_REQUIRED`; it supplies no approval response or payment signature. The final result records the earlier failed request as well as the successful page requests. Each returned native acquisition is saved before the driver checks completion.

For an ordinary installed customer's reviewed unpaid attempt, the existing command remains:

```sh
starforge openaq-buyer run --dir ORIGINAL_CUSTOMER_DIRECTORY \
  --retry-unpaid --expected-attempt-sha256 ORIGINAL_ATTEMPT_SHA256
```

Use the exact attempt digest returned by that customer's original inspection. `recover` only reopens original state and a proven-dead original Dataset lock; it does not execute a page.

## Complete programme

1. Receive the exact 13,807-byte reviewed study, preserving capture, named review, report and provenance.
2. Use the original Frictionless publisher's prepare, review and publish requests, then prepare and stage its original SF82 release.
3. Start the original OpenAQ application and receive its retained export through the authenticated download contract into a source-bound handoff.
4. Prepare and reopen the original reviewed Buyer selection and Dataset session.
5. Execute the unchanged SF88 HTTP engine for all three pages; repeating the completed acquisition returns the same saved session.
6. Read the original accounting result and retain the distinction between unpaid page output and settlement.
7. Export complete source, original session, accounting, report and all typed Dataset outputs.
8. Close the original servers and owners, independently receive both archives, read all 140 rows and cold-reopen the same original session.

The original run writes `NATIVE_RESULT.json` only after those phases and owner retirement complete. Failures retain the original request, attempt state and diagnostic. No completion should be inferred from source publication or an admitted process alone.

## Customer output

On completion, the receiver publishes `OpenAQ_Original_Buyer_Workspace.zip` and `package.json` in its canonical directory. The ZIP contains the complete delivery and independent receiving trees, native result, original accounting, this programme's source, the exact three corrected source leaves, the three original operator modules and their source selection, and the product operating guide. The native session archive includes the original failed attempt's complete checkout and wire history. Operator keys and local TLS/signing custody remain in their original native workspace.

If native completion has already been recorded but package publication was interrupted, the same receiver restores any missing reproducible source and finishes that package. It does not rerun the completed Buyer journey. An already complete package reopens only after its exact length and SHA256 match.

For ordinary installed product use, follow the complete product guide at `stellar/scf-starforge-20261009/sf88-operator-buyer-cli/openaq-study/OPERATING.md`: `starforge openaq-buyer handoff` → `prepare / inspect / run` → `export` → `receive / reopen`. Use the IDs and digests returned by each original command.

The historical sample is Del Norte, Albuquerque, 2022-05-03: 140 measurements from six sensors. It demonstrates the receiving workflow and retains original units, review and licensing context. The current Whitehorse commercial work uses this identified sample as a software example; its scientific assessment and station source remain with the original project authority.

## Completed native execution

The original programme completed on 13 October 2026 at 01:00:17.863 UTC, on Node 24.19.0. The maintained receiver's native session 44945 exited zero and retained the complete result in `NATIVE_RESULT.json`. All original owners retired before package publication.

| Stage | Completed result |
|---|---|
| Original reviewed study | Retained capture and named review; 140 historical observations; no new OpenAQ provider request |
| Publication and release | Original Frictionless publication, SF82 staging and fixed Dataset snapshot |
| Authenticated handoff | Complete source-bound handoff and original study archive received through the original application |
| Buyer preparation | Same original reviewed request, configuration and Dataset session reopened |
| HTTP pages | Three successful native pages, 140 rows; four total HTTP requests including the first failed GET |
| Native accounting | Three original `NO_PAYMENT_REQUIRED` entries; zero approvals and settlements |
| Complete output | CSV, JSONL, HTML review, original study, complete session archive and accounting; 22 PM2.5 rows |
| Independent receiving | Source owners closed; complete archives received and all 140 rows cold-reopened with no additional HTTP request |

Replaying the completed acquisition also made zero additional HTTP requests. The first `ECONNRESET` attempt remains in the original unpaid history, with its complete wire and SF82 checkout source and retirement identities. The successful continuation used the same page intent and original Dataset/SF36 authorities.

The final 136-member customer ZIP is `OpenAQ_Original_Buyer_Workspace.zip`, 376,833 bytes, SHA256 `a5955daf68b1b62a709519080c528b52905ea27f63d8f1d884a4fa5ced17d2f7`. It contains 1,861,656 expanded bytes of complete delivery, independent receiving, original history, typed outputs, guides and source selections. The complete native result is 12,359 bytes, SHA256 `b2c2c768980b3e0644ffb12618d496f7b0dcc1f0b46f985c7965c13744df4036`. Both are saved as the original customer deliverables.

The source-native fixture used unsigned HTTP200 responses: its accounting records `NO_PAYMENT_REQUIRED`, with zero new provider calls, payment approvals or settlements. The historical sample remains Del Norte, Albuquerque, 3 May 2022. It demonstrates a complete installed customer workflow while preserving the separate seller's paid purchase authority and the original study provenance.

The selected base is `c7ac4399e3bb419fafd42395841bace7d089036a`; product PR593 is merged as `ece595782a2ece95485200e4cb6f573ed1aefbab`, complete source intake PR705 as `2778cfcbefcf134b6c00f948fe4bd88f175b1d3f`, signer correction PR749 as `0ad4c1be410db604f0a11150f896ae1ed74d83af`, and the complete unpaid-history continuation PR821 as `8cfa8469f271db5e88e1342b8c65837b8e3a3349`. The original operation, study, handoff, customer and page identities are unchanged.
