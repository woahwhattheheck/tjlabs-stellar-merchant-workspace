# Operate the Fiscal Data analyst

## Select the installed source and private workspace

Use the complete **fiscaldata-analyst** selected archive from the commit chosen
for this operation. Follow the [installation guide](../../stellar/scf-starforge-20261009/distribution/selections/FISCALDATA_ANALYST.md),
then retain the original installation's READY result, source manifest and launch
path. Node 24 and Linux with util-linux flock support the complete analyst path.
A browser is needed only to operate or inspect the UI; the named host and client
can run without Chromium.

Create a private workspace through the original model, or receive an existing
complete Fiscal package. Give a new operation an existing private source-package
directory outside every source workspace. The model and named configuration
require owned private paths. Keep customer-specific bindings outside Git.

~~~sh
starforge fiscaldata state --dir /srv/private/fiscal/treasury
~~~

Retain the returned workspace UUID. The original state command initializes an
absent workspace and closes its model before returning. A running browser or
MCP host owns the same model lease, so close that owner before using a separate
direct CLI writer.

### Original named connection

Save an owned 0600 JSON file such as /srv/private/fiscal/connection.json:

~~~json
{
  "schema": "stellar-forge.fiscaldata-workspace-connection.v1",
  "operator": {
    "id": "treasury-source-reviewer",
    "label": "Treasury source review operator"
  },
  "workspaces": {
    "treasury": {
      "label": "Reviewed Treasury source",
      "directory": "/srv/private/fiscal/treasury"
    }
  }
}
~~~

Use an existing owned 0700 directory such as /srv/private/fiscal/source-packages
for exports. Additional host aliases, pinned source imports, merchant profiles
and existing buyer workspaces use the original connection schema. The same
connection file is usable by the original Applications entry and named agent.

## Choose one original operating owner

### Installed Applications

Register the READY runtime in the existing Runtime workspace. Choose
**Applications → Fiscal Data operations**, select the connection file, its
workspace alias and the private source-package directory, then review and save
the application. Start, Open, Stop and reopen use the original managed source,
connection and workspace identity checks.

The Applications entry retains the selected runtime while routine workspace
revisions change. A different source, connection file or workspace identity needs
its original new review. Use Stop to release this model before opening a separate
agent or CLI writer.

### Named MCP agent and borrowed browser

Inspect the complete binding:

~~~sh
starforge fiscaldata-agent inspect \
  --connection /srv/private/fiscal/connection.json \
  --workspace treasury --exports /srv/private/fiscal/source-packages
~~~

Retain its bindingSha256, sourceSha256, workspaceId and named operator. Set
MCP_ACCESS_TOKEN in the host environment to the existing strong access token;
its value is never a command-line option or startup field.

~~~sh
starforge fiscaldata-agent serve \
  --connection /srv/private/fiscal/connection.json \
  --workspace treasury --exports /srv/private/fiscal/source-packages \
  --expected-binding-sha256 ORIGINAL_BINDING_SHA256 \
  --mcp-port 0 --browser-port 0
~~~

The one startup record contains mcpUrl, browserUrl, workspaceId, instanceId,
binding/source SHA and the original named operator. The MCP endpoint binds
127.0.0.1 and requires the original bearer authentication. The borrowed browser
uses the original session cookie, same-origin and CSRF checks. Neither listener
is a public unauthenticated endpoint.

Use --no-browser for remote command-line work; the original browser tool remains
available for an explicit later Open. Changing a selected configuration, source
or workspace identity rejects the old binding. Inspect again before starting
the changed selection.

All configured aliases are available through the original tools; only the
selected primary workspace opens at startup. A second operator must not start
another host over that same directory. SIGINT/SIGTERM closes admission, drains
accepted HTTP actions, retained file readers, original browsers and models, then
releases ownership. Checkpoint closes/reopens the selected native model through
its existing lifecycle operation.

### Direct browser or original CLI

For a standalone browser without an MCP endpoint:

~~~sh
starforge fiscaldata workspace --dir /srv/private/fiscal/treasury --port 0
~~~

For a headless source operation, use the existing command after the other owner
has closed:

~~~sh
starforge fiscaldata action --dir /srv/private/fiscal/treasury \
  --action sources.save --input /srv/private/fiscal/source-input.json
~~~

Every native dispatch returns **{result,state}**. The action's actual result is
inside result; the state is the retained workspace snapshot.

## Capture and review the source

Start from the authored [Treasury profile](profiles/treasury-debt-source-review.json)
or select another supported endpoint through the original source catalogue.
The catalogue and captured source metadata are authoritative for the field list.

Save each actual source request in a separate private JSON file with its stable
requestId. Retain the returned source ID, revision and SHA. Create a capture with
those exact three values and another stable requestId. Keep an identical request
ID only when replaying that same request.

~~~sh
starforge fiscaldata action --dir /srv/private/fiscal/treasury \
  --action captures.start --input /srv/private/fiscal/capture-input.json --wait
~~~

The native browser/MCP starts its existing worker for an explicit capture start.
A raw model caller uses model.startWorker(). An opened retained workspace stays
idle until an explicit capture or refresh action.

Retain every page and receipt. A page-size limit is a transport setting, not a
row limit for the whole source. Review the capture's complete count and original
pagination before treating it as COMPLETE.

Create a DRAFT edition from the exact capture ID and SHA. In **Review editions**,
read all original fields, including any field excluded from the published view.
For every selected field, retain the source/name/label, role, original unit,
scale annotation, notes and null marker. Confirm a key identifies a whole row;
an identifier containing digits remains an identifier. Save with the current
revision, then build that exact reviewed edition.

READY editions remain immutable. If interpretation changes, create and review a
new edition from the original capture. Original raw metadata and rows remain in
the source handover.

## Query and compare

Use the original query builder or editions.query through the typed client.
Inspect response.result.rows from dispatch, or result.rows after selecting its native result. Keep the actual
filter/order/limit with the resulting evidence; an analyst preview can be bounded
while the full native edition remains retained.

Compare two READY editions with original published keyFields and measureFields.
The browser's dated measure cards show exact first and last observations and
change, alongside participating-row counts, units and notes. Row review exposes
all original and changed fields, including unmatched rows.

A displayed sum means a sum over selected rows. For an outstanding-debt stock,
a sum across dates is not a borrowing flow or an official period total. Preserve
the original financial strings. The client performs no Number arithmetic or
implicit unit conversion. Null markers are reviewed metadata and do not become
monetary observations.

## Save, run and review the next period

Save a refresh plan from the exact READY baseline and SHA. The plan retains the
original endpoint/source rules, reviewed schema, comparison and briefing context.

Choose either the exact original query or an explicit rolling date window.
Preview binds planId, current revision/SHA and an explicit UTC asOf date. Read
its complete source URL and date interval before Start. A window includes its
end date, ends at asOf minus lagDays and contains days calendar days. The source
does not invent weekend or holiday observations.

Start retains its own requestId and all downstream original requests before
execution. Pause, Resume and Cancel use the current run revision. Resume keeps
the frozen plan and original period even when the current date changes.

An added, removed or changed source field, ambiguous null marker or incompatible
review enters REVIEW_REQUIRED. Open that run's captured source in the original
edition editor, review/build a candidate, and accept its exact READY SHA through
refresh.runs.review. The original refresh [guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/fiscaldata/REFRESH.md)
contains complete inputs and status meanings.

Only an explicit refresh.baseline.promote changes the plan's baseline. A complete
run, new report, source revision or page reload does not promote it.

## Use the authenticated client

Keep the returned endpoint and actual workspace UUID. The client uses the same
host token environment variable:

~~~sh
starforge fiscaldata-remote status \
  --url "$MCP_URL" --workspace treasury --workspace-id "$FISCAL_WORKSPACE_ID"

starforge fiscaldata-remote action \
  --url "$MCP_URL" --workspace treasury --workspace-id "$FISCAL_WORKSPACE_ID" \
  --action refresh.runs.preview --input /srv/private/fiscal/refresh-preview.json
~~~

The typed client's action method preserves the complete native {result,state}
envelope; value returns its result. Catalogue, source, capture, edition, query,
comparison, briefing, refresh, file, history, browser and portable operations
reuse the original tool catalogue.

Follow the [receiving guide](RECEIVING.md) to select complete files, resume a
download, verify all members, seal the workspace and reopen its independent
recipient. Keep the original request/selection when retrying an interrupted
result rather than making a new source operation.

## Native publication when selected

Merchant configuration, original publisher preparation, SF82 staged release and
native customer acquisition retain their original explicit terms and buyer
bindings. The installed source includes this integration and its full static
assets. The analyst profile does not start it automatically. If selected, use
the original prepared runtime dependencies and native buyer approval, and retain
the full acquired delivery; a manifest alone is not the acquired dataset.
