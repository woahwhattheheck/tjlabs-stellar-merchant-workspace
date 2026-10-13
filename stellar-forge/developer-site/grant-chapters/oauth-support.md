## OAuth resource operations and complete customer support

### Customer purpose and delivery

An API operator needs to distinguish an unavailable authorization dependency from an access decision that correctly refused a caller. The OAuth Support contribution connects that operational question to the existing customer case: inspect the original protected resource, retain its source observations, review the original incident, assign a repair to its owner, compare a later source, and hand the complete case to another operator.

The customer uses the existing Merchant Support application and original SF93 incident service. This contribution adds OAuth observations to those tools; it does not introduce another identity provider, verifier, incident controller, customer case store or billing system. The customer receives the original source files, case notes, before/after evidence, readable report and portable handoff. The implementation belongs within the application's existing technical implementation, service and customer receiving work.

The complete feature is merged in [PR893](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/893) at `39d1b70146e92a779dc024842a075f951b4e5943`; the installed operator and types are merged in [PR1022](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/1022) at `d49f7be36d3cf06ccb85e0eb6d6fcb410a46e02d`. Full native acceptance continues through the original programme and its returned customer-receiving artifacts.

### Select the existing authority

The operator opens **Applications → Merchant support → Incidents** and selects a named OAuth source from the customer's private incident-source profile. The original protected observation endpoint uses the resource's existing JWT authentication and tool authorization, including its host-authority callback. The original operator credential is supplied through a private environment reference; its value is not entered into this browser form or included in the handoff.

The operator selects the existing watcher revision, inspects the named resource, and reviews its resource identity, configuration digest, session, authority and observer state. Only that reviewed response can be adopted into the original configuration draft. Editing the selection or receiving a response for an older revision invalidates adoption. Applying the draft and starting or stopping observation continue through the original incident manager.

The [complete console guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/d49f7be36d3cf06ccb85e0eb6d6fcb410a46e02d/stellar/scf-starforge-20261009/sf74-merchant-support-console/OAUTH_SUPPORT.md) explains the actual alias, revision and source lifecycle. The [original MCP operating guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/d49f7be36d3cf06ccb85e0eb6d6fcb410a46e02d/stellar/scf-starforge-20261009/sf74-merchant-support-console/OAUTH_MCP.md) exposes the same flow to a tool-using operator: discover the existing Support inventory, read the current incident profile, then call `merchant_support_oauth_inspect` with a registered source ID and expected configuration revision. The browser and MCP tool cannot choose an arbitrary observation endpoint or substitute a credential reference.

### Keep the observed decision units

The original observation has separate authentication, tool-authorization, host-authority and issuer-key stages. Each records starts, completions, allowed, denied, unavailable and failed checks together with exact outcome codes. These are checks, not distinct HTTP requests, API transactions or sales. One resource request can invoke more than one stage. The monitoring call and its own key and host-authority checks are excluded from operational counters by the original host's observation context.

Normal `INVALID_TOKEN`, `INSUFFICIENT_SCOPE` and `ACCESS_DENIED` outcomes remain visible enforcement. They do not become an outage or a request to relax the original authority. An actual `HOST_ERROR` records an exception from the original callback. Key-fetch availability is recorded separately from the verifier's decision to accept a key or token.

The [original observation contract](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/d49f7be36d3cf06ccb85e0eb6d6fcb410a46e02d/stellar-forge/mcp-paid-agent/oauth-observation-contract.mjs) retains the session, capture time, sequence, resource/configuration binding, configured issuer metadata, key-cache state, stage counters, minute rows and exact outcomes. It excludes bearer tokens, subject values and tool arguments. Configured issuer addresses, permitted scope metadata, tool names and allowlist counts may still be operationally sensitive; the operator reviews the case's intended recipient.

Missing observations remain missing. A failed source read carries its original error and a null source, rather than invented zero activity. The [original codec and condition classifier](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/d49f7be36d3cf06ccb85e0eb6d6fcb410a46e02d/stellar/scf-starforge-20261009/sf93-seller-support-bundle/oauth-observation.mjs) validates the complete file pair and recomputes its summary. The source pair is `oauth-observation.json` plus `oauth-source.json`; the latter retains the original observation bytes or the original failed-read null value.

### Turn a real incident into useful customer work

The existing watcher evaluates actual source failures, changed configuration, inconsistent evidence, incomplete observer state, unavailable verification, host-authority errors and issuer-key availability or rate limiting. The customer queue uses that same classifier. A quiet key cache or unknown condition does not create an extra repair job.

The case identifies the relevant owner and evidence before a repair is undertaken:

| Observed condition | Useful customer action |
| --- | --- |
| The selected source cannot be read | Reconcile the original endpoint, observation permission, credential reference and read deadline with its operator. |
| Resource or authority configuration changed | Review the changed identity before updating its saved registration. |
| Source continuity or observer coverage is incomplete | Retain the limitation and resolve the original lifecycle or source mismatch before using a comparison. |
| The original verifier or host callback is unavailable or throws | Work with its existing owner and retained diagnostics; keep the original authority requirements. |
| The configured issuer-key service is unavailable or rate-limited | Restore its original dependency or respect the original cooldown; retain the actual key-fetch response category. |

The workflow does not prove that a proposed repair caused a later change. It preserves the action and later observation so a human can assess them. Recovery requires the original classifier's fresh complete window and successful checks; a restart, empty window or absence of new failures does not establish recovery.

An operator opens the original incident as a customer case, retains its before/after captures and metadata, records the owner and next action, and saves the case using the existing CaseStore revision rules. The [complete customer receiver](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/d49f7be36d3cf06ccb85e0eb6d6fcb410a46e02d/stellar/scf-starforge-20261009/sf74-merchant-support-console/oauth-receiving.mjs) operates these same incident-to-case, runtime inspection, export and import APIs. It does not manufacture an incident or acknowledge one again during receiving.

### Compare only compatible observations

The Support report shows both original observations and their exact files. A cumulative check interval requires the same reviewed selection, resource, configuration, session and session start, increasing snapshot sequence, nondecreasing capture time and cumulative counters, and retention of earlier issuer buckets. Separate sessions or mismatched identities remain separate evidence.

A compatible comparison reports per-stage cumulative differences and outstanding checks at both ends. A newly observed issuer has no observed earlier bucket, so its interval is left unobserved. The generic HTTP request interval remains empty for this source type. The before and after minute windows can overlap and are never added together to manufacture incremental activity.

The before-source repair queue remains a historical source-bound view even when the later source recovers. The report labels which source produced each observation and action. This lets a receiving operator see the original problem, the recorded intervention and the later evidence without rewriting history.

### Deliver and reopen the complete case

The original portable handoff retains the complete workspace text, runtime text, source bytes, selected mapping and human case metadata. Its read-only HTML report includes authority, check counts, exact outcomes, file identities, comparison and actionable queue. Opening that report does not fetch the observation endpoint or send credentials.

The receiving operator imports the exact selected handoff and saves it under the same stable case ID in the existing CaseStore. Source and received stores retain their own actual revisions; fresh import is not represented as a copy of all source-store timestamps or history. A lost save acknowledgment is reconciled by reading the original case and retained versions. If a later case head exists, the receiver retains that head and locates the original selected version rather than overwriting newer work.

The original [receiving guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/d49f7be36d3cf06ccb85e0eb6d6fcb410a46e02d/stellar/scf-starforge-20261009/sf74-merchant-support-console/OAUTH_RECEIVING.md) defines the complete source selection, artifacts, listener ownership and actual completion receipts. Its independent reopening compares the received case, reproduced handoff and readable report with the frozen originals. Browser screenshots and viewport measurements are separate optional observations, not an accessibility certification.

### Retain the producer boundary before receiving

The [original native programme](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/d49f7be36d3cf06ccb85e0eb6d6fcb410a46e02d/stellar/scf-starforge-20261009/sf93-seller-support-bundle/oauth-native-programme.mjs) contains one integrated demonstration: real JOSE signing and verification, original MCP HTTP handling, the protected observation endpoint, controlled original dependency failure, SF93 opening/acknowledgment/recovery, and SF74 case/export/import/reopening. This programme remains with its existing execution owner; its source is not an execution receipt.

Before invoking customer receiving, the producer saves both exact final source files and a private non-secret context. The [retained receiving helper](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/d49f7be36d3cf06ccb85e0eb6d6fcb410a46e02d/stellar/scf-starforge-20261009/sf93-seller-support-bundle/oauth-receive-context.mjs) binds that context to the original stopped watcher, selected incident revisions, captures, source implementations, Node identity and optional browser paths. It acquires the existing kernel and incident-worker leases before continuing the same receiving request.

When the original producer has ended, a retained-only continuation can consume those exact files and incident records without recreating the OAuth host, signing another token, restarting the watcher or sending another incident notification. The old host addresses remain historical input. The continuation still needs the original incident store, complete application source, writable private customer directories and its local Support listeners. Its separate receipt never relabels a failed producer as a single successful invocation.

### Installed product and grant contribution

The [selected Merchant Support recipe](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/d49f7be36d3cf06ccb85e0eb6d6fcb410a46e02d/stellar/scf-starforge-20261009/distribution/selections/merchant-support.json) includes the original Support and incident components, complete OAuth browser assets and guides, the original `mcp-oauth` command, four public OAuth module exports and their declaration files. The [package operating guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/d49f7be36d3cf06ccb85e0eb6d6fcb410a46e02d/products/merchant-support/PACKAGE_README.md) explains the existing runtime installer and `mcp` dependency feature. Selecting a source recipe does not itself install JOSE, OpenSSL, Python or an optional browser; those are explicit original runtime prerequisites.

For a customer engagement, the existing Commercial, Implementation and Technical/customer receiving desks remain the place to agree scope, assign the work, attach the actual delivered case and record the customer's response. This capability sits within the canonical USD 38,000, 400-hour, 150-day, six-package scope. Its customer outcomes and actual commercial results continue through the existing application and customer records.

The next acceptance step is the already-owned native programme and its original returned artifacts. After that result exists, the cumulative publisher can attach its exact outcome and limits to this same chapter and source registration, then receive the existing four reviewer outputs into the original saved draft and review.
