# OAuth observations in the Support console

This extension brings the original OAuth resource's operational observations into the existing SF93 Incident desk and SF74 customer Support case. It uses the original verifier, watcher, capture store, CaseStore and portable handoff. A customer can review the observed problem, assign the next action to the relevant owner, retain a later observation and deliver the complete before/after case.

The observation records authentication, tool authorization, host-authority and issuer-key checks. These are not distinct HTTP request counts. An ordinary denied access decision is an enforcement result. It does not become an incident simply because it was denied.

## 1. Select the original protected observation source

The original OAuth host provides `GET /api/mcp/oauth/observation`. In OAuth mode this request passes the original JWT authentication and `authorizeTool('mcp_oauth_observation_read')`, including the existing host authority callback. The host's observation context excludes the monitoring request and its own key/authority checks from the operational counters. The original authority remains responsible for access.

The private startup configuration selects an exact reviewed loopback HTTP endpoint and an environment-variable reference to the original operator's valid OAuth access token. There is no additional browser-selected endpoint, alternate verifier or fixed-token authentication system.

An incident-source entry can retain named aliases in `oauthResources`:

```json
{
  "id": "original-host",
  "label": "Original OAuth host",
  "oauth": {
    "endpoint": "http://127.0.0.1:ACTUAL_PORT/api/mcp/oauth/observation",
    "tokenEnv": "OAUTH_MONITOR_ACCESS_TOKEN",
    "resource": "ACTUAL_ORIGINAL_RESOURCE",
    "configurationSha256": "ACTUAL_REVIEWED_64_CHARACTER_SHA256",
    "timeoutMs": 5000,
    "windowMinutes": 5,
    "unavailableMinimum": 1,
    "unavailablePercent": 10,
    "hostErrorMinimum": 1,
    "hostErrorPercent": 10
  }
}
```

This is a shape example, not a runnable registration or evidence that those placeholder values exist. Use the original host's actual endpoint and the result of the original `reviewOAuthSource` to supply the resource and configuration digest. Keep credential values outside source files, portable cases, logs and browser storage.

The named alias fixes endpoint, credential reference, resource and configuration SHA-256. The same console's existing watcher editor may select the read deadline, observation window and condition thresholds. Its original configuration revision check applies. A different resource or authority configuration requires the host operator to review the private selection.

## 2. Review and register in the existing Incident desk

Open the existing Incident desk and choose the incident source that owns the original watcher. The OAuth source panel appears when that source has a registered alias.

1. Choose the named original observation source.
2. Set the watcher source ID and label, then review the observation window and thresholds.
3. Select **Inspect original resource**.
4. Review the returned resource, configuration digest, original session, capture time, authority and observer state.
5. Select **Add or replace source in draft**.
6. Review and apply the complete existing watcher configuration using its current revision.

Inspection does not apply a watcher configuration or start a second worker. Draft adoption changes only the existing draft text. The original Apply, Start, Stop, notification and recovery controls retain their existing ownership and revision semantics.

The browser sends a registered alias ID and expected watcher revision. It cannot supply another endpoint or a credential value. The server rechecks source identity after the original read. A changed source, late response, edited setting or changed revision invalidates the pending review.

For an existing watcher restored through the original Recovery flow, retained `merchants[].oauth` selections repopulate the named original source list. Recovery does not silently replace their endpoint, credential reference or authority binding.

## 3. Read the original observations

The same Incident desk shows the registered OAuth sources and the original before/after captures attached to an incident. The Runtime Support desk also accepts the two original capture files directly.

| Source file | Meaning |
| --- | --- |
| `oauth-observation.json` | Original SF93 registration, normalized selection, collector times, source digest and validated summary. |
| `oauth-source.json` | Complete original observation JSON bytes; literal JSON `null` when the original source read failed. |

Both files are required together. Each complete file is bounded at 2,000,000 bytes by the original codec. A mixed set containing unrelated runtime packet files is rejected. The existing runtime capture envelope preserves the exact bytes, lengths and SHA-256 values.

The metadata schema is `stellar-forge.sf93.oauth-observation.v1`. The original observation schema is `stellar-forge.mcp-oauth-observation.v1`. The codec recomputes the summary from the retained original bytes and refuses a conflicting claimed summary or source digest.

The display retains:

- Original resource, session, start time, capture time, sequence and configuration digest.
- Reviewed registration and original source-file digest.
- Original host callback and configured issuer metadata, allowed algorithms, token types, required scopes and allowlist counts.
- Key-cache freshness, reload and cooldown state.
- Closed state, active requests, observer errors and clock errors.
- Each stage's starts, completions, allowed, denied, unavailable and failed checks.
- Exact original outcome-code counts, issuer buckets and last-stage observations.
- The selected observation window and complete original per-minute rows.
- The original parsed observation for detailed review; the capture files retain the exact source serialization.

No bearer token, subject value or tool argument is included in this observation contract. The configured tool name and the number of allowlisted subjects can be present; they are different from a caller's arguments or identity value.

Missing source fields remain **Not observed**. They are not replaced by zero. A valid sparse outcome map may omit a code that has no occurrences, but an absent stage, source or issuer baseline is not invented.

## 4. Interpret the selected window correctly

`summary.window.minutes` is the selected integer duration, from 1 to 60 minutes. It is not an array of minute rows. The complete native row inventory is `capture.original.source.minutes`; each row has its original minute and counters.

The window starts at an inclusive aligned-minute boundary and ends at the original capture instant. The final minute can be partial. The display retains that distinction and the original `complete` flag.

Before and after windows often overlap. They are never added together or subtracted to claim incremental activity. The case shows both original windows independently. Even separate windows do not establish that a repair caused a change in rates.

## 5. Compare a customer case

Choose the original registered source's GET mapping in the existing runtime case. The case preserves its original input mapping and marks a later mismatch explicitly.

For a before/after check interval, the extension requires:

- The same complete registered selection.
- The same observed resource and configuration digest, without an identity contradiction.
- Nondecreasing original capture time and a strictly increasing original snapshot sequence.
- The same session ID and unchanged original session start.
- Nondecreasing original cumulative counters.
- Retention of every earlier issuer bucket.
- Complete original coverage in both captures.

Only then does it expose cumulative per-stage deltas. Starts and completions can cross the interval boundary. The delta includes outstanding checks at both ends; one HTTP request can invoke several checks.

A new issuer bucket has no observed earlier bucket in that source pair, so its delta is left unobserved. A decrease or missing earlier bucket produces a source-continuity finding. A restart keeps two separate sessions; it is not recorded as a repair.

The existing generic HTTP interval stays empty for OAuth. OAuth deltas live in the explicit OAuth comparison so the Support UI cannot label authentication checks as requests, 2xx responses or sales.

## 6. Act on the original condition

The repair queue calls the same `oauthConditions` classifier used by the original SF93 incident model. It does not independently redefine thresholds or recovery.

| Condition | Customer action and owning boundary |
| --- | --- |
| `OAUTH_SOURCE_UNAVAILABLE` | Ask the original host operator to reconcile the selected endpoint, observation permission, credential reference and read deadline; retain the failed capture. |
| `OAUTH_CONFIGURATION_CHANGED` | Compare the observed resource and authority digest to the reviewed registration before the original owner changes that registration. |
| `OAUTH_SOURCE_INTEGRITY` | Reconcile source bytes, session identity, clock and cumulative continuity before using the interval. |
| `OAUTH_OBSERVER_INCOMPLETE` | Resolve the original observer lifecycle or callback error, then retain a complete fresh window. |
| `OAUTH_VERIFIER_UNAVAILABLE` | Restore the existing verifier or host resource and its dependencies while keeping its authority requirements. |
| `OAUTH_HOST_AUTHORITY_ERROR` | Inspect the actual original callback exception and its owner log. An ordinary access denial is different evidence. |
| `OAUTH_JWKS_UNAVAILABLE` | Restore access to the original configured issuer-key endpoint or original cache/reload path. |
| `OAUTH_JWKS_RATE_LIMITED` | Respect the observed key-service limit and original verifier cooldown; investigate refresh pressure with its owner. |

The exact key-fetch outcomes are `HTTP_200`, `HTTP_429`, `HTTP_5XX`, `HTTP_OTHER` and `TRANSPORT_ERROR`. A successful HTTP key response is not a claim that its body, key or token was accepted; those decisions remain with the original verifier.

`ACCESS_DENIED`, `INVALID_TOKEN` and `INSUFFICIENT_SCOPE` are normal enforcement outcomes. Do not repair them by weakening token, issuer, algorithm, scope, audience, token-type or host-authority rules.

A condition with `bad: null`, or a condition omitted for an unavailable source, is unknown. Recovery needs the original classifier's complete fresh window and observed successful checks. An empty window, restart, unavailable snapshot or lack of new failures does not prove recovery.

## 7. Retain the case and deliver the original sources

Use the existing incident-to-case action or attach the original two-file capture in Runtime Support. Keep the original incident/capture IDs, case inputs, owner notes and before/after mapping.

The runtime format remains `stellar-forge.merchant-runtime-case.v1`. The portable format remains `stellar-forge.merchant-support-handoff.v1`. The existing CaseStore and original `exportRuntimeHandoff` / `importRuntimeHandoff` functions retain the complete workspace text, runtime text, metadata and source hashes.

The read-only HTML export includes the OAuth authority, counts, exact outcomes, original source inventory, comparison and actionable queue. Its local document does not fetch an observation endpoint or transmit credentials.

For fresh receiving, select the complete original exported handoff and its exact SHA-256. Use stable source and receiving case IDs and the original CaseStore's create/CAS rules. Reconcile an already committed matching result before another write. A changed current case must retain its later history; receiving must not overwrite it with an earlier imported revision.

The customer receiver accompanying this extension consumes the frozen original handoff. It does not recollect the resource, restart the watcher, invoke a verifier, acknowledge an incident again or create a separate case-storage implementation.

## 8. Source and operating closure

The extension comprises the original current Support console plus:

- `oauth-runtime.mjs`: original-capture projection, compatible cumulative comparisons and the existing classifier's queue.
- `oauth-render.mjs`: escaped read-only authority, observation and comparison rendering.
- `oauth-desk.mjs`: named-source inspection and draft adoption using the existing Incident desk lifecycle.
- The guarded original `runtime-support.mjs`, Runtime desk, Incident desk, server asset/route, managed launch and incident-source joins.
- The original SF93 OAuth codec/source collector and guarded original watcher/config/model/store joins.
- The original host observation boundary and unchanged verifier.
- The current CaseStore, workspace source parser and portable export/import dependencies.

Keep the repository's original relative layout and non-import asset declarations. Browser assets are served by the existing Support server; Node-only modules are not mounted as browser scripts.

The source files and exact original dependencies must be present before a receiving result is claimed. Syntax checks establish parsing only. Full acceptance uses the original authenticated observation, actual retained incident/capture, the same console, original case save/export/import and a fresh received case. Retain each actual result and limit claims to the paths exercised by that original programme.
