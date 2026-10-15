# Complete archive preparation without accumulating raw members

This contribution adds a prepared-member ZIP builder and uses it in the complete Water exporter. Existing packZip, packStoredZip and readers remain available. The complete exporter still preserves every source file, current/session/history/branch report, original, managed request and edition.

## Why this changes the large export

The previous exporter accumulated the full raw member collection before packing. Its writer then retained raw and compressed records together. A complete installed workload can contain hundreds of megabytes even when its ordinary compressed ZIP is much smaller.

createZipBuilder compresses each supplied member immediately and retains owned compressed bytes, original length, CRC, name and mode. add copies mutable inputs; a subsequent change cannot rewrite an earlier member. copy creates a new path for a previously owned exact member without repeating compression. The Water exporter keys its limited reuse map by the exact text and retains only a prepared member name and original SHA-256.

finish writes the same sorted classic ZIP headers and contents. Source names, file modes, timestamps, ordinary STORE/DEFLATE selection, raw/compressed limits, CRC values and complete archive membership retain their original meanings. The optional observeEntry callback reports start/done and constant-time member/byte totals.

## Restart

snapshot returns a JSON-compatible prepared checkpoint with a deduplicated base64 payload bank. createZipBuilder(options, checkpoint) checks referenced payloads, original length, CRC, ordinary names and limits one member at a time. Callers should preserve the checkpoint's complete hash together with the source/workload identity and calculation position. Resuming uses the same supplied compressor configuration for later members.

The callback can capture the builder by wrapping createZipBuilder in the receiving driver. The exported ZIP is complete only after finish. The maintained application source and exact compact Water/Fleet receiving states remain separate inputs.

## Measured complete-source run

The actual 886-member Distribution source bank supplied 12,606,633 raw bytes. Prepared retention was 2,499,964 compressed payload bytes; the complete ordinary ZIP was 2,706,802 bytes. This is a reduction in retained payload, not a process-RSS measurement.

The existing writer took 7,059 ms. Preparation including the midpoint JSON checkpoint took 7,486 ms. Restoring that checkpoint and processing the remaining members took 3,412 ms. Whole output SHA-256 was ee374e0a82da2bb781f299189505375f6d1a123a147256a65c14d55b6777e542. The exact existing/new/resumed ZIPs match, and every member was decoded and compared with its original. The retained result includes mutable-input, alias, corrupt-checkpoint, path-collision, byte-limit and unchanged STORE cases.

The Water/Fleet complete installed archive receiving uses its own preserved full workload and remains the production integration followthrough.
