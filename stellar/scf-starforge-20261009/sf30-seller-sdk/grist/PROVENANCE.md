# Grist implementation provenance

The Grist modules are an additive MIT-licensed source family for the existing Stellar Forge merchant workspace. Existing source and contribution licenses remain in force. The product does not copy the Grist server or reconstruct its database.

## Existing engines reused

- The original dataset publisher owns plans, extraction candidates, review, publication, schedules and buyer handoffs. Grist supplies publisher/driver.mjs and opens it through openSourceDatasetPublisher.
- The original CSV dataset parser and publisher CSV encoder validate the exact emitted projection.
- The original SF82 store, release compiler, console, generation/instance controls and client exporter own deployment.
- The existing source-authoring model, browser request continuity, retained-file reader and managed Applications patterns come from the reviewed SeaTable authoring lineage (PR117, merge 00ce623cb30e5c6ec73d489a90c4826aaceaf25a), with Grist-specific source and typed-cell contracts.
- The exact staged capture adoption, complete private packet and create-only member recovery follow the reviewed SeaTable provider lineage (PR121, merge d0b5e3f37bb72ced6cf5020f2d77774a0b056bee). The Grist acquisition sequence uses actual Grist endpoints, full responses and history heads; SeaTable SQL/view semantics are not reused.
- Shared distribution, merchant-provider and Applications loaders are consumed through their declared contribution interfaces.

## Primary API sources

Protocol and typed-cell rules were read from the official documentation and exact Grist source revision 6dfae2fa33af6ef057b5de676afc85e6f3026fc6:

- [Official REST API](https://support.getgrist.com/api/).
- [DocApi.ts](https://github.com/gristlabs/grist-core/blob/6dfae2fa33af6ef057b5de676afc85e6f3026fc6/app/server/lib/DocApi.ts), Git blob e4dd07dc6a1a5e195a4aa7abe98b7fcb873e0946: document tables/columns, records, typed response and states routes.
- [DocApiUtils.ts](https://github.com/gristlabs/grist-core/blob/6dfae2fa33af6ef057b5de676afc85e6f3026fc6/app/server/lib/DocApiUtils.ts), Git blob f8ad88b175bc2d036a8846ef6763efc1c5d058df: typed Date/DateTime, Ref, ChoiceList, RefList and Attachments reencoding.
- [gristTypes.ts](https://github.com/gristlabs/grist-core/blob/6dfae2fa33af6ef057b5de676afc85e6f3026fc6/app/common/gristTypes.ts), Git blob 74f5de2a6f43f3def7e5f85a43dd34df092ffaff: typed values and special object codes.
- [DocApiTypes.ts](https://github.com/gristlabs/grist-core/blob/6dfae2fa33af6ef057b5de676afc85e6f3026fc6/app/plugin/DocApiTypes.ts), Git blob 999594b9521eb6f38625f04a10b599716ebf9ab2: visible column metadata.
- [DocState.ts](https://github.com/gristlabs/grist-core/blob/6dfae2fa33af6ef057b5de676afc85e6f3026fc6/app/common/DocState.ts), Git blob 10efdfb5ee2118d5fb4b3b1c2ad602c7d51b1ff4: action number and hash state identity.
- [ActiveDoc.ts](https://github.com/gristlabs/grist-core/blob/6dfae2fa33af6ef057b5de676afc85e6f3026fc6/app/server/lib/ActiveDoc.ts), Git blob 4363a332e49fdefb2bf24ad91b1e5f36f8f0d522: viewer access to recent states.
- [ActionHistoryImpl.ts](https://github.com/gristlabs/grist-core/blob/6dfae2fa33af6ef057b5de676afc85e6f3026fc6/app/server/lib/ActionHistoryImpl.ts), Git blob 5fd394b85a28ac2f29df4155bf2bee7628ede4f2: recent states are ordered by descending action number; the first n/h pair is the observed head. Retained history can be pruned.
- [Official Task Management example](https://support.getgrist.com/examples/2021-01-tasks/), public document URL ID hik1whAV5snj: a candidate real anonymous receiving input.

These sources justify the implemented API contract. They do not substitute for a successful response from the selected deployment. Each native capture retains its own exact request, native status success, response bytes, timestamps and hashes.
