# CoinGecko corrected source edition and original customer receiving

Operation: `COINGECKO-PRODUCT-DELIVERY-5403-20261012`.

The original selected build actually fetched `ada4e3261a421010f93ef4bda9ce8b0b2624d4c1`, ran the maintained complete builder, and ended with exit 1 at 2026-10-12T18:18:54.374214Z. Its full command returns and native record are retained. No source TGZ, customer receiving or payment was produced by that attempt.

The corrected fixed source is **2278c27e3a6177e7231f313ea3aeab44277a54b0**, a direct child of ada4. Merchant PR373 merged its complete correction as `ed13620a782e12a5fc142446b029a41fe42cdc14` while preserving current main. The correction registers the two existing SF88 server/browser-asset manifest pairs, explicitly includes the original sf43 MCP buyer production module, and includes the complete original sf101 outbox continuity component. The original eight builder modules and seven pinned customer production modules are unchanged.

This carrier continues the same delivery operation on that explicit source edition. It never edits or restarts the failed native request.

## Exact complete source

All paths in this table are relative to this directory.

| File | Bytes | SHA256 |
| --- | ---: | --- |
| builder.json | 105681 | 7f860dde8658f1f011ee4558b191a46ef06d1434ce25eb61b90895e6a495dd34 |
| customer.json | 18505 | 24d625aa64093d6c652602e7b56b9be95e3d9b9ecaa65752dfdbe92c592ee169 |
| run-selected-customer.py | 45437 | dcafcf07f7af0f9546b40235d728ed55626df8ba300756ebce7d57d61d658d57 |
| launch-native.py | 20331 | 918b254aa5057106266e017a6def71f216f3b2bb99315bfee6c0cbcd54470f09 |
| input-bundle.json | 176160 | 41fc99deac000d0c8c24d2bd7b446ddb31ad12a24919fb8e35f9e417ed3e7d79 |

The bundle contains every byte of the builder, customer and programme inputs. The launcher verifies the whole bundle, exact member names, byte counts, SHA256 values and Python syntax before immutable publication. The programme separately verifies every original builder member, including its Git blob identity, and every customer member.

The builder carrier updates only the selected source and its actual failure/edition history; all eight maintained executable modules remain byte-identical. The customer JS updates only its recorded source commit, keeping its seven actual production-module pins, source archive, project, operation IDs, original customer logic and completed-result replay. The already reviewed exact-prefix archive selector is unchanged.

## Preserved original evidence

Persistent root:

`/workspace/scratch/5403360e55a4/coingecko-product-native`

Original failed native record:

`records/de8401acf9b746ed7d4e4fa4e80ab8570966f89e542393eb8084d0dc17ff1a6f`

| Original evidence | Exact identity |
| --- | --- |
| Request SHA256 | 4ad02373bcef423024a4d4330f27817a84e9d213f9307ea8f0a910000dfa7f18 |
| Result SHA256 | f6cf97549ea3d94df816e84812a4c68d8466a946051a4b8c24e8b9b886f7b367 |
| Native result | failed, exit 1, completed and released |
| Original programme | input/run-selected-customer.py; SHA256 bd70fe442e90714838fa2c472e9d652582b423539f73eae548175daf8495af92 |
| Original full build stderr | project/output/commands/selected-build-202c52c44b81432cb03f365ba23974e3.stderr; 4434 bytes; SHA256 9df2f2cd492c9f112f2f766512ff539eb348420dcdd0878afcce9c8f683889c5 |

The original root SOURCE_INPUT.json, input directory, placement, native request/result, project/INPUT.json, project/programme.json and all command outputs stay in place. The failed journal is not rewritten as success.

The source-edition input is retained separately under `source-editions/2278c27e3a6177e7231f313ea3aeab44277a54b0/input`. Its execution INPUT.json, journal and frozen source history are under `project/source-editions/2278c27e3a6177e7231f313ea3aeab44277a54b0`. The customer directory, project/output, project lock and native record/ledger roots remain the originals. CURRENT_SOURCE.json identifies the actually adopted edition and native phase; it is not a second application or customer database.

## Original archive and runtime

The retained original ZIP is:

`/workspace/scratch/5403360e55a4/coingecko-product-original/CoinGecko_Complete_Research_and_Recovery_2026-10-12.zip`

It is exactly 672184 bytes with SHA256 `6dff8fc354d9992ca7f19227d893a34c745f86da0d1cb642bd6ee144933fcbce`, containing original market project `05c3eb83-9c7a-42a0-a683-4024e5f755b8`. The selector finds the original member by actual schema/project identity, retains its original compressed bytes under the same customer directory, and safely resumes only an exact owned prefix before create-only publication.

Use the same complete maintained host:

`/workspace/scratch/dbc61db6310c/native-runtime-recovery-62c14ca9/host`

Use installed Node24+, Python3.10+, Git, npm and flock. Source packaging uses the original builder and npm pack with scripts disabled. No SDK install, dependency adoption, payment, browser or paid source request is added by this programme.

The default temporary root is `/dev/coingecko-product-5403`. It exists only within the owning invocation. The corrected-edition command explicitly selects `/dev/coingecko-product-5403-source-2278c27e`, so its immutable programme-owner marker cannot collide with the old-input directory. The entry performs prepare, materialize, start and ForegroundLaunch.handoff in one process tree, so transient Git/source/package work never depends on an earlier invocation-local path. All original state, exact source receipts, TGZ and complete customer ZIP are retained on shared storage before exit.

Declarations remain 768 MiB memory plus 256 MiB reserve, clean-cache admission, 512 MiB transient disk and 16 MiB persistent project growth plus 8 MiB disk reserve. These are admission estimates; actual source/installed/archive sizes come from the completed builder. The previous failed build measured a 116895744-byte peak tree and 149430272-byte peak RSS, not a completed package. No reserve or ledger is modified by the carrier.

## Adopt the corrected edition

Run the exact published launcher and input bundle in one owning invocation:

```sh
python3 -B artifacts/source_transfers/coingecko_source_editions/2278c27e3a6177e7231f313ea3aeab44277a54b0/launch-native.py \
  --input-bundle artifacts/source_transfers/coingecko_source_editions/2278c27e3a6177e7231f313ea3aeab44277a54b0/input-bundle.json \
  --bundle-sha256 41fc99deac000d0c8c24d2bd7b446ddb31ad12a24919fb8e35f9e417ed3e7d79 \
  --root /workspace/scratch/5403360e55a4/coingecko-product-native \
  --temporary-root /dev/coingecko-product-5403-source-2278c27e \
  --archive /workspace/scratch/5403360e55a4/coingecko-product-original/CoinGecko_Complete_Research_and_Recovery_2026-10-12.zip \
  --predecessor-record /workspace/scratch/5403360e55a4/coingecko-product-native/records/de8401acf9b746ed7d4e4fa4e80ab8570966f89e542393eb8084d0dc17ff1a6f \
  --native-operation-id COINGECKO-PRODUCT-DELIVERY-5403-20261012-SOURCE-2278c27e \
  --adopt-source-edition-from ada4e3261a421010f93ef4bda9ce8b0b2624d4c1 \
  --git-objects /workspace/scratch/5403360e55a4/scf-engineering/.git/objects
```

The Git donor is read-only. Preserve its actual path and objects. Explicit --node, --git, --native-host and --temporary-root options may state the same equipped host's actual installed paths.

The first source adoption requires all of these actual facts, under the original project lock:

- The original retained request/result hashes match the failed ada4 operation, its result is exit1, its process identities are ended and its reservations are released.
- The original programme, input, project, archive and previous native command are exact.
- No source package, completed outer result or customer data exists.
- The original progress hash and transient identity still match the selected handoff.
- No other source edition or native phase has already taken the programme.

The create-only handoff is `continuations/<native-phase>/handoff.json`. Both launcher and child re-read the actual terminal predecessor through the maintained API. The child freezes the original input, original failed progress and handoff beside the selected input, then records the actual new transient/native phase. The old native record remains failed.

The request, placement and input files are immutable. After an unknown tool return, reconcile the existing native phase and original handoff. Do not use the old ada4 request as a retry target and do not create another simultaneous phase.

For transports with a small argument limit, the same launcher accepts --stdin. It announces AWAITING_SOURCE_INPUT, reads a decimal byte length/newline and exactly the verified bundle bytes on that same terminal, and reports actual prefix hashes. Reconcile the exact acknowledged prefix after a lost write response; do not replay an unknown input chunk.

## Same-edition native continuation

After the corrected edition has begun, a later actual completed/released native predecessor can be continued with the same launcher/bundle, its actual record and a distinct native phase. Omit --adopt-source-edition-from. That route requires the versioned current journal, input, source programme, previous native phase and retained transient identity to match the same corrected source.

A surviving process, an outcome-unknown command, or an interrupted record without an actual terminal result cannot be represented as a completed predecessor. Keep that original ownership and use its maintained recovery route. Before any replacement phase, inspect the original request and journal; source-ready files or missing invocation-local paths do not establish an ended process.

If the complete original selected TGZ was retained, the continuation verifies it with the unchanged runtime-unpack.py and resumes the original customer directory. It does not rebuild Git or rewrite the original distribution paths. If receipt retention was interrupted, the immutable complete receipt envelope recreates missing exact JSON receipts before a TGZ can be accepted. A same-source rebuild needed to complete a not-yet-retained archive must match that envelope's original filename, byte count and SHA.

## Complete received outcome

The programme retains the existing connected lifecycle:

1. Exact builder/customer input verification and original Git resolution of the corrected fixed source.
2. Full original source-selection build and native module closure.
3. Original distribution/build/manifest/pack receipts, durable receipt envelope and complete source TGZ.
4. Actual same-build completed resume and status.
5. Exact original market-archive selection.
6. Complete customer delivery create/inspect/repeat, original restore/receive, same-operation replay, actual recipient note and SQLite reopen.
7. Completed-customer replay without overwriting later recipient notes.
8. Full closed customer ZIP, including original delivery, complete customer files, selected customer programme and frozen source-edition history.
9. One immutable project/output/NATIVE_RESULT.json with selected and original source identities, complete native results and exact artifacts.

The unchanged editable recipient is `project/customer/recipient-market`. The versioned execution journal is `project/source-editions/2278c27e3a6177e7231f313ea3aeab44277a54b0/programme.json`. Every full command request/stdout/stderr/result stays under `project/output/commands`.

Return the actual native record/handle, NATIVE_RESULT, full source TGZ and its manifest/bytes/SHA, and CoinGecko_Complete_Customer_Receiving.zip. A saved source edition, successful syntax check or native admission is not a completed build or customer result.
