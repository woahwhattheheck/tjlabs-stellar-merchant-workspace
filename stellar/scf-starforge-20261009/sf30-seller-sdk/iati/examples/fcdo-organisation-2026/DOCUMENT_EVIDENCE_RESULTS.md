# Document-evidence operating results

These two JSON files are the exact completed result bytes from the original public FCDO example, operation `iati-document-evidence-original-ods-20261012`. They provide a public source reference for the operating claim without publishing the editable workspace archive.

| Result | Bytes | SHA-256 |
| --- | ---: | --- |
| [Native result](document-evidence-native-result.json) | 1,585 | `58265f78ace6fa72b57d6ebe3148d7f174e929f452eefeda1a0e47351d61d2a9` |
| [Connected result](document-evidence-connected-result.json) | 6,667 | `c16aa09d5ad61a6fcae13cbcbdb022f95b2c2848527ab764fc85fba7b5db2acb` |

The native journey used the original 99,013-byte [FCDO organisation XML](organisation.xml), SHA-256 `c18e63db2d543eaeb5525a4df21cd16561f0316dab831789bfdd176e1accdfce`. It inventoried 80 published document rows and selected two. The saved sender reached revision 5; an independent recipient reached revision 6 and retained its later note after replay.

The original observations remain explicit in the native result: the first was unreachable; the second refused a literal URL containing trailing whitespace. Neither result claims a completed public document body. The completed operating journey covers request reservation and historical replay, named review, correction preparation, comparison, full packet export and independent receiving, including those unsuccessful observations.

The connected result records the original SDK and Merchant file descriptors and complete hashes, prefix release followed by full export reopening, reopening after the Merchant instance closed, and browser observations of all six desktop views plus two 390-pixel mobile views with no page errors. Its screenshot names and hashes are retained evidence references; the images themselves are not published here.

The native and Merchant ZIP hashes differ because they are separate complete ZIP containers. Each descriptor identifies its own exact bytes. The connected result verifies the Merchant container through both reopen operations.

The accepted runtime source manifest for this original journey is `121cf5f421b6fb6fc54bfdb93d723bbffe084b620f0865e90c00548ddf4a827d` (226 declared files). These JSON outputs remain historical records when the following source is installed.

The [following-observation programme](../../document_evidence/FOLLOWING.md) continues from the same recipient revision 6 with one explicitly acknowledged new observation, carries the full existing review decision set, and requires a complete nonempty body before its next receiving result can be complete. Publishing that programme does not assert that this following acquisition has run.

See the [operator guide](../../DOCUMENT_EVIDENCE.md), [original receiving guide](../../document_evidence/RECEIVING.md), and [following input example](document-following-input.example.json).
