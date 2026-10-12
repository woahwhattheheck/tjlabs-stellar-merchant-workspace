# Original IATI organisation source dependencies

This source packet retains the original IATI 2.03 organisation schema, both required schema dependencies, the complete referenced code lists and their original licences. It is the support input for the original IATI-ORGANISATION-BUDGET-OPERATOR-20261012, selected on 12 October 2026. The publisher XML and dated methodology are separate original inputs, acquired by the same source owner.

## Original revisions

- IATI/IATI-Schemas: b4ead00528d3785b336d9847928274c207704deb, version-2.03, commit dated 7 September 2026.
- IATI/IATI-Codelists: e83832716be342b63e7b9fb9cb694220bd3551b2, version-2.03, commit dated 4 August 2026.
- IATI/IATI-Codelists-NonEmbedded: a858b66454a8fffa0df63c00044dfaf4832bfb09, master, commit dated 28 September 2026.
- IATI/IATI-Guidance: c29746d079335eba5bce7bed4b1e7eaba47461a3; en/license.rst blob f5512ded149cc4a53733d62a7851f3a0c725a99b.

Each original file was read through the connected native Git file action. Its complete UTF-8 bytes reproduce its upstream Git blob identity. Source revisions were observed on 12 October 2026; they are immutable input pins, rather than a claim that a moving branch will remain unchanged.

## Use

Keep schema/iati-organisations-schema.xsd, schema/iati-common.xsd and schema/xml.xsd together. Resolve those exact local dependencies with network access disabled during validation. No activity schema or substitute organisation sample is needed.

The original core mapping.xml is included without edits. The small organisation-codelist-map.json selects its relevant mapping elements for convenient inspection. Country and Language carry complete="0"; the model must preserve that distinction. DocumentCategory's original category-list dependency is retained. codelist.xsd and its original xml.xsd dependency are present for source-format validation.

## Attribution and source licences

Attribute the standard as “IATI Standard (http://iatistandard.org/)”. The original IATI guidance applies CC BY4.0 to its text and machine-readable output. It explicitly excludes descriptions in externally sourced codelists from that grant. Preserve the external provenance and original metadata in Country, Currency, Language, FileFormat and Region; do not describe their external descriptions as universally relicensed by IATI. The repository MIT licence applies to software, and its own opening lines refer data users to the IATI guidance licence.

The W3C namespace schema is the exact supplementary file supplied by IATI, including its original documentation and persistent version URLs. This packet keeps original source text and records actual hashes; it adds no new codelist descriptions, provider calls, schema engine or financial interpretation.

Native product ownership remains with actions_cost; root owns the original application, CLI, HTTP, MCP and Applications integration. This source packet does not claim publisher validation or an Aid Transparency Index score.
