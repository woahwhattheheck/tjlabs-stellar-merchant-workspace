# Receive original Nordea and Goldman Sachs CAMT statements

Operation: `SCF-BANK-CAMT053-SOURCE-DFF77-20261013`  
Edition: `NORDEA_AND_GS08_20261013`  
Application: Merchant PR964, immutable `933219ca2f66ebbaf28d5a7ef69cefe278de2a98`.

The complete case receives eight retained Nordea bank-issued XML examples and three Goldman Sachs published XML examples through the maintained application. It preserves the earlier Nordea operation and adds complete-period closes, original accountant exports, the zero-entry account, replay and cold reopen.

## Run

Use Python 3.9+, Node 22+, Git with HTTPS access to the public Merchant repository, and a writable artifact directory. The receiver opens its own loopback HTTP server and private accounting workspace.

```sh
python3 receive.py --artifacts /absolute/path/camt053-artifacts
```

Optional expanded-runtime location:

```sh
python3 receive.py --artifacts /absolute/path/camt053-artifacts --temporary-directory /absolute/path/private-runtime
```

The launcher verifies the five configuration/programme/guide files against `receiving-manifest.json`. The producer obtains the exact application commit through ordinary Git, expands the original import/browser-asset closure, verifies every selected Git blob and all thirteen CAMT postimages, and runs the original source and application programmes.

Accept this edition under the existing SCF operation claim before running it. An owner already running the earlier `6311d372` edition finishes and preserves that invocation first. This edition is the same operation's continuation. RD12 revision87/browser receiving keeps its existing owner.

## Original inputs

The configuration retains all eight actual Nordea ZIP byte strings, retrieval URLs/hashes and member names. XML is extracted unchanged. The GS inputs are complete issuer-published XML code blocks from retrieved HTML representation; all code lines and matching overlapping retrieval windows are preserved in the provenance. Published code-block text is distinguished from original HTTP response bytes.

| Original source | XML bytes | Expected source outcome |
| --- | ---: | --- |
| Eight Nordea standard/extended DK/FI/NO/SE | 109,613 combined | Seven reports, 47 cash entries/66 details; Denmark extended presentation-hyphen error remains |
| GS structured remittance | 14,926 | Original unclosed AdrType before PstlAdr returns CAMT_XML_CLOSE |
| GS CBPR | 14,015 | One USD statement, two entries/details; partial-page and INTM balance cannot close |
| GS itemized EU | 56,930 | Three EUR statements, thirteen entries/details, including zero-entry account; all complete pairs tie out |

The two readable GS files contain four statements, fifteen cash entries/details and five original reversal flags. Each Ntry supplies one cash amount/direction; transaction details remain attached. The original cash −10/detail50 warning remains visible with cash −10. The Finland Extended Nordea closing remains 491.49 against calculated491.99; all seven readable Nordea files omit FrToDt and retain their closing-period issue.

The three maintained donor examples remain separately labelled. Previously configured additional Bundesbank acquisition remains optional; its failure is captured and never replaces the eleven retained issuer inputs.

## Operating course

For every readable issuer source, the actual CLI prepares the complete original request. HTTP and the typed client preview the full source, create/reuse the original account identity, receive every statement, replay the same request ID without another revision and recover the saved operation. Downloads must reproduce original XML and the entire report. Source amounts, statuses, original byte ranges, metadata, balance pairs, pending/excluded rows and issues are compared with the unchanged reader.

Ineligible balance pairs retain the original API's BANK_CLOSE_SOURCE_REQUIRED outcome. Both malformed originals preserve their exact error and source bytes. The source-only intake checkpoint records zero customer receipts and zero bank matches.

The subsequent itemized-GS phase uses explicit `applicationCloseReviews` in `source-config.json`. These operating-case clearing decisions are separate from issuer data: each TRANSFER posting is bound to the original row ID, signed amount, bank reference, direction/reversal and source pointer. SAMPLE-CLEARING identifies the operator classification; original SEPA/payment/return types remain in the source. No sample counterparty is assigned to an invented customer or invoice.

| Original account | Exact period | Opening EUR | Closing EUR | Entries |
| --- | --- | ---: | ---: | ---: |
| DE67514304104000000062 | 2024-11-05 | 103,038.00 | 103,228.00 | 3 |
| DE35514304105000003029 | 2024-11-05 | 687,717.96 | 689,229.56 | 10 |
| DE29514304108000023890 | 2024-11-05 | 4,200.00 | 4,200.00 | 0 |

Thirteen original entries receive thirteen explicit clearing postings. Each account closes using its original eligible balance-pair ID and exact period/amounts. Close replay and request recovery retain the same records. Every accountant TAR is downloaded, its full manifest checked and its original XML recovered. The zero-entry close must include its source import despite having no cash rows. It is then reopened and replaced with a linked successor, retaining the original close and reopening event.

After server/writer shutdown, the same durable workspace is reopened. All original imports, reports, source metadata/rows and requests must remain unchanged. All four retained close TARs are compared byte-for-byte by digest and length, with reopened/successor state and original source identity retained.

## Outputs

The artifact directory retains a complete ZIP, JSON result and transfer receipt. The ZIP includes original inputs/provenance, full source reports, selected application source/dependency manifest, CLI requests, application results, saved accounting workspace, accountant exports and complete logs. The result and transfer receipt identify actual outcomes and original bytes/hashes.

Archives are written on disk and hashed by streaming. Only the invocation's expanded private runtime is removed after artifacts are written. No private helper, signed URL or upload reservation is required. Keep the files for the receiving owner to save and report.

Completion requires process exit0, source-reader failures0 and `application.result.completed: true`. The two expected malformed inputs are SOURCE_REQUIRES_REVIEW with their exact codes. Any different error retains the full capture and returns nonzero. Report actual artifact paths, hashes and application outcome in the existing SCF operation thread.

## Source references

- [Nordea Corporate Access](https://www.nordea.com/en/our-services/corporate-access?translation=da); exact issued ZIP URLs and retrieval identities are in source-config.json.
- [GS structured remittance](https://developer.gs.com/docs/services/transaction-banking/camt-053-v8-struct-remi)
- [GS CBPR](https://developer.gs.com/docs/services/transaction-banking/camt053-cbpr-sample)
- [GS itemized EU](https://developer.gs.com/docs/services/transaction-banking/camt-053-itemized-eu-txn)
- Previous complete receiver: Merchant blob6311d372e31e830efe540e97f1473e38c16f1538.
- Complete GS source/result carrier: Merchant blob8bb8e96629f7497dc44ef82cf04e2f2071801f95.
- Thirteen merged application postimages: Merchant blob9a24b53ce4632e2134c58164d90c0233429299b4.

Issuer examples retain their original attribution and provenance. Receiver source uses the repository's existing source license.
