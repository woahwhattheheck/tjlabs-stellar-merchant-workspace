# Complete archive compression

This integration keeps every existing source, working carrier, pending form, original document, retained branch, historical study, managed request and edition at its existing ZIP path. It changes the full handover writer from STORE to ordinary ZIP DEFLATE with automatic STORE for members that grow under compression. The source codec and its MIT license travel with the application; the upstream distribution also retains its embedded Zlib notices.

## Measured complete workload

The merged RouteProof source at 8543ac39106f51d79da67c97f96e54a25eaf6f30 supplied 110 source files, 27 requests and 28 editions. Its complete export has 4,213 members and 98,266,022 uncompressed member bytes. STORE produced 99,571,450 bytes. Pako 2.1.0 level 1 produced 31,934,710 bytes, a 67.93% reduction; level 6 produced 29,521,210 bytes. Every selected archive member was decoded with the separately implemented existing host gzip decoder and matched by exact path, length and SHA-256. ZIP directory, CRC and path validation also ran.

In this connected V8 run, entry restaurant took 128.503 seconds, STORE packing 8.037 seconds, level 1 packing 48.342 seconds and level 6 packing 72.097 seconds. Level 1 saves 67.64 MB for 40.305 additional seconds of packing. At an effective transfer rate below about 1.68 MB/s, one transfer's saved time exceeds this additional packing cost. This is a calculated threshold, not a measured network rate. Level1 is the selected compression setting; level 6's extra 7.56% reduction versus level 1 does not justify its additional 23.755 seconds here. Native/browser performance depends on its execution environment.

## Integration

Replace src/connected_zip.cjs with the explicit raw-codec-hook implementation. Retain vendor/pako.cjs and vendor/PAKO_LICENSE.txt. Apply the complete host/export-core.mjs source: it loads only the exact bundled codec source, cached by the actual files object and source text, then packs with level 1 and the existing 256 MiB / 10,000-member constraints. Apply the complete source builder to require and carry both vendor members. The independent peer hook receives expected_bytes and expected_crc32 to support a bounded ordinary raw decoder. The original packStoredZip API keeps identical STORE bytes.

For a sibling product, preserve its exported function names, source namespace, file names and manifest schema while applying the same source change. Regenerate its ordinary application and complete source manifest using its maintained builder. Do not copy RouteProof business/domain sources into another product. All histories and paths remain intact.

## Upstream provenance

Unmodified source: https://github.com/nodeca/pako/blob/2.1.0/dist/pako.js
Git blob: 0c4968dad2c013a7d50348d8d4bc7d6cb9c1b766
License: https://github.com/nodeca/pako/blob/2.1.0/LICENSE
Git license blob: a934ef8db478453e38b2f29af67610916fa9fc99

The reproducible whole-workload comparison is in export-compression-course.cjs. The saved result identifies the actual runtime and selected source. The comparison accepts a retained complete source map and actual host-course workload; it reconstructs the same export entry paths, evaluates STORE and both compression levels, then checks every selected member using the independent existing decoder.

## Installed replay

From the current source map, load receiving/export-compression-course.cjs and call its exported async function with {files, workload, sourceHead}. workload is the complete result of receiving/host-course.cjs. Both ordinary STORE and DEFLATE entry builders are intercepted for comparison, so the same whole replay works after compression is installed. The preserved comparison JSON identifies the original RouteProof workload, while a new replay identifies its supplied current sourceHead.
