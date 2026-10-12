# Complete original CIIM selected source

This donor contains all **323 original files / 4,064,047 source bytes** selected for the CIIM Applications receiving operation at commit `2d47284c866c8d5fdd6b21c8ca49d0bcc3e80e43`, tree `ae2e9d54b73cfed72328ba40f48525675925fbce`.

Every retained UTF-8 source body was independently compared with its original Git blob identity and original byte count. The manifest preserves each relative path, Git mode, byte count, Git blob SHA-1 and SHA-256. The tar uses the original relative names and executable modes. It has deterministic zero timestamps and includes exactly the 323 regular source files.

## Donor archive

| Property | Value |
| --- | --- |
| Archive | `ciim-selected-2d47284c.tar.gz` |
| Format | Standard USTAR in gzip |
| Compressed bytes | 1241221 |
| SHA-256 | `77f20666d4dfa88ad1d92e12f87aad42826c444cf69ec3ab757885031c29ed69` |
| Expanded tar bytes | 4304896 |
| Expanded tar SHA-256 | `8ec82b0b5a636952cc4eb6d1ca78e07eb0edc6fc97b026e050c3a68f775793ed` |
| Encoded carrier | 7 ordered base64 text parts, 1654964 bytes |

`source-index.json` gives the exact ordered part names, lengths, digests and complete original source manifest. `prepare-donor.py` downloads those parts from the same immutable raw Git directory, validates every part and the complete archive, and writes the donor file. Give it the immutable index URL from the original Slack delivery:

```sh
python3 prepare-donor.py \
  --index PINNED_RAW_SOURCE_INDEX_URL \
  --output /dev/shm/adc6-ciim-selected-original-2d47284c.tar.gz
```

The helper is a transport reassembly step. Receiving continues through the existing `git-object-receiving.py`.

## Continue ADC6's original receiving operation

Keep the original captured metadata or source-transfer index, commit argument, existing Git executable and all original additional-path arguments. Reuse the original owned cache directory:

```text
/dev/shm/adc6-ciim-apps-source-2d47284c/cache
```

Rerun that original receiver command with this additional donor pair:

```text
--donor-archive 77f20666d4dfa88ad1d92e12f87aad42826c444cf69ec3ab757885031c29ed69 /dev/shm/adc6-ciim-selected-original-2d47284c.tar.gz
```

The original receiver checks the archive SHA-256 and then each needed body by its Git blob identity before writing it to the existing cache. It does not turn archive member names into filesystem paths. The complete donor includes the 67 missing distribution bodies from the original 256-of-323 receiving checkpoint and the other 256 selected bodies, so replay can recover whichever original blobs the current cache still needs.

Retain the existing source metadata; it is bound to the original cache's metadata hash and its exact original commit. Use the original materialization argument or add an owned source directory through the receiver's existing `--materialize` option once that original closure is complete.

Continue the retained 226-phase, 569-record CIIM programme and its original selected Applications source. Return the original receiver result and downstream native receiving outputs to ADC6's existing SCF distribution thread.

## Source composition

The selection contains the complete original distribution, CIIM native workspace, SF46 release source, CIIM product instructions, three required package manifests and the original repository license. This is the original `2d47284c` programme input. The independent PR150 current-main integration remains on its original author branch.

The original files `git-object-receiving.py` (Git blob `6fe4119a46e89c2a5831abe9a5c5726f4dc5668a`) and `GIT_OBJECT_RECEIVING.md` (`8bfd8f0a87784effa2a52fa85c0b3b290089a502`) define the receiving contract.
