# Resource reading application and complete handover

Download this delivery as a ZIP and extract it. Open **reading-handover-delivery.html** to read the completed report and download the retained projects. The **application/** directory contains the complete installable research, reading and source-handover product. **resource-reading.tgz** is the exact archive produced by the maintained package builder.

The workspace connects saved research questions and exact source passages to editable reading lists, full originals, reports and returned collections. This delivery includes four complete source documents, five reading items and three saved list revisions. The latest editable edition is **second-reading-return.zip**.

## Install and continue the latest project

Use Node 22.16 or later and Python 3.11 or later. Run these commands from the extracted delivery directory. Choose a new installation and receiving directory for this edition.

```sh
node application/source/stellar/scf-starforge-20261009/distribution/cli.mjs \
  installation install ./application --home ./reading-home \
  --expect-manifest dd73fa706b855d97998bf8252712e5c42cce4613131d6382d0b95f5b56240506

node reading-home/forge.mjs run reading-exchange -- \
  receive-return ./second-reading-return.zip ./received-reading

node reading-home/forge.mjs run reading -- serve ./received-reading/project
```

Open the address printed by the reader. Review the complete originals and exact passages, reorder the list, edit notes and citations, then export a complete project or return. The commands keep Python bytecode out of the installed source so the same installation can be reopened between actions.

The installed command catalog also supplies the original research desk and complete source exchange:

```sh
node reading-home/forge.mjs status
node reading-home/forge.mjs run buyer-research -- help
node reading-home/forge.mjs run reading -- --help
node reading-home/forge.mjs run reading-exchange -- --help
```

[The complete application guide](application/README.md) covers configuration of the original resource library, indexing and saved queries, source-range selection, immutable collection preparation, authenticated delivery, receiving, reading edits, source publication and later returns. The package also supplies the original typed research and exchange interfaces.

## Choose an output

| File | Bytes | Use |
| --- | ---: | --- |
| [resource-reading.tgz](resource-reading.tgz) | 253,274 | Complete original installable application archive. |
| [application/](application/) | 93 source files plus generated package files | Expanded original application, ready for the existing installation manager. |
| [reviewed-reading.html](reviewed-reading.html) | 12,193 | Readable report for reviewed list revision 2. |
| [reviewed-reading.json](reviewed-reading.json) | 15,225 | Structured report, exact source ranges, citations and notes for revision 2. |
| [reviewed-reading.csv](reviewed-reading.csv) | 11,196 | Tabular report for revision 2, preserving original line endings. |
| [sdk-reading-handover.zip](sdk-reading-handover.zip) | 29,766 | Original saved-query handover with all four complete source files. |
| [reading-return.zip](reading-return.zip) | 49,164 | Reviewed list revision 2, complete editable project and reports. |
| [editable-reading-project.zip](editable-reading-project.zip) | 34,083 | Portable editable reading project from the original workflow. |
| [second-reading-return.zip](second-reading-return.zip) | 51,320 | Latest return: revision 3 after cold receive and another edit. |
| [reviewed-original-collection.tar](reviewed-original-collection.tar) | 90,624 | Reviewed collection exported by its original writer. |
| [READING_EXCHANGE_RESULT.json](READING_EXCHANGE_RESULT.json) | 69,531 | Complete research, reading and return application journey. |
| [RESOURCE_READING_DELIVERY_RESULT.json](RESOURCE_READING_DELIVERY_RESULT.json) | 54,357 | Complete installed-product build, receiving and report journey. |

The separate HTML, JSON and CSV files preserve reviewed revision 2. The latest return contains the complete editable revision 3 and its corresponding reports. Each report retains its own list revision.

## Open the project with an existing source checkout

The supplied installation is the direct product path. An existing maintained source checkout can also receive a project with its original Python reader:

```sh
PYTHONPATH=stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python \
  python3 -B -m stellar_forge_buyer.reading_exchange_cli \
  receive-return /absolute/delivery/second-reading-return.zip /absolute/received-reading

PYTHONPATH=stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python \
  python3 -B -m stellar_forge_buyer.reading_cli \
  serve /absolute/received-reading/project
```

## Complete installed result and source

The installed product completed all 16 original native stages on **12 October 2026 at 21:15:45 UTC**, using Python 3.12.14 and Node v24.19.0. The original Git receiver verified 100 complete source/tool files. The maintained builder produced the 93-file product, reopened the same completed build, unpacked and installed its complete archive, reopened the command catalog and launched research, reading and exchange. The installed reader received the actual retained revision-2 return, reopened all four documents and five reading items, and generated HTML, JSON and CSV reports that matched the earlier completed reports byte for byte.

The earlier complete research-to-return workflow finished at **20:00:51 UTC**. It covered the saved-query capture, authenticated HTTP delivery, interrupted download continuation, original receiving and remapping, list edits and reports, collection publication and replay, full return, cold receive, second return and collection archive. Its nine original outputs are included here.

The exact package source is [c9cf3464cf73e3713163022a1bc51a186619374f](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/tree/c9cf3464cf73e3713163022a1bc51a186619374f). The complete exchange is merged in [PR480](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/480), the full product selection in [PR521](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/521), the documented research help command in [PR562](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/562), and the repeatable installed Python launches in [PR590](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/590), merged as `1052eae93fc4aedfca2728c0ebdeaff5c5e3513a`.

Archive SHA-256: `d5d2f93d3f715eadbee056f5d92b8d4abca7619927088e5eda67e1a942e550af`.
The archive's original builder name is `tokenjunkielabs-starforge-merchant-0.1.0-source.gc9cf3464cf73.selection.resource-reading.tgz`; the delivery name is **resource-reading.tgz**, with unchanged bytes.

The expanded [application manifest](application/manifest.json) lists every original package source path, byte count, SHA-256, Git identity and mode. **SHA256SUMS** covers the complete delivery. The standalone viewer verifies each embedded reading file before downloading it.
