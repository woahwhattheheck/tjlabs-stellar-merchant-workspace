# Original grant portfolio source

The standalone product adopts the complete grant portfolio implementation merged into
[public-commons-sprint-2026 PR2067](https://github.com/woahwhattheheck/public-commons-sprint-2026/pull/2067).

| Source | Selected identity |
| --- | --- |
| Original reviewed grant portfolio commit | `0fb1b5ad2b4d65a2d0ff8feb1fd4e5cc2d73df5d` |
| Public source merge | `111978b78141de5961c8a279097cf4fe09f40509` |
| Native console recovery merge | [`ffa4b25534fab014c34fdadce42c92094c8a1e35`](https://github.com/woahwhattheheck/public-commons-sprint-2026/pull/2155) |
| Original complete Comic Relief journey | Git blob `8c496521ba2ca95a8a8bf975fa497473dacabd5c` |
| Complete native source declaration | `sf30-seller-sdk/grant-portfolio/source-files.json`, 77 files with the current publisher runtime |
| Current adopted 360Giving publisher | Git blob `df289ac59e7642124a07a03253b3b5d197b933d4` |
| Current adopted 360Giving publisher workspace | Git blob `c56ab6345693be9dec9ff48aeea0ca5093513f4e` |
| Complete dataset reader used by that source | Git blob `5f6e0c0e813b162f3514e8483c11313775e9b6e6` |

The original core folder and its contribution remain complete. The standalone adoption
also corrects stopped-owner connection recovery in the original managed binding, CLI,
console and Applications launch: the existing workspace lease owns reclamation, and a
complete new launch is published atomically. Failed startup also closes every started
thread and its original connection, including a writer started before an HTTP thread failure. The source declaration
also carries the original IATI source and workspace, native XML and NDJSON receiving
engines, all 37 current 360Giving publisher files required by native projection and
portable receiving, and its exact-number JSON reader. The current publisher's typed
client, declaration, Python client, managed binding and expanded runtime selection are
preserved from the standalone repository's concurrent publisher adoption. The publisher
also retains the official 1.4.2 schema by its captured URL when that schema has no `$id`. The dataset reader retains its existing source validations and its
explicit unquoted-empty CSV null encoding.

The product layer adds preparation, installed receiving and operating guides over those
engines. Its distribution selection uses whole source-owned contributions:
`grant-portfolio`, `grant-portfolio-product` and
`merchant-provider-tools`. It includes the existing Runtime workspace,
Applications launcher, source verifier, installer and merchant interfaces.

The original managed binding verifies the workspace UUID, directory and database
identities, interpreter and declared source files. Each installed release's normal
manifest provides the actual complete selected source inventory. Customer portfolio ZIPs
retain the original native source closure alongside all source packets and history.

The public source input recipe records the original Comic Relief publisher locations,
registry IDs, captures and converter inputs. Private acquired input files and customer
workspace data remain in their selected working/delivery directories.
