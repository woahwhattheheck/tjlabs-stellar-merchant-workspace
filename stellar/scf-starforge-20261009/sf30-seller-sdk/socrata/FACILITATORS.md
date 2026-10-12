# Review and change a Socrata Publisher facilitator

The maintained Socrata Publisher can review a configured facilitator against an
existing seller release, retain the complete native review, and stage that exact
change. Browser, CLI and merchant MCP use the same Publisher directory and
original SF82 release operations. The selected source edition, complete query
contract, public resource and customer acquisitions stay in their original stores.

The provider review uses the actual installed x402 SDK and the provider's current
supported response. It retains every ordered native payment alternative, its
difference from the stored offer, the original service digest, the selection
generation and the complete provider response. A compatible review can stage a
new release. The existing release controls select it and own its seller process.

## Open the original workspace with host profiles

A facilitator profile file declares the endpoints the operator may choose. Copy
[the testnet example](facilitators.testnet.example.json) into the host's
configuration directory:

~~~json
{
  "schema": "stellar-forge.seller-facilitators.v1",
  "providers": {
    "vellar": {
      "label": "Vellar testnet",
      "url": "https://vellar-facilitator-testnet-production.up.railway.app",
      "timeoutMs": 10000
    },
    "periplo": {
      "label": "Periplo testnet",
      "url": "https://periplo-testnet.fly.dev",
      "timeoutMs": 10000
    }
  }
}
~~~

Profiles contain provider connection settings. The original retained service
supplies its route, scheme, network, asset, recipient, amount and request contract.
Browser and MCP payloads choose the host alias; they do not supply a replacement
provider URL. A profile may explicitly enable loopback HTTP for an actual local
facilitator. Public provider URLs use HTTPS without embedded credentials.

Run the installed operator, using the original source workspace directory:

~~~sh
starforge socrata workspace \
  --directory /srv/starforge/hpd \
  --facilitators /srv/starforge/config/facilitators.json
~~~

From a source checkout:

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/socrata/cli.mjs \
  workspace --directory /srv/starforge/hpd \
  --facilitators /srv/starforge/config/facilitators.json
~~~

Open the returned private local URL. Choose Publisher, open its retained state,
then select Releases. Its Facilitator providers panel lists the configured
aliases and the retained reviews. The Publisher lives at
/srv/starforge/hpd/publisher; the source workspace and Publisher paths are
different arguments for their two CLIs.

The operator holds the existing workspace and Publisher leases. Its browser and
MCP view can borrow that same operator object. A separate CLI invocation uses the
directory after that owning process has closed. Use the current owner's browser
or MCP actions while its seller remains running.

## Review the whole retained service

First retain the source service through the original
[publication workflow](PUBLISHING.md): select a complete exported edition, prepare
its Publisher draft and stage an initial SF82 release. Existing source releases
are selectable immediately. A facilitator change starts from one of those
retained releases.

In the provider panel:

1. Choose the host provider and retained source release.
2. Enter a new release ID and descriptive label.
3. Choose Review provider.
4. Inspect the native compatibility result, full payment table and change list.
5. Choose Stage reviewed release.

The displayed native table keeps each ordered payment alternative separate. Open
Complete alternative for all its fields, including native extensions. Review
both recipient and atomic amount, plus the network and asset. The complete
review also retains every route, full stored terms, source binding and supported
body. Incompatible results remain available with their native error and any
completed provider response.

The original SF82 implementation uses its supported-response read in the
installed native seller factory. It does not substitute a generic capability
intersection for the original service's native payment requirements. See the
[original facilitator contract](../../sf82-seller-pilot/FACILITATORS.md).

The public Vellar and Periplo supported bodies captured on 2026-10-12 at 16:59 UTC
both advertised x402 v2, exact payments on stellar:testnet, sponsored fees and
Bazaar. Vellar also advertised upto on testnet. Its pubnet asset appeared in
catalogAssets; that alone is not a matching advertised payment kind. The
operator reads the current response for each new review and checks the actual
retained service through the native SDK.

Source endpoints:
[Vellar supported](https://vellar-facilitator-testnet-production.up.railway.app/supported)
and [Periplo supported](https://periplo-testnet.fly.dev/supported).
A review's supportedSha256 hashes the SDK's canonical JSON value. A separately
captured HTTP body's byte hash can differ because whitespace and object order
are not the same representation.

## Stage, select and run

Stage reviewed release uses only the retained reviewId. The original engine
checks its complete content hash and the host's current provider definition. For
a new release, it repeats the native provider review and compares the original
source, selection generation, complete native alternatives and supported-body
identity before staging.

Staging creates a retained release with its derived-from review binding. It does
not change which release is selected. In the existing Releases controls:

1. Inspect the staged release and select Activate release.
2. Use the current selection generation returned by the original store.
3. Stop the existing seller through the operator that owns it when changing its
   running release.
4. Start the selected release through that same original owner.

The existing runtime status distinguishes the selected release from the
observed running release. A source change does not silently take over another
operator's listener. Startup rechecks the reviewed native requirements; any
changed provider requirements return the original FACILITATOR_REVIEW_CHANGED
outcome.

Rollback uses the existing publisher.release.rollback action and its expected
generation. The source release, previous selection, staged change and review
remain inspectable. Continue customer sessions through their original retained
acquisition and page-attempt lifecycle when a running service changes.

## CLI: the same retained review between invocations

The source operator CLI accepts host profiles on workspace, status and action
commands. Save a review input such as:

~~~json
{
  "provider": "periplo",
  "releaseId": "hpd-original",
  "id": "hpd-periplo-1",
  "label": "HPD source with Periplo"
}
~~~

Use the actual source release ID shown in Publisher state. The IDs above
illustrate the input shape.

~~~sh
starforge socrata action publisher.facilitators.review \
  --directory /srv/starforge/hpd \
  --facilitators /srv/starforge/config/facilitators.json \
  --input /srv/starforge/operations/review-provider.json
~~~

The result contains the complete original review and its 64-character id. Save
that exact ID in the next input:

~~~json
{"reviewId":"RETAINED_64_CHARACTER_REVIEW_ID"}
~~~

~~~sh
starforge socrata action publisher.facilitators.stage \
  --directory /srv/starforge/hpd \
  --facilitators /srv/starforge/config/facilitators.json \
  --input /srv/starforge/operations/stage-provider.json
~~~

For a Publisher directory used without its source operator, the maintained
socrata-publisher command accepts the same actions:

~~~sh
starforge socrata-publisher \
  --dir /srv/starforge/hpd/publisher \
  publisher.facilitators.inspect \
  --input /srv/starforge/operations/stage-provider.json
~~~

Use --facilitators FILE on this command for review or stage. The optional
--input and --facilitators pairs may appear in either order after the action.
Opening a Publisher without profiles still permits history, complete review
inspection and export of already retained reviews.

| Action | Exact payload |
| --- | --- |
| publisher.facilitators.review | provider, releaseId, id, optional label |
| publisher.facilitators.stage | reviewId |
| publisher.facilitators.inspect | reviewId |
| publisher.facilitators.history | optional after and limit |

History defaults to 25 complete descriptors per page, with a maximum of 100.
Continue using nextCursor as after until it is null. Entries use stable review
ID order; observedAt retains the original observation time. The native full
review is returned by inspect and by the completed review action.

## Merchant MCP and installed package

The installed distribution exports
@tokenjunkielabs/starforge-merchant/seller/socrata/publisher-facilitators
through its ./seller/socrata/publisher-facilitators subpath. The source-owned Socrata
contribution retains both command aliases and registers the original helper
module; the complete source component includes this guide and the profile
example.

The original merchant MCP connection adds facilitatorConnection to the same
workspace declaration:

~~~json
{
  "schema": "stellar-forge.socrata-workspace-connection.v1",
  "workspaces": {
    "queens_housing": {
      "label": "Queens housing source and customer service",
      "directory": "/srv/starforge/hpd",
      "domains": ["data.cityofnewyork.us"],
      "facilitatorConnection": "/srv/starforge/config/facilitators.json"
    }
  }
}
~~~

Relative profile paths resolve against the host connection file's directory.
Profiles load when that configuration is read. Reopen the owning merchant
process to adopt a changed host profile file. Existing connection fields for
source imports, merchant terms, runtime and buyer workspace aliases stay
available together.

Call merchant_socrata_open with the declared workspace, then send:

~~~json
{
  "workspace": "queens_housing",
  "action": "publisher.facilitators.review",
  "payload": {
    "provider": "periplo",
    "releaseId": "hpd-original",
    "id": "hpd-periplo-1",
    "label": "HPD source with Periplo"
  }
}
~~~

The tool is merchant_socrata_publisher. Stage or inspect the returned retained
review with its original reviewId. Call publisher.facilitators.history to page
the review inventory. merchant_socrata_status exposes the configured provider
aliases and the Publisher's first retained-review page.

Read the complete JSON file through the existing retained-file transport:

~~~json
{
  "workspace": "queens_housing",
  "kind": "facilitator-review",
  "id": "RETAINED_64_CHARACTER_REVIEW_ID",
  "offset": 0,
  "limit": 196608
}
~~~

Use merchant_socrata_file. Continue with the returned readId, expectedSha256 and
nextOffset until EOF. The download is the whole retained review, including its
supported body and native alternatives. The browser's Download complete review
button reads that same file through its authenticated export route.

The [merchant MCP guide](../../../../stellar-forge/mcp-merchant-operator/SOCRATA_WORKSPACES.md)
describes original operator ownership, source capture, package restore, release
selection and completed customer delivery.

## Retention and recovery

Full reviews are create-only JSON files under
publisher/facilitator-reviews/<review-id>.json. They retain the original native
review ID and bytes. Publication writes and syncs a private temporary file,
links it to the final ID and syncs the containing directory. Reading verifies
the original review content hash. Reopening retains compatible and incompatible
results equally.

A completed review can outlive a lost CLI or browser reply. Refresh history and
inspect the full saved review before choosing the next change. A repeated review
is a new provider observation with a new observedAt and native review identity;
a retained ID is the stable handle for its original observation.

If staging loses its reply, inspect the proposed release ID or stage the same
review again. The original SF82 staged-release binding reconciles an already
committed release without requiring another provider response. Another review's
release ID, a changed source, a changed host profile or a changed generation
retains the original conflict behavior. The old review remains inspectable.

A single Publisher owns its existing serialized action queue and lease for this
whole workflow. Complete source/customer exports and acquisition deliveries
remain the original portable receiving formats. Copying a review into another
Publisher does not copy its retained source release; operate the original
received service and source store when continuing there.

## Use the same service on both profiles

For a two-provider deployment, choose one actual retained source release and
review each profile with its own proposed release ID. Keep the original public
route, HTTP method, schema, selected source edition and complete query scope.
Compare every accepted native payment alternative and stage each compatible
review through the original engine. Select the intended running release using
the original lifecycle controls.

Keep the original full-scope buyer request and complete output alongside its
source edition and page records. For example, a two-page customer acquisition
remains a two-page task when the facilitator changes. Existing completed
acquisitions reopen from their retained output; the provider review and staging
workflow operates the seller release independently of those completed pages.

This gives a merchant one usable retained service, reviewed provider changes,
the same browser and MCP operator, and a complete source-to-customer history.
