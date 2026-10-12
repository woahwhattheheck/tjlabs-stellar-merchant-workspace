# Commissioning map and exact native result inspection

This is the map arm of the existing SensorThings commissioning workspace. It reads the original manager's retained native target responses and uses the selected DataCove STAM Leaflet bundle to display them. The original commissioning manager, plan, worker, private file store, revision checks and portable receiver remain the owners of native work.

The three source files are:

- `commissioning/stam.mjs`: a bounded, read-only implementation of the pinned STAM request dialect.
- `commissioning/ui/stam-map.mjs`: the real STAM map, complete retained-entity table, issue table and typed observation popup.
- `commissioning/STAM.md`: this operating and integration contract.

## Open and use the map

Open the existing private commissioning destination and select an original native job. The page first reads its map manifest, which identifies the plan, native verification, source selection and immutable map snapshot. Select **Things** or **FeaturesOfInterest** to plot the actual retained geometry. Clusters count retained map features. They do not count observations or establish station availability.

Click a native feature to open a safe text popup. The popup shows the exact native entity identifier, the separate map display identifier, retained observation count, original time, exact result text, its type and the original unit metadata. **Previous observations** and **Next observations** traverse the complete retained set for that feature, in pages of ten. A categorical value remains text; an explicit null remains null; a missing result remains missing. No numeric conversion, unit conversion or inferred continuous coverage is applied to these results.

**Complete retained target entities** includes all nine supported entity families, including entities that cannot be mapped. Its selector and pages expose native IDs and map eligibility without concealing missing geometry. **Missing reads and map limitations** carries the original unavailable-read states, unsupported coordinate declarations, ambiguous relationships, conflicting response variants and display-field collisions. The original response files remain the authority when resolving any of these findings.

**Inspect native result** hands the enclosing commissioning page the exact source selection described below. The page can open the same entity sidecar, show its complete typed fields and relationships, and offer the manager's held-file download for each available original responseFileId. Use the exact native kind and idJson for a commissioning decision. A map viewId is never a native identifier.

**Reload current target-read map** explicitly selects a new manifest. Existing pages and links stay bound to their selected snapshot. If the native response selection changed and the old graph is no longer retained in this process, the facade returns a conflict; the operator must select the current manifest. A later job verification is not silently substituted into an already-open source view.

There is no external basemap or target-service fetch in this arm. Spatial context comes from the retained geometry. Missing vendor assets leave the native entity and issue tables usable and report that the map could not load. A host must supply the actual selected asset closure before it can claim an operating STAM map.

## Native identity and value preservation

The original SensorThings contract module parses target response bytes with its lossless JSON scanner. Numeric IDs retain their JSON lexemes, string IDs retain their exact strings, and those two types remain distinct. The facade uses the original numeric identity normalization to match related native records, retaining every original occurrence and response reference.

Pinned STAM reads JSON through Response.json(), treats a query ID as a JavaScript number and uses truthiness when forming entity routes. Passing native unsafe integers, string IDs or zero directly into that path would change their meaning. Therefore each immutable map graph assigns positive integer display IDs in a deterministic ordering of the native typed keys.

Every projected entity carries `commissioning@source` with:

```json
{
  "kind": "Things",
  "idJson": "\"native-string-id\"",
  "viewId": 1,
  "idRole": "SCOPED_MAP_VIEW_ONLY",
  "jobId": "original-job-id",
  "planId": "original-plan-id",
  "verificationId": "original-verification-id",
  "snapshotSha256": "64 lowercase hexadecimal characters",
  "stepIds": ["original-step-id"],
  "responseFiles": [],
  "sourceIdentity": {},
  "conflicts": [],
  "originalOccurrences": 1
}
```

This example describes the shape only. Actual IDs and source identities come from the selected native job. Native numeric ID JSON is a numeric token in idJson, not a quoted string token; the sidecar always carries its literal JSON representation as text.

The display projection removes original fields whose names collide with STAM's own `count`, `getData`, `closeMarker`, style caches or `commissioning@source` properties. Each collision is reported. The original field and bytes remain in the typed inspector and original response file. This prevents a native extension field from becoming a cluster label or a library callback.

Multiple retained reads may supply different values for one native identity. Unchanged fields remain usable; conflicting fields are omitted from the vendor projection and shown as exact typed variants with their response references in the sidecar. Ambiguous singular relationships are never resolved by choosing the first record. A dataArray query with conflicting result/time fields returns a conflict instead of inventing a null or choosing a value. The map's native geometry eligibility rules remain explicit.

## Manager input contract

The original manager supplies:

```js
await manager.mapData(jobId)
// {
//   jobId, planId, targetServiceUrl, verificationId,
//   sourceIdentity, coverage,
//   entities: [ {
//     kind, idJson, bodyText, responseSha256, stepId,
//     responseFileId?, responsePointer?, readId?,
//     bodyIsCompleteResponse?,
//     relations?: { NativeRelation: [ { kind, idJson } ] }
//   } ],
//   unavailable?: [ { kind, idJson, stepId, state, reason, responseSha256? } ]
// }
```

Only original retained successful target reads belong in entities. A source row that has not been read back from the selected native target cannot become a target map entity.

**Full response mode is the default.** bodyText is the exact complete UTF-8 native response; responseSha256 must equal its actual byte hash. responsePointer defaults to the empty RFC6901 pointer. If the entity is inside that full response, supply its actual pointer, for example `/value/2`. The facade verifies the complete original response hash before selecting that subdocument.

**Selected fragment mode is explicit.** Set bodyIsCompleteResponse:false only when bodyText already contains the selected entity JSON. Preserve the complete original response's responseSha256, a nonempty responseFileId and the exact nonempty RFC6901 responsePointer. The facade calculates a separate bodySha256 for the selected fragment and never claims that it equals the full-response hash. The manager retains the full response bytes through its original file store.

The selected body must retain its native @iot.id or be bound to the supplied exact idJson. If both exist, they must identify the same original typed native entity. kind uses the original collection name: Things, Locations, HistoricalLocations, Datastreams, MultiDatastreams, Sensors, ObservedProperties, Observations or FeaturesOfInterest.

Native expanded relationship objects are read recursively. For unexpanded reads, relations may identify related native entities only where an original retained request/readback or resolved native journal establishes those target IDs. Values are arrays even for a singular relation. Do not infer a Thing ID from a Datastream name or from a navigation URL such as Datastreams(7)/Thing: that URL identifies a relationship request, not its resulting Thing.

A relation to an unread target stays an explicit unavailable-related-read finding. unavailable and coverage preserve the actual worker verification/read scope. A successful subset does not become complete target coverage. No target credentials belong in this input.

The graph snapshot is the original identity() hash of `{schema: MAP_SCHEMA, data: mapDataReturn}`. It binds the whole returned source selection, native bodies, relationships, unavailable records and coverage. All local links and continuation cursors use it. At most two complete selected graphs are cached in the current facade process; this cache is not another persistent observation store.

## HTTP integration

The factory is synchronous:

```js
import {createCommissioningSTAFacade} from './stam.mjs';

const facade = createCommissioningSTAFacade({
  manager: workspace.commissioning,
  basePath: '/api/commissioning/map'
});

const response = await facade.handle({url, method: req.method});
// null outside this prefix;
// otherwise {status, headers, body}, with body a complete UTF-8 JSON string.
```

The existing listener must perform its original Bearer session, Host, Origin and workspace checks before invoking this responder. Writes remain on the existing /api/action route. GET and HEAD are read-only; the enclosing HTTP handler omits the body for HEAD. Do not parse and reserialize the returned body with ordinary JSON.stringify: exactJSON preserves original numeric lexemes in supported native result responses.

| Route | Result |
| --- | --- |
| `/api/commissioning/map/:jobId/manifest` | Current source-bound manifest, family counts, geometry bounds and local links. |
| `/api/commissioning/map/:jobId/entities?snapshot=SHA&offset=0&limit=25&kind=Things` | Complete native entity identities and eligibility, paged without hiding nonspatial rows. kind is optional. |
| `/api/commissioning/map/:jobId/entities/:viewId?snapshot=SHA&offset=0&limit=25` | Complete typed fields, native relationships, geometry state and paged retained observations. |
| `/api/commissioning/map/:jobId/issues?snapshot=SHA&offset=0&limit=25` | Complete original map limitations and unavailable-read findings. |
| `/api/commissioning/map/:jobId/v1.1/*?snapshot=SHA` | The pinned STAM read dialect over that exact graph. |

The native dialect supports collection/entity/relation navigation, bounded nested $expand, $select, $filter, $orderby, $count, $top, $skip, local $skiptoken and native observation dataArray results. Filters are the pinned client's rectangular geo.intersects requests, native relation paths ending in display-ID equality, bounded and/or expressions, and explicit original phenomenonTime/resultTime comparisons. Unsupported requests return a clear error; they are not forwarded to the target service.

All @iot.selfLink, native navigation links and nextLinks are rebuilt under the authenticated local prefix with the same snapshot. Cursors bind the original query and graph. No retained upstream nextLink is followed by the browser or facade.

Top-level responses have a maximum page size of500. Nested relationships with no explicit $top retain their complete available membership, subject to the full-response bounds. Explicitly paged expansions include local nextLinks. A large expansion must be narrowed through its original relationship pages; no implicit100-row truncation is presented as complete.

## Browser and asset integration

```js
import {mountCommissioningMap} from './ui/stam-map.mjs';

const view = await mountCommissioningMap({
  container,
  client,              // original createDeskClient(token), already opened
  sessionToken: token, // original current session, closure only
  jobId,
  assets: {
    leafletScript, leafletStyle, stamModule,
    stamSource: '0e414f3441a8773619f242c797fe75e9af3fc04d',
    leafletVersion, leafletIntegrity, licence
  },
  onInspect(selection) { /* open native sidecar / original response files */ },
  onError(error) { /* use the existing commissioning notice */ }
});
// view.refresh(), view.close(), view.manifest
```

leafletScript, leafletStyle and stamModule must be selected same-origin static-manifest paths. Leaflet must expose the original L global; the STAM ESM bundle must export STAM. Optional integrity/version fields must agree with the actual selected assets. The source pin is DataCoveEU/STAM commit0e414f3441a8773619f242c797fe75e9af3fc04d, not a floating package version.

The source tree has no committed dist bundle. Retain the existing owner-produced built bundle, its full referenced chunk/assets closure, actual Leaflet files, source/package lock identity and licence files. Serve them through the existing distribution browser-assets contract. Do not claim that the source commit or a different latest package establishes the selected built bytes.

The current map uses Leaflet and the original STAM Leaflet adapter. MQTT is disabled; no new broker, package install or native service is started. Original STAM queryParameters and fetchOptions carry the local snapshot and existing session/workspace headers. The session token stays in the closure, never in query strings, saved map state or exports. Redirects fail rather than forwarding those headers to another service.

STAM's default popup interpolates provider names as HTML and assumes a numeric plotting path. This adapter supplies the supported markerClick callback and returns an HTMLElement built with textContent. The original browser client provides the paged typed result inspector instead of converting categories or high-precision values for the default plot.

Pinned STAM's Leaflet module keeps shared layer references. This adapter maintains one active original STAM map, closes its layers/listeners and aborts its requests before another map mounts. Refresh and navigation close the original map; a saved job or response is not rewritten.

The enclosing static stylesheet supplies the map's size and STAM's original loader/count-tooltip rules, because the application uses a self-only CSP. At minimum, `.commissioning-map-view` needs height440px, min-height320px and width100%; tables must scroll horizontally, control/pager rows wrap, and popups must remain readable at mobile widths. No remote tile layer is required.

## Geometry and source limits

Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon and GeometryCollection are inspected from actual retained GeoJSON. Display coordinates must be finite. GeoJSON longitude/latitude semantics, explicit CRS84 and explicit EPSG4326 are understood; another declared CRS remains unsupported and is reported without reprojection. Exact original coordinate lexemes remain in the native response.

The Leaflet view uses its ordinary WebMercator display extent. A source outside that latitude extent remains in the native tables and issues. A Thing needs exactly one unambiguous actual retained Location with supported geometry; multiple Locations are not silently reduced to the first. A FeatureOfInterest uses its actual native feature geometry. Invalid/empty geometry and open polygon rings remain explicit.

The declared maximum input is50,000 top-level native read entities,250,000 expanded occurrences/rows,64MiB per response and256MiB total response text. Expansions are at most six levels, geometry at most one million positions per inspected geometry, a rendered response at most10,000 entity projections and24MiB. Sidecar pages are at most500 rows. Exceeding a bound produces a specific capacity error and leaves the original job/files unchanged.

## Receiving and reopen

The original commissioning worker alone executes FROST operations and native readback. The map can be received when the original job already contains those actual read bodies. A portable package retains that original plan/job/response state through the existing receiver, then the current process rebuilds the read-only graph from those bytes.

Review a received job before resuming native work. The manager's existing run.resume path requires confirmServiceUrl and acknowledgeWrite only for a received pending job without a localBinding. The map does not grant that native write authorization or bypass that control.

A complete receiving result should retain the actual source manifest, built vendor asset identities, original job/verification, map snapshot and selected native IDs; open actual plotted features; traverse native entity/observation pages and missing-read reports; inspect original files; reopen the same job; then receive the original portable package into a separate workspace and make an explicit later edit there. The existing root browser/manager programme owns that lifecycle. Source parse success alone is not an actual browser, FROST or portable-receiving result.
