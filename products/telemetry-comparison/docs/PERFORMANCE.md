# Complete retained-workspace performance

## Actual retained capacity result

The original authored capacity course uses 1,000 timestamps and 12 points in each of two frozen editions. Both editions contain 12,000 paired values. Every original source, exact normalized number, occurrence, pair, finding, model declaration, source mapping and operation remains in the complete workspace.

The successor's complete uncompressed workspace is **51,831,023 bytes**, SHA-256 `906545e1ee38fd0a860e338ed84b7e663cbfe35e5fbbfafc8240b6220f4169f4`. Its history root `b9d3b6c4059fb28af08a877e9dbc68a44e3550a6eb2e19450cfcf6301ad64ed3` equals the predecessor's retained root. The whole uncompressed workspace SHA also equals the predecessor's. Thus the original complete content is unchanged.

The additional shared working file is **11,356,391 bytes**, SHA-256 `ad6a293c6c2e4f51efc18a338786a074d023631766438c31a5ab39a474962f8d`, containing 111,648 shared nodes. This is 78.09% fewer portable-file bytes. The native handoff still retains the full original JSON and every original/report export alongside this smaller option.

## Measured stages

| Actual source-runtime stage | Retained predecessor | Current successor |
|---|---:|---:|
| First edition save | 37227 ms | 32654 ms |
| Second edition save, changed model version | 36907 ms | 23268 ms |
| Full original JSON export | 54329 ms | 45016 ms |
| Shared-format construction | not in prior course | 64003 ms |
| Shared reopening with full history validation | not in prior course | 114811 ms |

The predecessor's complete course took 224743 ms. The successor's extended course took 346013 ms and additionally constructed and reopened the shared archive; these totals cover different work and are not an overall speedup comparison. These are individual V8/pure-JavaScript codec runs, not repeated statistical measurements, Node timings, browser timings or physical-model runs.

The current capacity course reuses its API instance, including the bounded calculation cache. Its reopening stages are warm-cache history replays. The separate shared-archive course uses a new API instance and verifies independent exact reopening of the complete authored operating example. The original nineteen-case source course passed unchanged, and the nine integrated archive/calculation cases passed.

## Operator effect

A new compact working-file option retains the same whole project while reducing transfer/storage size. Original full working JSON remains readable. A metadata-only model declaration no longer requires recomputing unchanged numerical occurrences and pairs; the newly declared model metadata and input SHA still appear in the correct frozen report. Changed source bytes, calibration or calculation inputs follow the ordinary engine.

The shared format is for working state. Any existing operator wrapper must also preserve its complete unfinished forms and proposed commands. The current UI owner is integrating this API into that same saved-working flow. Native CLI source already accepts both working formats and produces both, with the same original-source/report/course destination.
