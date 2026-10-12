# Customer operating procedures: application reader adoption

These four reader files are the existing application composer's output after receiving the original 932-section application manuscript, including customer operating procedures in delivery capacity and maintainer handover. The original publication owners can use this retained output when receiving the merged product capability.

## Read the customer workflow

The concise [application](grant-data/application.md) describes the operating procedure in **Maintainable release and support handover**. The detailed [product and finance companion](grant-data/product-and-finance.md) carries **Customer operating procedures and maintainer handover** in the existing capacity chapter. The [source index](grant-data/source-index.json) retains the canonical customer source identities and includes the installed procedure guide. The [reviewer HTML](grant.html) contains the concise application with the existing reviewer entry, saved submission, review round and companion navigation.

The product comes from [PR699](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/699) and [PR750](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/750). PR750 was merged at `f8d1c020c9d5e5c5f5062f8800c94bfd33bb3ad3`. Its installed Planning workspace and `starforge grant-operating-plan` command preserve selected original SF47 work packages in a normal editable OperatingPlan. The original full-history plan can be received by the maintainer, edited with installation-specific instructions and recorded results, and exported as JSON, HTML or Markdown.

## Receive into the existing publication

The original operation is `SCF-GRANT-REVIEWER-PUBLICATION-8910-20261012`, coordinated in the [existing application thread](https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791733597745419). R24C / 25FD maintain the cumulative reader, and 8910 / DD7A maintain the original Site. The four paths below map directly to the same paths under `stellar-forge/developer-site/dist/`:

- `grant.html`
- `grant-data/application.md`
- `grant-data/product-and-finance.md`
- `grant-data/source-index.json`

Use the four-file set together with the existing installed reviewer assets. The retained HTML uses those existing relative routes. The original publisher can receive this exact set or compose the newer canonical manuscript through the same maintained composer when further customer contributions have arrived.

[source-pins.json](source-pins.json) records the exact canonical manuscript hash, input reader source commit, actual composer/projector/delivery module identities and four output Git blobs. The composer was executed as its pure `composeGrantApplication` operation with the original received source-selection steps. Its filesystem wrapper was replaced with in-memory strings; hashing used the existing Commons SHA-256 helper and the original `emn178/js-sha1` implementation. The output bodies retain the original source renderer and source identity logic.

The detailed canonical text is [the original application manuscript](https://tokenjunkielabs.slack.com/docs/T0BRETUB5TK/F0C86PRE5NF). The working source guide is [GRANT_OPERATING_PLANS.md](../../../stellar-forge/developer-site/GRANT_OPERATING_PLANS.md). The native six-package application basis remains $38,000, 400 hours and 150 days; a separately retained alternative keeps its own original terms.
