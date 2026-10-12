# Open the completed Del Norte study

This is the actual saved delivery from the completed October 12, 2026 OpenAQ
station-study operation. It contains the May 3, 2022 location-local archive for
Del Norte, Albuquerque: 140 original observations across six sensor series,
the named source review, an attributed HTML/JSON report, and every original
response and receiving record selected for delivery.

Open **Overview → A complete worked study** in the installed OpenAQ application.
Choose **Receive the completed study**. The existing receiver verifies the
bundled archive and imports the original capture, review and report into your
current project. When those exact records already exist, the button opens them.
It does not fetch OpenAQ, create a new capture or request a payment.

## What you receive

| File | Purpose |
| --- | --- |
| [report.html](report.html) | The complete human-readable report, unchanged from the original operation |
| [report.json](report.json) | Its machine-readable source, review, series and interpretation records |
| [study.tgz](study.tgz) | The complete original Frictionless/OpenAQ customer delivery |
| [manifest.json](manifest.json) | Original identities, actual source edition and byte hashes |

The TGZ is 13,807 bytes, SHA-256
**9fcc10bd1c91816c51c790a45d6f6aa76053ea375092ff5a802c655a19acc0b6**.
Its original transport contains thirteen members. Its OpenAQ manifest selects
seven logical customer files: capture record, all projected observations,
original compressed response, acquisition receipt, source review, report JSON
and report HTML. Those two counts describe different layers of the same
complete package.

The report HTML is 9,237 bytes, SHA-256
**fc0b59f85bbb7a610a0ff46007012b47a2026a198c2c38d6329271b6fbfd7445**.
The report JSON is 15,829 bytes, file SHA-256
**bae2b0f7bbd22e7413e70ad0e568ea445ddeab4b084e44f67d441d6e20888740**.
Its separately stored report-body identity is
**92f62e296dde975285fdf84f3e05b1f89c5050fa4a4c8854e485416b1686640b**.
The body identity excludes its own identity field; it is not the file hash.

## Read the source correctly

The selected file is the credential-free example in
[OpenAQ's official AWS quick start](https://docs.openaq.org/aws/quick-start).
The original operation acquired the object at 18:27:53.582 UTC on October 12,
2026 and retained its exact 797 compressed bytes, ETag, Last-Modified and hash.
The object URL can be patched upstream; reopening this delivery preserves the
acquired edition rather than asking the URL for today's bytes.

| Sensor | Parameter | Original unit | Reported rows | Original minimum | Original maximum |
| --- | --- | --- | ---: | ---: | ---: |
| 25227 | CO | ppm | 24 | 0.09 | 0.51 |
| 3916 | NO₂ | ppm | 24 | 0.001 | 0.029 |
| 3917 | O₃ | ppm | 24 | 0.012 | 0.049 |
| 3918 | SO₂ | ppm | 24 | 0.0 | 0.001 |
| 3919 | PM₁₀ | µg/m³ | 22 | 22.0 | 121.0 |
| 3920 | PM₂.₅ | µg/m³ | 22 | 5.9 | 18.9 |

These are the actual report's retained series summaries. Different sensor,
parameter, unit and granularity combinations stay separate. Numeric tokens
retain their original decimal text.

[OpenAQ's date convention](https://docs.openaq.org/using-the-api/dates-datetimes)
uses exclusive period-end observation timestamps. The report preserves both
the original archive local day and the observation's local/UTC timestamp.
An ending midnight can belong to the previous day's archive. Replacing the
file day with a UTC calendar day would change this study's scope.

The archive provides no flag history, sensor averaging interval or coverage
metadata. The product therefore records unknown flag state for these rows;
it does not convert unknown to clean. Twenty-two reported rows do not by
themselves establish a coverage percentage, two missing hourly observations or
a complete daily monitoring record. The optional arithmetic mean is explicitly
unweighted and retains its exact arithmetic expression.

The original station and license context comes from the
[official Locations documentation example](https://docs.openaq.org/resources/locations)
for location 2178. That source identifies Del Norte, America/Denver, AirNow,
the owner label “Unknown Governmental Organization” and US Public Domain
license 33 with a start date of January 30, 2016. The preserved context is a
documentation edition, not a fresh authenticated location API response.
Source attribution is **OpenAQ; AirNow; Unknown Governmental Organization**.
The original reviewer recorded this basis for the engineering study. Keep
the original source terms and attribution with later uses; see
[OpenAQ's terms](https://docs.openaq.org/about/terms).

## Use the original operator

1. Initialize your own private project using the [product installation guide](../../../../../../products/openaq/README.md).
   Enter the actual project name, team and intended use. No API account is
   needed to receive this saved example.
2. Start the original OpenAQ application, directly or through its installed
   Applications entry. Open the private connection printed by that owner.
3. On **Overview** or **Delivery**, choose **Receive the completed study**.
   The same original upload/receiving operation owns the import. Its request
   identity is derived from this project and the exact archive, so a lost
   browser session can reconcile that same receiving intent.
4. The application opens **Source review** with the original capture and named
   review. Inspect the metadata, original response, all projected rows and
   rights basis. The source remains the same after process restart.
5. In **Reports**, open the retained Del Norte report. Download its HTML or
   machine-readable JSON. The opening card can also download these original
   files before import.
6. In **Delivery**, select the received capture, its accepted original review
   and the compatible report to create a complete handover. The original
   Frictionless publisher and receiver retain the source files and identities.
7. Close the application through its original owner. Reopen that same project
   and choose **Open the received study**. The stored record is read directly.

The opening button does not turn the original engineering review into a new
reviewer's approval. For a client-specific intended use, create a separate
named review of that exact capture. To compare a different period or source
edition, explicitly capture that selected source and keep both editions.
The existing report and review remain available.

After a lost HTTP response, inspect the original request in **Operations**.
A running original receiving request stays running; an interrupted or failed
request resumes through its existing receiver. A completed request opens its
original records. A conflicting record under the same ID is reported rather
than overwritten. Receiving does not import an unrelated merchant database,
provider credential or an independent DuckDB customer workspace.

## Receive with the installed CLI

The same original CLI can receive the package without opening a browser.
Use a private configuration containing the actual recipient project:

~~~json
{
  "schema": "stellar-forge.openaq-study.v1",
  "project": {
    "name": "Received Del Norte study",
    "customer": "Your operating team",
    "purpose": "Review and retain the completed public-data station study."
  }
}
~~~

Save it as a private file, then run:

~~~sh
starforge openaq receive \
  --workspace /absolute/private/del-norte-received \
  --config /absolute/private/received-project.json \
  --archive /absolute/installed/source/stellar/scf-starforge-20261009/sf30-seller-sdk/openaq/examples/completed-del-norte/study.tgz \
  --sha256 9fcc10bd1c91816c51c790a45d6f6aa76053ea375092ff5a802c655a19acc0b6 \
  --request c52bb6d2-f153-48c5-ae84-0f9e64b1cf03

starforge openaq status --workspace /absolute/private/del-norte-received

starforge openaq serve --workspace /absolute/private/del-norte-received --port 0
~~~

Replace the absolute paths with the actual installed source and private target.
The request UUID above identifies this example import within that project.
Retain it and the exact archive/hash when repeating the CLI after interruption.
The original receive command reconciles or resumes that same request; the
original project is never replaced. The browser subsequently recognizes the
same received capture, review and report.

## Apply the workflow to a customer installation

A reporting implementation takes an agreed client network, reporting period,
authorized source, named scientific reviewer and required output. Configure
those actual values, capture the complete original source, preserve every
parameter/unit/interval and record the reviewer’s decision. Prepare the report,
receive it in the client's own project and agree the acceptance checks before
calling that installation delivered.

A commercial scope can price source integration, curated analysis and report
preparation, installation, operating handover and support. This public example
does not grant an additional data-provider entitlement or establish a paying
customer. Keep applicable source terms and the customer's own permissions
attached to the selected source.

For a Stellar merchant, use the existing **Dataset merchant** workflow to
prepare the original candidate, inspect and review it, publish the selected
dataset, then prepare an SF82 release with the actual public payment terms
and HTTPS origin. Merchant Releases retains activation and process ownership;
the original Buyer owns a subsequent native purchase. This worked example
completes source/report/customer receiving. It has no payment execution or
funded merchant-installation acceptance.

## Original delivery identities

- Capture: 142e4ed4-b38c-4013-8718-d3050765ee66
- Source review: d12ca7d5-edec-4496-9b41-c3c588167ceb
- Report: b674c1dc-dacc-407f-92a3-7f4c851baebc
- Source workspace: af7ee403-31b8-4114-99b4-4433b077e4f4
- Original project export: 8d162fe9-5a70-449e-9b28-752cd0f67c6f
- Complete source operation: SCF-OPENAQ-AIR-QUALITY-WORKSPACE-89255-20261012
- Operated source: f489a6d13bfa3b9fb7977d0f98e6175d179ad6a6
- Cumulative product merge: 1b2b36b5b01d98e1fff83fffb7357cf9dbf43e3e

The report and customer TGZ are copied unchanged from that completed operation.
The installed opening calls the original receiver with a new recipient project;
it does not rewrite the historical operation, report or selected source.
