# Complete OpenAQ Buyer receiving programme

This operation uses the original historical Del Norte study and the selected product at `c7ac4399e3bb419fafd42395841bace7d089036a`. It completes scientific source intake, publication, a retained release handoff, the original SF88 Dataset acquisition, native accounting, SF100 output, and independent receiving.

## Open the original operation

Keep `receive.py`, `native-journey.mjs`, `source-inputs.json`, `source-manifest.json` and `source-stream.jsonl` together. On the original Linux host, run:

```sh
python3 receive.py --source-stdin < source-stream.jsonl
```

The stream contains the complete selected 808-file source, including the original OpenAQ study, browser assets, native worker modules and SF88 package files. It carries 10,510,654 source bytes from the exact selected product commit. The receiver verifies the fixed manifest, each file's Git blob identity, length and SHA256 before that source can run. Exact existing files reopen; different existing bytes stop the operation.

The receiver retains its canonical operation in `/dev/shm/921ba0-openaq-buyer-native-20261012` and mutable native records in its `native/` subdirectory. Reproducible source and dependencies use `/dev/921ba0-openaq-runtime-20261012`. The first complete stream is compressed into the canonical `source-capsule.gz`, so the same command can restore the exact source if an invocation-private `/dev` mount disappears. It then reopens the original native requests. Both the retained manifest and `source/SOURCE-SELECTION.json` are checked on every complete-source reopen.

The original operation's file lock covers source intake, installation, execution and packaging. Each original child inherits that same held descriptor. The receiver retains the child, its process group and output through actual retirement; an abruptly lost intermediary therefore does not free the original lock while its direct child still owns it. Run one continuation on the original host and preserve its canonical directory. A restored copy on another host requires an explicit transfer of this same operation after its original execution owner has retired.

Node, Python, npm and OpenSSL are required. The exact original SF88 package-lock supplies the dependency graph; `npm ci --ignore-scripts --no-audit --no-fund` installs it into the private dependency directory and reuses `CONTROL/npm-cache`. The source stream does not replace the package manager or SDK. The original configured Git route remains available with `python3 receive.py`; it checks the selected HEAD and clean tracked source. Git source reads have a 180-second deadline and retire their original child group if that deadline is reached.

The original source runs on the installed Node runtime. The local TLS certificate is trusted only through the child process's `NODE_EXTRA_CA_CERTS`. The original Buyer keeps hostname checks and its explicit CONNECT transport. The receiver attaches an actual controlling PTY to the owned Node process and selects SF81's maintained terminal channel. It does not write an approval response.

The fixture serves the actual original versioned Dataset handler over HTTPS. It returns native unsigned HTTP200 pages, so the unchanged SF88 execution reports NO_PAYMENT_REQUIRED. A local signer provider rejects any attempted signing; no payment approval is entered. The complete child and its original helper processes drain before the receiver retires the process group. The separate real merchant purchase stays with its original owner.

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

On completion, the receiver publishes `OpenAQ_Original_Buyer_Workspace.zip` and `package.json` in its canonical directory. The ZIP contains the complete delivery and independent receiving trees, native result, original accounting, this programme's source, and the product operating guide. Operator keys and local TLS/signing custody remain in their original native workspace.

For ordinary installed product use, follow the complete product guide at `stellar/scf-starforge-20261009/sf88-operator-buyer-cli/openaq-study/OPERATING.md`: `starforge openaq-buyer handoff` → `prepare / inspect / run` → `export` → `receive / reopen`. Use the IDs and digests returned by each original command.

The historical sample is Del Norte, Albuquerque, 2022-05-03: 140 measurements from six sensors. It demonstrates the receiving workflow and retains original units, review and licensing context. The current Whitehorse commercial work uses this identified sample as a software example; its scientific assessment and station source remain with the original project authority.

## Retained execution state

The original source intake, publication/release and authenticated handoff phases have completed under this operation. The Buyer preparation and execution phases remain pending native continuation at this source update. The next source-stream admission has no completion result merely because its source is published. `NATIVE_RESULT.json` and `package.json` record the actual final outcome when the original programme completes.

The selected source is commit `c7ac4399e3bb419fafd42395841bace7d089036a`; product PR593 is merged as `ece595782a2ece95485200e4cb6f573ed1aefbab`. This receiving correction preserves the selected source, original programme hash, native operation, study and request identities.
