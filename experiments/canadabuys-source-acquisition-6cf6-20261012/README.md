# CanadaBuys awards and supply arrangements: complete issuer source

This source delivery joins the original `SCF-CANADABUYS-PROCUREMENT-9FCD-20261012` product. It supplies both complete Open Government resource catalogs, both complete issuer dictionaries, the source-support page and the April 2026 restructuring notice, together with one original-file receiving command.

The native receiving command downloads the complete current awards and SOSA files, preserves every original response byte and header, counts complete CSV records, and selects an actual row with useful agreement, supplier and contract identifiers. The same private operation retains completed source captures across another invocation.

## Receive the original files

Run this command on the existing CanadaBuys source reader, using a persistent directory for that same operation:

```sh
python3 experiments/canadabuys-source-acquisition-6cf6-20261012/receive-original-csvs.py \
  --directory /actual/private/canadabuys-source-operation
```

The program uses Python 3's standard library. It streams whole files, handles quoted multiline descriptions and UTF-8 byte-order marks, raises the CSV field-size limit for the issuer's long descriptions, preserves numeric text and source identifiers, and checks actual columns against the complete issuer dictionary. It retains the original HTTP body separately when content encoding requires decompression.

Return the entire operation directory: the two complete `originals/*.csv` files, their original HTTP bodies, `source-receiving.json` and the six complete issuer source files under `issuer/`. The result records the requested and final URLs, HTTP status and original headers, capture times, body/CSV sizes and SHA256s, ordered columns, row counts and one complete original sample row for each source.

The current source catalogs and dictionaries below have already been received in full and their byte identities are recorded in `source-manifest.json`. The command completes the large original CSV receiving on the existing native source host.

## Exact current source selection

| Source | Issuer resource |
| --- | --- |
| Complete current awards | [All CanadaBuys award notices, 2022-08-08 onwards](https://canadabuys.canada.ca/opendata/pub/awardNoticeComplete-avisAttributionComplet.csv), resource `ff4414ba-7d0b-40a4-8bd0-d102e83d9f32` |
| Active standing offers and supply arrangements | [Active SOSA CSV](https://sosa.canadabuys.canada.ca/cds/opendata/tpsgc-pwgsc_ocama-sosa.csv), resource `e5dcaf48-87d6-4ce1-b17a-35607916b640` |
| Awards catalog | [Complete issuer catalog](https://open.canada.ca/data/en/dataset/a1acb126-9ce8-40a9-b889-5da2b1dd20cb), 12 published resources retained |
| SOSA catalog | [Complete issuer catalog](https://open.canada.ca/data/en/dataset/f5c8a5a0-354d-455a-99ab-8276aa38032e), two published resources retained |
| Shared procurement dictionary | [CanadaBuys XML](https://donnees-data.tpsgc-pwgsc.gc.ca/ba2/ac-cb/achatscanada-canadabuys-dd.xml), 60,478 original bytes, 67 heading groups and 106 exact labels |
| SOSA dictionary | [SOSA XML](https://donnees-data.tpsgc-pwgsc.gc.ca/ba2/ac-cb/ocama-sosa-dd.xml), 8,064 original bytes, 14 heading groups and 19 exact labels |

The current awards catalog identifies five fiscal-year files, the full current file and the legacy file, alongside its dictionaries and supporting documents. The complete file begins with the CanadaBuys system-of-record transition in August 2022. The catalog separately retains the older legacy source and describes its refresh. The [issuer's procurement catalog](https://canadabuys.canada.ca/en/procurement-and-contracting-data) links these two datasets directly.

## Tender-to-award linkage

Keep the exact `solicitationNumber-numeroSollicitation` as the explicit joining candidate. The issuer says solicitation numbers remain consistent across historical/current records, whereas reference numbers can change. Retain each original reference number, contract number, source row and amendment independently so a proposed link can be inspected. Several awards or amendments can belong to the same solicitation. [Issuer support](https://donnees-data.tpsgc-pwgsc.gc.ca/ba2/ac-cb/soutien-support-eng.html)

The procurement dictionary describes amendment numbers as sometimes alphanumeric. Preserve `000`, leading zeros and every original string; a numeric cast can merge distinct source values. Separate the award date, publication date, amendment date and retrieval time. ABE-origin award notices can appear up to a month after the underlying award, so absence from a newly captured file cannot establish that the procurement has no award. [Dictionary](https://donnees-data.tpsgc-pwgsc.gc.ca/ba2/ac-cb/achatscanada-canadabuys-dd.xml) · [Source synchronization guidance](https://donnees-data.tpsgc-pwgsc.gc.ca/ba2/ac-cb/soutien-support-eng.html)

The CSV collection covers federal organizations. The public CanadaBuys website includes additional levels of government; a website result and this federal dataset can therefore have different scope. English and French fields belong to one original row. Preserve the source-native paired labels and multi-valued fields through source review, edition comparison and export. [Current awards catalog](https://open.canada.ca/data/en/dataset/a1acb126-9ce8-40a9-b889-5da2b1dd20cb)

## Amounts and the 2026 source revision

`contractAmount-montantContrat` is the awarded contract's monetary value including taxes, expressed in `contractCurrency-contratMonnaie`. The issuer defines a missing/null currency as CAD. Preserve the raw currency field and distinguish that source-based display default. `totalContractValue-valeurTotaleContrat` is the cumulative original-plus-amendment value. Keep exact decimal strings and these separate meanings when constructing summaries. [Dictionary](https://donnees-data.tpsgc-pwgsc.gc.ca/ba2/ac-cb/achatscanada-canadabuys-dd.xml) · [Currency guidance](https://donnees-data.tpsgc-pwgsc.gc.ca/ba2/ac-cb/soutien-support-eng.html)

The issuer restructured awards and contract-history CSVs from March 17 to April 10, 2026. It added `instrumentType-typeInstrument-eng/fra` and `amendmentType-typeModification-eng/fra`; corrected date usage, original `000` amounts and repeated amounts on administrative changes; and removed specified administrative duplicates, placeholder suppliers, catalogue purchases, individual standing-offer call-ups and individual task authorizations. Retain the complete notice with historical comparisons so a changed row count can be explained by that source revision. [April 10, 2026 notice](https://donnees-data.tpsgc-pwgsc.gc.ca/ba2/ac-cb/COsoutien-CHsupport-eng.html)

The current dictionary and awards catalog use **SRVTGD** for Services Related to Goods. The older support page prints **SVRTGD** in part of its examples. The source contract records this discrepancy and selects the current dictionary's label. The current catalog also describes monthly legacy/earlier-year refresh; its current wording replaces the older support page's historical-file schedule. Both complete originals are retained. [Current dictionary](https://donnees-data.tpsgc-pwgsc.gc.ca/ba2/ac-cb/achatscanada-canadabuys-dd.xml) · [Current catalog](https://open.canada.ca/data/en/dataset/a1acb126-9ce8-40a9-b889-5da2b1dd20cb)

## Supplier and workshare qualification

SOSA's `agreement-number` identifies the original standing offer or supply arrangement. The source distinguishes agreement type, start date, expiry date, commodity and delivery region. These are the source facts used by the existing product's qualified-workshare review. The dictionary defines `award-date` as the agreement's start date. [SOSA dictionary](https://donnees-data.tpsgc-pwgsc.gc.ca/ba2/ac-cb/ocama-sosa-dd.xml)

Keep all three supplier identities: legal name, operating name and standardized name. Standardized names group closely related suppliers for searching; the original legal and operating names remain available. A matching standardized name therefore produces a reviewable relationship candidate. The source may contain several agreements, commodities or delivery facts for related suppliers. [SOSA dictionary](https://donnees-data.tpsgc-pwgsc.gc.ca/ba2/ac-cb/ocama-sosa-dd.xml)

The issuer uses delivery codes `FD` (Foreign), `NA` (National—Canada) and `NC` (National Capital) in addition to ISO 3166-2 regions. Preserve those exact source extensions. The catalog says SOSA is updated weekly and describes businesses currently holding standing offers or supply arrangements. [SOSA catalog](https://open.canada.ca/data/en/dataset/f5c8a5a0-354d-455a-99ab-8276aa38032e) · [Dictionary](https://donnees-data.tpsgc-pwgsc.gc.ca/ba2/ac-cb/ocama-sosa-dd.xml)

## Integration into the existing product

`source-contract.json` contains every exact bilingual dictionary label, complete original descriptions, declared data types and published patterns, plus the two issuer-selected CSV inputs. Published patterns are preserved as source text for the existing importer to review. Actual CSV columns and row counts are produced from the full native input.

9FCD retains `sf30-seller-sdk/canadabuys/**`, the original source/edition/review authority, CLI/client/MCP and distribution. Its existing operator builder retains the complete industrial application. This source acquisition feeds that same workflow: original refresh → bilingual notice/amendment review → explicit tender/award/SOSA link → deadline and qualified workshare → complete report and portable receiving.

Original source request and receiving: https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791820853023629?thread_ts=1791730220.899469

Source-acquisition claim: https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791821192578209?thread_ts=1791730220.899469

The source datasets identify the [Open Government Licence—Canada](https://open.canada.ca/en/open-government-licence-canada). Retain the original issuer URLs and source attribution with exports.
