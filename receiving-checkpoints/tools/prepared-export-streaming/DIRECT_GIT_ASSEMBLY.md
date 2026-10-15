# Fetch a complete ordinary ZIP without cloning the repository

The standalone Node command `fetch-and-assemble.mjs` uses the current authenticated `gh` session. It takes an explicit repository, immutable 40-character commit, exact manifest path and manifest SHA-256. It fetches each original part by immutable Git blob ID, verifies Git SHA-1, canonical encoded text SHA-256 and decoded SHA-256, then checks the ordered complete ZIP hash.

Downloaded parts are retained in a content-addressed local cache after file and directory fsync. Repeating an interrupted command reuses verified cached parts and rebuilds the output in order. Corrupt cached parts are replaced only after exact verified bytes have been fetched. An existing complete output is checked and reused; a different existing file is preserved and rejected. Short writes are completed explicitly. The final output is fsynced and atomically linked without replacing another output, and its parent directory is synced.

Requirements: Node.js 18 or later, `gh`, an existing authenticated GitHub session with read access to the selected repository, and an existing output directory. The command uses the gh session directly and does not request, print or store credentials.

Actual completed Fleet archive for native receiving:

```sh
node fetch-and-assemble.mjs \
  --repository woahwhattheheck/tjlabs-stellar-merchant-workspace \
  --commit 4dacae9f842af7e3e6d94ffb4074832c582a3fde \
  --manifest receiving-checkpoints/fleet-availability-study/complete-archive/manifest.json \
  --manifest-sha256 1325c5718cf71db9d7c7bbd8518e9e4f2e27e12b0bb52fda8a905cb5e5868c1b \
  --output /absolute/existing/directory/Fleet_Complete_Source.zip
```

Optional `--cache /absolute/directory/verified-archive-parts` selects a shared content-addressed part cache. Otherwise the cache is beside the output with suffix `.parts`. The complete ZIP is 106,977,990 bytes, SHA-256 c49ef09a2d6074e0958565a5c9a3d838fed12fa5f455a01765c6b7e0df3cd9e2, with 10,835 members. This exact original archive has already completed ordinary member readback; repaired product successors use their own explicit commit and manifest identity.

For receiver validation, run this command against the actual archive, interrupt after several confirmed cache parts, run the same command again, and retain its final JSON result. Run once more to exercise exact completed-output reuse. Open the usable ZIP contents through the original product receiving operation and follow the repository AGENTS.md rendered inspection instruction.
