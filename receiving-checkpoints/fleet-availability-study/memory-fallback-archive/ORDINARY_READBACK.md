# Complete repaired Fleet Availability archive received

All 10835 ordinary ZIP members were reopened from actual acknowledged immutable Git blobs. The original member CRC32/SHA-256 values, original export manifest and ordered whole ZIP identity matched. All 10834 expected retained source/history members were also compared directly during this same ordinary pass; the explicit source and working-file replacements are recorded in the derivation.

ZIP bytes: 106977573

SHA-256: 0e37e6c80f39dbbfd2dcd1da3a551b6eb66bae7c4bc9a4d7a05555c78dadb477

Expanded bytes: 312816413

Source merge: cfc0ade43456f3ad18d9878ce3a1cdec4bc13139

The complete member record is [ordinary-readback.json](ordinary-readback.json). The browser recovery repair preserves the complete retained course, requests and editions.

## Download and assemble directly

Save the neighboring [fetch-and-assemble.mjs](fetch-and-assemble.mjs) in a local directory with Node.js and the already authenticated GitHub CLI available. Select an existing output directory, then run:

```sh
node fetch-and-assemble.mjs \
  --repository woahwhattheheck/tjlabs-stellar-merchant-workspace \
  --commit 12aaa1831f9a485267998d1dd1c223fb0f0b3f9a \
  --manifest receiving-checkpoints/fleet-availability-study/memory-fallback-archive/manifest.json \
  --manifest-sha256 7cdb1774992eec0ec9e1f2817399f421088e03ddc151b006692f24d33e2d4a6c \
  --output /absolute/existing/directory/Fleet_Complete_Source.zip
```

The command verifies the pinned manifest and every immutable Git blob, retains verified local parts for interrupted-download recovery, and verifies the complete ZIP before publishing the output. Repeating the same command resumes from its local cache or reuses an already complete matching output. Existing files with different contents are preserved. The source command is the exact maintained 11,035-byte file from merged PR2196 (ce1810d1a7c62a72034751f662f2b9fa39b82bb3), SHA-256 5f8029af4b58ea620b158c1864b3a5b08e726545783d77c98c589e72b8d2b8be.

The neighboring README.md and assemble-archive.mjs also support assembly from a local checkout. The original receiving operation has the exact standalone populated HTML attachment and its inspection instructions. Current working HTML: {"bytes":7766287,"sha256":"5cf133ac7259b1a0a4cc042b647f6c09ee6e138e768e26503948b7341450767b"}.
