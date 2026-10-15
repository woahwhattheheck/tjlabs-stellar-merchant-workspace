# Resume the original complete Distribution Merchant course

This is the Linux/Node continuation for operation A74F's Distribution lot/order installed study. It runs the exact original `receiving/host-course.cjs` from source `9b2453fe855ce3ad9fa8d057a1649265809ce7ee`, continuing the original prefix from `710bfa6703031892daed620b1fd880aa6c124f81`. The course uses the production Merchant dispatcher and model with its original injected filesystem/listener. The separate product `native/receive-installed.mjs` exercises the actual native filesystem/listener.

## Run or resume

Use the supported original `Distribution_Complete_Receiving_Resume.json` from Business2 internal pickup message `1a1418da5b740970` (recipient-free draft `r-9073133047018359034`). Its decompressed bytes are 22,577,506 with SHA-256 `a184947dff348a5cff15b3a97e05c6644ede45ee4525535c635a2cbd63f48e14`.

Place `resume-complete-course.cjs` and `resume-core.cjs` together, then:

```sh
node resume-complete-course.cjs Distribution_Complete_Receiving_Resume.json ./distribution-complete-course
```

Run that same command after interruption. Linux `flock` provides the single-writer kernel lease and releases it when the child exits or is terminated. A second concurrent runner exits 75. No stale process-lock cleanup is needed. Use Node 22 or later and the ordinary Linux util-linux `flock` command.

The first run retains the exact 24-request/25-edition prefix. Subsequent checkpoints retain all original histories at imports-36, complete-imports, before-pinned-reads, after-pinned-reads, and complete-course. Resume reads `LATEST.json`, verifies the entire checkpoint against its bytes/hash, source identity and envelope identity, and continues from that phase. A corrupt or different checkpoint is rejected; it never silently falls back to an earlier state.

## Durable outputs

- Each checkpoint and receipt has a content-addressed immutable name.
- Files are fully written and fsynced before the final immutable hard link is created. Existing immutable output must match exactly.
- Newly created output directory entries and their existing parent are synced before the run. The output directory is fsynced before publishing `LATEST.json`, which is itself replaced atomically from a fully synced temporary file.
- `COMPLETE_RESULT.json` appears only after the course retained its complete final checkpoint. Its immutable content-addressed original is kept beside it.
- A crash can leave an unreferenced `.pending-` file. It cannot promote that partial file to a completed checkpoint. Retain it for inspection or remove it after the original process has exited.
- Progress is newline-delimited JSON on stdout. It contains the current operation and timing; source state stays in the checkpoint files.

This runner does not publish Git or send customer messages. The current cloud branch remains its original writer. Return complete native results through the existing Coordination operation; preserve all checkpoint files for final archive preparation.

## Actual focused execution

`focused-result.json` records execution on the original complete imports-24 graph: all 13,129 graph nodes and the root are unchanged after hydrate/compact/restore; all 24 requests and 25 editions survive. The new compact envelope omits old optional expanded-byte metadata, so its own serialization identity is 7,860,014 bytes / `5705dfa94dd22f40296ca6aa9fc78d7a05148b26b913d9c8be59aa48f0417ddd`. The source state is identical.

The compactor memoizes already visited object identities while preserving structural interning, avoiding repeated traversal of shared history in a restored graph. Focused rejection checks cover a different source envelope, changed checkpoint bytes, mismatched source identity, a forward graph reference and cyclic input. Native filesystem/flock execution belongs to the existing equipped receiving course.
