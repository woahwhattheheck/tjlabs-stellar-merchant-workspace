# OAuth resource inspection through Merchant MCP

The maintained Merchant Support provider exposes the same registered OAuth resource review as the Support console. It uses the original SF74 incident-source manager and the original SF93 reader. Configure the provider with its existing private incident-source file and declared `oauthResources` aliases.

## Select the original source

Call `merchant_support_incident_sources` on the existing support connection. Each available source supplies its ID and label. Registered OAuth resources are projected as `{id,label,resource,configurationSha256}`. Select the source and resource from that actual response.

Call `merchant_support_profiles` with the selected `incidentSource`. Its `current.configRevision` supplies the configuration revision for inspection. When there is one initial source the original host default applies; use an explicit source ID when several are configured.

The source configuration is owned by the existing host. OAuth endpoint, bearer credential reference, expected resource and verifier configuration hash come from that reviewed registration. Tool arguments cannot replace them.

## Inspect the resource

The tool is `merchant_support_oauth_inspect`. For example, after selecting source `support-main`, resource alias `merchant-oauth`, and actually reading revision 7:

```json
{
  "incidentSource": "support-main",
  "oauthSourceId": "merchant-oauth",
  "expectedConfigRevision": 7,
  "windowMinutes": 5,
  "unavailableMinimum": 1,
  "unavailablePercent": 10,
  "hostErrorMinimum": 1,
  "hostErrorPercent": 10
}
```

Replace those example IDs and revision with the current original selection. Omit optional thresholds to keep the registered source settings. The manager validates the configuration revision before and after its read, resolves the existing host credential, observes the registered resource and returns its original review and source observation. If the configuration changes during the request, read the current profile and review the new selection.

| Argument | Accepted value |
| --- | --- |
| incidentSource | Original configured source ID, or the original host default when unambiguous. |
| oauthSourceId | Required original registered alias; nonblank UTF-8, at most 64 bytes, with no control characters. |
| expectedConfigRevision | Required positive safe integer from the current profile. |
| timeoutMs | Optional integer from 100 through 30000. |
| windowMinutes | Optional integer from 1 through 60. |
| unavailableMinimum | Optional integer from 1 through 1000000000. |
| unavailablePercent | Optional integer from 0 through 100. |
| hostErrorMinimum | Optional integer from 1 through 1000000000. |
| hostErrorPercent | Optional integer from 0 through 100. |

The tool delegates all source normalization and observation to `manager.inspectOAuth(source.id,input)`. Its return preserves the original schema, OAuth registration, authority, state, interpretation and `sourceObservation`; `incidentSource` identifies the selected source alongside them.

## Interpret the original observations

Authentication, authorization, trusted-host authority and key-provider checks have separate outcomes. One HTTP request may cause several checks. Compare each stage within its original source identity; these aggregates are not per-request access logs.

Ordinary invalid tokens, insufficient scopes and access denials are enforcement outcomes. Host callback errors and unavailable verification/key dependencies use their original failure classifications. Incomplete windows, changed configurations and reset source sessions remain explicit in the source review.

The protected diagnostic route excludes its own verifier and key-provider activity. Reading it therefore does not manufacture successful enforcement traffic or cause a failing source to appear recovered.

## Carry the review into the existing workflow

Inspection returns the original reviewed registration. Use that review with the existing host profile/configuration workflow, then operate the original watcher using its declared configuration and the owning operator. The inspect call itself leaves watcher ownership and the selected case history intact.

Existing `merchant_incidents`, `merchant_incident_view`, `merchant_incident_ack` and `merchant_incident_case` operate on the same OAuth incidents and retained capture envelopes. Select the actual incident and revision returned by those tools. The original CaseStore, handoff, export and portable receiving preserve the source-derived review.

The complete native producer and customer receiver are described in [OAUTH_RECEIVING.md](OAUTH_RECEIVING.md). The customer runtime and private source declaration are described in [OAUTH_SUPPORT.md](OAUTH_SUPPORT.md). Those guides also cover the preserved-input continuation after an interrupted customer receive.

## Host lifetime

The existing Merchant Support owner opens the incident-source manager and closes it through its normal provider cleanup. Closing that owner aborts an active registered OAuth inspection through the original manager. The MCP bridge introduces no second watcher, configuration writer, credential store or background controller.
