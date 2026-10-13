# HILA round review operator

A complete source-bound workflow for an approved pair of HILA survey editions: original questionnaire and provenance, explicit field mapping/scoring/disclosure configuration, denominator and coverage comparison, named analyst review, offline HTML/CSV/JSON and independent portable receiving.

The complete operator guide and exact field/scoring contract are:

- ../../stellar/scf-starforge-20261009/sf30-seller-sdk/hila/README.md
- ../../stellar/scf-starforge-20261009/sf30-seller-sdk/hila/METHODOLOGY.md

The source-owned recipe is ../../stellar/scf-starforge-20261009/distribution/selections/hila-operator.json. It uses the original builder, package installer and Applications lifetime. Its provider discovers the private HILA workspace and selected Python through the original source/workspace binding.

The command is dataset-hila. The typed client is ./seller/hila/client. Requests remain caller-owned; accepted records retain their complete input and original native result for exact replay.

The product supports one agreed questionnaire, one or two approved anonymised editions, at most 100,000 combined rows and 100,000,000 combined uncompressed source bytes. All five dimensions and four published breakdown fields are retained. Composite scores and public release require the supplied approved configuration; unconfigured reviews retain raw distributions and explicit missing/branch states.

The CartONG/HILA commercial case remains with its original company/contact owner. A product source release does not assert that respondent editions have been supplied, approved, scored or publicly released. Actual receiving is recorded by the full native operation and complete output manifest.
