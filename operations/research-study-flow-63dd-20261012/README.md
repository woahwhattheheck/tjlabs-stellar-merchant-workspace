# Study Flow — original retained-source operation

This is one resumable operation over the original Research dossier APIs. It consumes the two unchanged Crossref RIS response documents already acquired by the original Research source owner. It makes no provider request and does not invoke the separate RIS or NCT commissioning programmes.

## Run and resume

Use the current complete source checkout and an existing Node executable:

```sh
node operations/research-study-flow-63dd-20261012/native-operation.mjs \
  --source-root /absolute/source/root \
  --out /absolute/retained/operation \
  --original-source-packet /absolute/source/root/operations/research-study-flow-63dd-20261012/original-ris-http-responses.json \
  --source-pin a160ec7708b261e3de3095d568e82356e18e0733
```

Run that same command and output directory after an interruption. The programme retains each exact request before its native transaction and reuses accepted operations. Dossier creation and question creation reconcile their retained identity before another call. The same source packet hash and source root remain bound to the operation.

The source packet is 6,578 bytes with SHA-256 a468739354d5b543712b583226f934dc63bbba29769d2c327df4c54876174413. Its documents are the original HTTP 200 responses for DOI 10.1093/nar/gkad1088 and DOI 10.1093/nar/gkad1085, received by the original source owner on 2026-10-12. Complete original bytes, request URLs, observed headers and capture times are retained. Absence of an observed content-type or licence header is preserved.

## Actual completed scope

The first original operation completed at 2026-10-13T00:05:44.267Z through the native dossier store, with process exit 0. It created 15 saved revisions containing the original source edition, an explicit single automated metadata review, two decisions and resolutions, two reporting flows and three reporting editions.

The question is deliberately limited to which of the two original bibliographic titles specifically names Europe PMC in 2023. The Europe PMC record meets that title rule; the broader EMBL-EBI record is excluded under the declared rule. This is metadata screening. Full-text retrieval, underlying study identity and complete literature-search coverage are not inferred.

The known record counts are two screened and one excluded. The update report has zero arithmetic errors and keeps eleven active counts unknown. Its reporting-complete field remains false, with seven explanatory warnings. The review workflow accepts that explicit source-limited report without labelling the missing observations as zeros.

The same operation:

- Recovered the exact first save request without adding another revision.
- Imported a BOM-prefixed, quoted-header CSV containing the three observed native record counts, preserving its original bytes.
- Saved a second reporting edition against the first source snapshot.
- Created an update linked to the actual preceding reviewed edition.
- Exported both current reports as JSON, SVG, HTML and complete counts/records/reports CSVs.
- Exported the complete 781,840-byte native portable dossier.
- Reopened that same portable into a new directory, preserving all 15 revisions, recovering the original save request, and matching the original SVG bytes.

The original portable SHA-256 is 8a449993322b94f1b8124a1419096a316543e6d868d586f1825d29a113b9b7b5. The received update report SHA-256 is 958d79a60191b98731862648418d2a94e543be21cda07b28c78f4633732c1f23.

## Outputs and further operator use

`operation.json` retains phase and request recovery. `result.json` describes the actual result. `requests/` contains complete original native request bodies. `exports/workspace.research.json` is the complete portable. `exports/reviewed-metadata/` and `exports/reviewed-update/` each contain six original report files. The original receiving directory is `receiving/dossiers/`.

The initial operation uses the native API and does not start Chromium. Any browser continuation should attach to this same saved dossier and current flow IDs from `result.json`; it should not replay source acquisition or create a replacement dossier. The full product retains its original authenticated Research server and Study Flow browser tab.
