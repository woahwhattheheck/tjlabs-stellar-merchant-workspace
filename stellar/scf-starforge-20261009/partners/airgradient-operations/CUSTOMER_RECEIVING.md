# AirGradient complete customer receiving

Open the complete customer handover with Python 3.12 or later and Node 22.16 or later, with `node:sqlite` available. The included AirGradient operator uses Node's standard libraries. Select a canonical absolute private customer directory whose parent exists:

```sh
python3 customer-start.py --directory /absolute/private/airgradient-customer --serve
```

Use `--node /absolute/path/to/node` when Node is outside PATH. The launcher verifies the full included source SDK and both editable packages, receives them through the original command and opens the private customer URL printed by the operator. The first opening selects the retained indoor project. Keep the same receiving directory to continue work; later openings preserve its current saved project, later report editions and other verified source collections. The required original collection is checked by its exact packet identity. A repeated opening reuses the original receiving records. Allow at least 1 GiB of free memory for the full retained report operation; the launcher selects a 384 MiB Node heap.

## The complete retained installation

The original source operation is `AIRGRADIENT-API-SOURCE-6A62-20261013`. Its full 1,939,630-byte source packet has SHA256 `5465e53d831cedae734f9f4225b97fc683ea49eed038190c80271ff01fa1d99f`: 41 original files, 1,688,975 source bytes and twenty actual locations. It supplies the full September 12–October 13, 2026 UTC span. The first report selects September 12–October 12; the later report selects September 13–October 13. Both use 720 possible hourly bins per location and half-open UTC periods.

| Retained selection | Locations | Measurements | Rows per period |
| --- | ---: | --- | ---: |
| Original mixed project | 10 outdoor + 10 indoor | PM2.5 | 20 |
| Complementary indoor project | 10 indoor | PM10, temperature, relative humidity, CO₂ | 40 |
| Complete customer scope | 20 | Outdoor PM2.5 and all five retained indoor fields | 60 |

The second project retains the original organisation, owner, source collection, indoor labels and timezones. Its first and later reports have their own explicit plans and baseline. Both projects remain editable and retain their complete source and receiving histories.

The sixty rows contain 37,015 populated hourly bins initially and 37,144 later. The outdoor counts are 7,007 and 7,022; the indoor counts are 30,008 and 30,122. Six retained indoor PM10 series have no values in either period. Their report rows remain `NO_VALUES`. The later-starting indoor history and other gaps remain visible in coverage and `REVIEW_GAPS` readiness. Zero task issues means the complete retained selection was interpreted; coverage and values describe the actual provider data.

The full collection retains its original reader, content basis and retrieval window. Source contracts, original decimal strings, nulls, source type, provider IDs, source URLs and licences remain attached to their actual sources. Report means use the original equally weighted returned-bucket interpretation. Customer thresholds are empty in this commissioning case.

## Continue the saved customer work

Open **Continue a received study**, choose the intended saved mixed or indoor study, then choose **Use received project**. Its project, prior report, source plan and collection are selected together. Choose a contained reporting period from the retained source, review the complete report, and commit the next edition. Change a customer label, project note or operating criterion by saving its next project revision. Frozen reports and their sources remain available.

The report dropdown contains the first and later editions for both selections. Each report can download standalone HTML, report JSON, summary CSV, full series CSV, editable JSON and its complete receivable ZIP. **Saved customer destinations** reopens the exact completed receipt and file bytes. A new edition uses its own canonical private destination directory.

The handover includes both complete editable packages, all four report deliveries and ZIPs, the original source packet and settings, complete native producer and receiver workspaces, exact native results and the source-selected SDK. Open `operation/current-reports/index.html` for the current standalone presentation of all four frozen editions, including their full summary and series CSVs and original report JSON. The completed original destinations retain their accepted file bytes. `CUSTOMER_EDITION.json` records their identities. `FILES.json` records every included file's byte count and SHA256. The independent receiving directory created by the launcher is the customer's continuing workspace. The retained native workspaces preserve the original operating history and the originally selected destination paths.

## Installed Applications

The `airgradient-customer` source selection includes the maintained runtime controls and the source-owned AirGradient Applications provider. With that selected SDK's READY runtime attached in the existing runtime workspace, open **Applications**, choose **AirGradient customer operations**, select the continuing private customer directory, and use **Review → Save → Review Start → Start → Open**. **Stop** drains the original customer process. The provider verifies the actual listener, workspace ID, configuration digest and retained startup record before Open.

## Build and run the full original programme

Build the exact public source selection through the maintained builder:

```sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-git-checkout --ref EXACT_COMMIT \
  --selection airgradient-customer --out /absolute/private/airgradient-sdk
```

The complete native programme continues the original two-workspace operation, preserves its twenty-location PM2.5 editions, operates all four additional retained indoor fields, receives the real initial ZIP in the original receiver, commits its later baseline edition, returns that package to the original producer, reopens both original customer destinations and cold reopens the full receiver:

```sh
node stellar/scf-starforge-20261009/partners/airgradient-operations/examples/complete-customer-receiving.mjs \
  --input /absolute/private/original-native-input.json \
  --project /absolute/private/customer-settings.json \
  --output /absolute/private/airgradient-original-customer
```

Input files have mode 0600; the output parent already exists. The programme is resumable in the same output directory, with its original settings and packet. `operation-result.json` retains the original twenty-location result. `complete-customer-result.json` adds the forty indoor rows, their original report and package identities, combined sixty-row comparisons, return receipts and cold state. Strict canonical JSON and immutable report validation remain in force throughout receiving.

Build the portable complete handover from that completed operation and exact selected SDK:

```sh
python3 stellar/scf-starforge-20261009/partners/airgradient-operations/receiving/build-customer.py \
  --operation /absolute/private/airgradient-original-customer \
  --sdk /absolute/private/airgradient-sdk/EXACT_SOURCE_SDK.tgz \
  --output /absolute/private/airgradient-handover
```

This includes the complete selected source and existing editable packages. The customer opening command uses the same original CLI and provider.
