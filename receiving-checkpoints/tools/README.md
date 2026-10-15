# Complete receiving checkpoints

This small codec retains one complete JSON value by sharing equal ordered subtrees in its stored representation. Decoding reconstructs independent objects and checks the original complete UTF-8 byte count and SHA-256 before returning them. Source values, key order, arrays, original strings, request records and every saved edition remain exact.

Use `encode(value, codec)` and `decode(bank, codec)` with the application's existing UTF-8/SHA codec. The decoder requires backward-only references, known node tags, unique object keys, finite JSON primitives, a 512 MiB complete-value bound, at most 1,000,000 nodes and a 256-level traversal bound. A decoded object is newly parsed, so shared storage cannot cause later edits to mutate a separate retained record.

The complete authored Harvest receiving workload round-trips byte-for-byte: 4,451,298 bytes become a 339,922-byte checkpoint before compression, with all 3 requests and 4 saved editions. Its complete source hash is fe8efb15ea42dc0d404efdf2f84f7a693c1edcc913fbfde1082bf065c08922ae. The maintained original chunked payload and verified full archive remain alongside the compact representation.
