# AIsa research API receiving pilot

**Proposed implementation fee: USD 2,400. Delivery: 20 engineering hours over five business days from an agreed start and receipt of the selected integration inputs.**

## Useful customer result

An AIsa customer runs one selected research or data request, receives the complete useful output, and reopens it with the original request and cost context. If the transport is interrupted, the request retains its original identity and the operator can inspect the native outcome before deciding whether another billable call is appropriate.

The proposed buyer is AIsa's developer or solutions team, or one integrator it selects. The current integration opportunity is grounded in AIsa's own developer material: its catalog offers metered research APIs, its pricing guide says processed retries can create additional charges, and its usage service exposes totals for a selected key and time window. A customer recipe can join these into a clear operation and handover.

The selected example is **one research/search data endpoint**, with Tavily through AIsa as the proposed candidate. The implementation uses the actual current method, path, request schema, pricing rule and output rights supplied by AIsa's catalog or technical owner. The catalog page did not expose a complete endpoint contract during this source review, so the pilot has not invented a request URL.

## The integration we would deliver

We would compose one installed recipe in the existing TJLabs Buyer/Research workspace:

1. Retain the exact selected endpoint, query, result/page limits, key reference, pricing basis and original request identifier before dispatch.
2. Use the customer's existing AIsa key and selected native endpoint through its original transport.
3. Preserve original status, response headers, provider request identifier when returned, and every response page/member belonging to the selected query.
4. Expose original-operation inspection and continuation. A lost transport response remains unresolved until the corresponding provider request or native evidence is inspected.
5. Receive a complete dataset/report bundle with the original query, page lineage, source/license references, member hashes and readable opening instructions.
6. Query the original key's usage for a matching interval and show charged amount and usage value separately. Request-level outcome comes from the original request/Console record; window totals remain aggregate evidence.

The pilot uses the existing [Buyer Dataset session](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/dataset-session.mjs) and [complete Dataset delivery](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/dataset-delivery.mjs), selecting only the native provider contract and presentation needed for this example. The [OpenAQ Buyer operating guide](../../operations/openaq-buyer-receiving-921ba0-20261012/OPERATING.md) documents the maintained handoff/receive implementation and original programme state; its different source and payment mode stay identified.

## A concrete artifact available now

[provider-projections.mjs](provider-projections.mjs) contains a runnable usage-window planner and captured-total projection. It constructs the documented `GET https://api.aisa.one/v1/usage` selection without making a request.

It uses positive Unix seconds, adjacent half-open intervals of at most 31 days, UTC daily buckets and key scope. Integer micro-USD remains exact through summation and formatting. The reader preserves `charged_micros_usd` and `usage_value_micros_usd` separately, rejects overlap or mixed local key references, and reports any gap between captures.

The helper reads already-captured responses. A key reference is a local label, not a credential or proof of which account supplied the response. The full engagement binds that label to the customer's actual private configuration and original returned body.

## Five-day implementation plan

| Work package | Hours | Delivered result |
|---|---:|---|
| Select endpoint, current pricing, source rights and useful query | 3 | Pinned original request/response contract and acceptance example |
| Compose request capture and native customer flow | 7 | Installed recipe and complete selected query/page handling |
| Join original usage and request inspection | 3 | Separate charged/value totals and original request outcome |
| Complete export, receive and cold reopen | 4 | Dataset/report bundle, manifest and operating commands |
| Joint acceptance and one correction pass | 3 | Demonstrated cases and maintained source handover |
| **Total** | **20** | **One complete research API customer pilot** |

Day 1 freezes the selected API and acceptance example. Days 2–3 implement request, output and usage joins. Day 4 completes portable receiving and recovery. Day 5 is acceptance and one correction pass. The work uses separately assigned commercial delivery capacity in an agreed slot.

## Acceptance

- One agreed useful query returns all expected selected rows/pages/output members, with the actual provider response and request identity retained.
- Reopening the completed local operation downloads or reads the existing output without sending another provider request.
- After an interrupted response, the same request is inspectable and any further paid dispatch is an explicit decision using available original request evidence.
- The selected key/window capture shows actual charged micro-USD separately from usage value. It does not claim to prove the outcome of a particular request or a historical top-up.
- A reporting interval longer than 31 days is split into adjacent valid requests. Captured overlapping windows or mixed key references cannot silently double-count the summary.
- The recipient verifies all manifest-bound members, opens the complete report/dataset and repeats the cold reopen after the original donor caller has closed.
- The delivered guide identifies who operates the AIsa account, how credentials are referenced privately, and where the original request and billing records are inspected.

The authored examples in this repository demonstrate these reporting boundaries without contacting AIsa. Provider-backed acceptance is part of the proposed engagement.

## Inputs, costs and delivery terms

Required inputs are one current endpoint contract, its current price rule and result limits, a customer-owned AIsa key with a stated usage budget, a non-sensitive query whose complete output is useful, output licensing/retention terms, and a named technical reviewer. A provider-approved sandbox or test allowance is preferred for interruption cases. Production billing remains under the customer's original AIsa account and approval.

The customer supplies hosting, provider/API access, any subscriptions, payment principal and applicable network fees. The fee covers one endpoint recipe and the acceptance work above. Additional endpoints, ongoing operations and continuing support can be priced separately.

Proposed payment is **USD 1,200 at kickoff and USD 1,200 on acceptance**, with invoices due in seven calendar days. The work starts in an agreed delivery slot after the selected inputs and kickoff payment are available. Applicable taxes are additional. These are proposed commercial terms for agreement.

## Official source basis

- [AIsa Tavily catalog entry](https://aisa.one/api/tavily-search-api) — proposed research API family and published developer contact.
- [Per-call API pricing](https://aisa.one/docs/guides/pricing/per-call-api-pricing) — fixed versus metered APIs and processed retries.
- [Usage logs and key usage API](https://aisa.one/docs/guides/dashboard/usage-logs) — original request inspection and aggregate reporting contract.
- [Custom-agent integration](https://aisa.one/docs/guides/tutorials/use-aisa-in-your-custom-agents) — existing authenticated gateway integration.
- [AIsa](https://aisa.one/) — developer@aisa.one.

Sources were read on October 12–13, 2026. The selected endpoint and current rate are pinned again during implementation.
