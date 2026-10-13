# Operate an OpenAQ study as a merchant

The OpenAQ project now opens the original Merchant Releases console over its own
staged dataset store. The operator can follow the retained source review and
published dataset into release selection, activation, a supervised seller,
customer account receiving, client handoff and delivery. OpenAQ owns the console
lifetime; the existing SF82 release and customer engines perform those operations.

The same workflow is available from the installed OpenAQ browser, CLI, typed
merchant provider and saved Applications process. The scientific study, merchant
deployment and customer acquisition retain their original identities.

## Start with the complete original study

Install the whole OpenAQ contribution in the maintained merchant distribution,
or use its complete original source tree. Keep the original release and dataset
dependencies; copying only the OpenAQ directory omits the engines it calls.

Open the project through Applications or run the existing OpenAQ server:

~~~sh
starforge openaq serve \
  --workspace /absolute/private/station-study \
  --port 0 \
  --connection /absolute/private/station-study/connection.json
~~~

Keep this foreground process running. Its private connection file belongs to this
project and contains the current local listener identity. On a different process
or after a restart, reconnect to the new private listener; reuse the original
project directory.

The installed Overview and Delivery pages can receive the completed Del Norte
worked study. That original package contains 140 observations, six sensor series,
the 797-byte original public archive response, its metadata context, a named
source review and complete HTML/JSON report. Receiving the bundled study requires
no provider request. The [worked-study guide](examples/completed-del-norte/READING_GUIDE.md)
explains its local-day, interval-end, decimal, flag and attribution semantics.

You may also use another complete capture already retained in the project.
Select its exact source review. Dataset delivery requires an accepted review
with derived delivery enabled and its recorded attribution, source references
and applicable rights basis. A named review records that assessment; it does not
create new source rights.

## Publish the reviewed source edition

Open **Dataset & merchant** and choose the complete capture and accepted source
review.

1. **Prepare complete candidate** calls the original Frictionless publisher over
   the already retained observations and source context. It does not acquire
   another OpenAQ response.
2. Read the original publisher and inspect its candidate. Keep the returned
   extraction run, candidate digest, source edition and proposed rows together.
3. Record the publisher review. For a new dataset, explicitly select
   initialization. For an existing dataset, use the actual current target
   snapshot and revision shown by the original publisher.
4. Publish that reviewed candidate. A lost result is recovered using the same
   saved operation and native publication. A new candidate or reviewer decision
   uses its own deliberately created request.

The release preparation requires this exact extraction to be in its original
published state. The original publisher and dataset-version engine remain the
authority for publication, snapshots and query pagination.

## Prepare and stage the merchant package

In **Prepare a merchant release**, supply the intended canonical HTTPS origin and
fixed dataset route. Supply the actual public payment declaration from the
existing seller setup. Its supported fields are:

| Field | Original meaning |
| --- | --- |
| scheme | The seller's native payment scheme |
| network | The exact supported payment network |
| asset | The exact asset identifier on that network |
| amount | The seller compiler's original amount representation |
| payTo | The intended recipient on that network |
| maxTimeoutSeconds | The original offer validity limit |

Keep the full identity together. A network or recipient change is a different
reviewed seller configuration. The declaration contains public terms, not a
signing key. The original SF30 compiler validates those terms.

**Prepare original SF82 package** retains the published dataset CSV, its complete
Frictionless source capture and descriptor, query/plan, candidate, review,
publication, seller definition and dataset binding. The package is placed at:

~~~text
PROJECT/release-packages/PREPARATION_REQUEST_UUID/
~~~

This location is separate from the publisher source and dataset store, as required
by the original release engine. Preparation never replaces either source.

The completed preparation returns its native directory, run/plan IDs, dataset
snapshot and row count, binding, dataset descriptor, original source-file
manifest and offers. Keep the original OpenAQ preparation request UUID; it is the
next step's input.

Choose a new release name and an operator label. Review the runtime object. The
original Frictionless release bridge accepts only port, facilitator and
allowLocalFacilitator. The full original release validator applies. A runtime
without a facilitator is explicitly challenge-only; supplying a facilitator is
not itself a recorded payment.

**Stage exact release** writes to this project's original store:

~~~text
PROJECT/release-store/
~~~

The original SF82 engine validates the package and retains its immutable release.
Repeating the same release ID only succeeds when its source, payment, label and
runtime match. The resulting OpenAQ stage operation records the original public
release result and digest. An earlier preparation's recorded, project-owned path
remains supported; the stage does not follow a browser-selected filesystem path.

## Open the original merchant console

The new **Operate this study's merchant** panel lets you choose a completed
staging request or enter any retained staging UUID. The complete UUID lookup
works even when an old operation is outside the currently loaded page.

**Inspect original release** resolves:

- the completed OpenAQ staging request and its original preparation;
- the source capture and named review selected by that preparation;
- the original published extraction;
- the current immutable SF82 release with the same digest and dataset identity.

The panel shows this selected release separately from the store's current active
and previous releases. It also shows the original runtime status and project
console identity. Selecting an inactive stage does not activate it.

**Open merchant console** opens the original SF82 operator over this fixed store.
Repeated opens reuse this project's current console and return its current
private URL. There is no second release engine or second seller launch.

Use **Open original merchant operations** to continue. The private console link
is a local capability. It is returned to the authenticated caller and remains
in the current browser's memory; OpenAQ does not place it in a saved operation,
source export or portable study.

The original console is the complete deployment workspace:

1. Compare the selected immutable release and original configuration.
2. Review and activate the intended release against the current store generation.
3. Run its supervised seller. Read the original running instance and observed
   mode. Console-open, release-active and seller-running are separate states.
4. If activation changes while a seller is running, follow the original restart
   workflow and its current generation.
5. Use the original rollback selection to return to the retained previous
   release. Preserve the new and previous release history.
6. Use the original account receiving, client export and delivery screens for
   the customer handoff.

The original console owns the seller it launches. If another owner already
operates that release store, its original ownership rules apply. OpenAQ does not
kill that other process or pretend it owns its runtime.

## Complete a customer acquisition

A curated study can be delivered through the existing native Dataset offer.
The offer identifies the exact route, payment identity and supported query
contract. The underlying dataset handler retains its snapshot/cursor semantics
and charges according to the original per-request offer; a complete multi-page
acquisition keeps the original buyer's approval and spend limits.

Use the original buyer/account workflow with the actual seller offer and
reviewed customer account. The original account receiving screen keeps its
review, network/asset/payee identity and readiness. The original Buyer or Dataset
receiving path owns quote approval, signing, payment, complete page retrieval,
retained raw response and customer result.

Before presenting a completed paid handoff, read its actual native result,
transaction/payment receipt and retained file. A source review, successful
preparation, 402 challenge, local import or console start is a different
operation from that payment.

The study's original attribution and source context travel with the prepared
dataset source. Price documented engineering, curation, analysis/report
preparation, installation, operation or delivery work according to the agreed
scope. The public OpenAQ input itself does not establish a separate provider
licence or entitlement for a customer.

A scientific study archive contains the selected original captures, reviews and
reports. The native customer export contains its original acquired result and
receipt. Retain each with its own digest and original operation ID. Follow the
original release/customer backup commands for their independent private
operating state; a portable study does not contain private account material.

## CLI and typed-agent operations

The existing CLI reads these same project methods through the original private
connection:

~~~sh
starforge openaq read --connection /private/station-study/connection.json \
  --action merchant.status

starforge openaq read --connection /private/station-study/connection.json \
  --action merchant.release --input /private/selected-stage.json

starforge openaq read --connection /private/station-study/connection.json \
  --action merchant.open --input /private/selected-stage.json

starforge openaq read --connection /private/station-study/connection.json \
  --action merchant.close --input /private/selected-console.json
~~~

The selected-stage file contains only stageRequestId with the actual completed
OpenAQ release.stage UUID. The selected-console file contains only consoleId
from the current original merchant response. Keep both files private and regular,
using the same permissions as the existing operator inputs.

| Read name | Input | Result |
| --- | --- | --- |
| merchant.status | Optional stageRequestId | Current original store/runtime and project-owned console binding; optional exact selected release |
| merchant.release | stageRequestId | The same status plus validated original stage/preparation/source/release |
| merchant.open | stageRequestId | Current binding and private original operatorUrl; reuses the owned console |
| merchant.close | consoleId | Exact closedConsoleId and current console binding; drains that owned console |

These are the existing authenticated HTTP read entry's explicit project methods.
Open and close change an owned runtime resource and are declared as such in the
typed merchant tools; they do not claim read-only behavior.

The installed typed tools are merchant_openaq_merchant_status,
merchant_openaq_merchant_release, merchant_openaq_merchant_open and
merchant_openaq_merchant_close. They use the same configured workspace alias
and actual instanceId as every existing OpenAQ tool. The original connection
verifies the project, configuration and current process before each operation.

The lower-level exported createOpenAQMerchant is available at
./seller/openaq/merchant. It is intended for the existing project owner:
directory, workspaceId, configurationSha256, original readOperation and host
environment are required. The standard browser/CLI/Applications path already
constructs and disposes it; customer callers should use that path.

## Shutdown, lost replies and reopening

Use the original console's Stop action to stop its seller while keeping that
console available. Use **Close owned merchant and console** in OpenAQ to close
the entire owned console session. It waits for the original accepted actions
and the original seller/customer cleanup.

A close names the exact console ID. If that close already finished and another
console has since opened, repeating the old close leaves the new console alone.
If disposal fails, the owning handle remains retained for another close attempt;
OpenAQ does not report successful shutdown while abandoning the resource.

Closing the OpenAQ process also drains its accepted project work, closes the
owned console, and closes its original publication and customer handles. Failed
owned disposals remain available to the original process's retry path. An agent
disconnect closes that agent's connection and retained file handles; Applications
continues to own the project process.

After a lost open response, read merchant.status or repeat merchant.open for
the same staged request. After a lost close response, inspect current status and
use the original console identity. These live console actions do not cause a
provider capture or an automatic payment retry.

After an actual process restart, the retained project still contains the source,
review, publication and stage requests and original release-store history.
Reconnect using its new instance ID, inspect the same complete staging request,
then explicitly open a fresh original console. Its original runtime observation
determines whether an existing seller is running, stopped or requires recovery.

For source capture, publication, release preparation/staging and customer
mutations, keep the original saved request UUID and exact input. Read the
existing operation before deciding whether an interrupted request should resume.
Do not use another UUID to hide an unresolved result.

## Source composition

The OpenAQ adapter imports the maintained modules directly:

- ../frictionless/release.mjs prepares and stages the source-complete dataset;
- ../../sf82-seller-pilot/releases.mjs owns immutable releases, comparisons,
  activation, rollback and supervised runtime;
- ../../sf82-seller-pilot/release-console.mjs owns the original operator and
  its native account/client/delivery resources.

The complete OpenAQ source identity includes merchant.mjs. Its contribution
exports that original module and includes this guide. Updating a managed
installation carries the same source closure; no separate merchant daemon or
shadow release registry is introduced.
