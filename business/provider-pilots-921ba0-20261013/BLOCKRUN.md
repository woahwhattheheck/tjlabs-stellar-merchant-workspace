# BlockRun platform customer and usage-receiving pilot

**Proposed implementation fee: USD 3,000. Delivery effort: 24 hours, over five business days in an agreed delivery slot.**

One existing BlockRun enterprise account, one selected customer workflow and one complete usage/export window. The result is a customer integration that receives a useful response, keeps its original request identity, explains its original account usage and reopens the delivered files independently.

## Why this is a useful integration

BlockRun offers its gateway for platforms embedding AI capabilities into their own products. Its enterprise account route exposes a row-level usage ledger alongside account and window summaries. That makes a concrete onboarding task possible: connect a platform's actual customer result to the provider's original usage records and hand both to the customer's operator. [Platform offering](https://blockrun.ai/platforms) · [Enterprise contract](https://blockrun.ai/docs/getting-started/enterprise-api)

The supplied reference implementation groups a media job's retained rows, includes signed corrections in known cost and keeps pending amounts and incomplete coverage visible. It takes the window's call count from the original summary. A ledger window can contain a poll for a job created earlier, so a locally inferred count of all visible jobs would be misleading. [Enterprise account fields](https://blockrun.ai/docs/getting-started/enterprise-api)

TJL's maintained Buyer/merchant work already carries a selected request through complete response receiving, retained recovery and an independently reopened output archive. The completed OpenAQ example is a usable historical data demonstration: 140 rows across three successful pages, its first failed GET retained, and complete offline receiving after the original owners close. Its original accounting reports NO_PAYMENT_REQUIRED. The separate Stellar testnet merchant and customer programmes supply the purchase evidence. [Completed example and full source](../../operations/openaq-buyer-receiving-921ba0-20261012/OPERATING.md)

## The proposed customer journey

1. Select one real platform use case, an existing enterprise account and one model or data endpoint with BlockRun. Record the useful output and the person who will accept it.
2. Use the platform's existing key custody and provider client to make the approved customer request. Retain its actual request identifier, complete response and any provider-returned continuation identifier.
3. Receive the complete useful output into the same customer workspace. If transport is interrupted, continue through the selected provider operation where supported. An unobserved paid outcome stays an explicit unresolved action until reconciled.
4. Capture the original account responses for a fixed window, including every opaque continuation cursor. Produce the exact-decimal report with the original raw responses alongside it.
5. Deliver the customer output, source, operating instructions and complete export. The receiving operator opens the package and reads the original result and usage without another inference request.

A background Responses workflow is an optional selection only when that account has the required provider access. The documented wallet path requires an enterprise allowlist, has an original response ID and an event-sequence continuation; it does not support ordinary server-side conversation storage. A selected synchronous workflow needs none of that optional access. [Responses contract](https://blockrun.ai/docs/api-reference/responses)

## Implementation and acceptance

| Work package | Hours | Delivered result |
|---|---:|---|
| Select account, customer use case and source contract | 3 | One endpoint/model, useful-output description, authorized input, current provider contract and named accepting operator |
| Compose original customer request and response receiving | 5 | Existing provider client joined to the retained TJL workspace; original request/response identity and full accepted output |
| Complete usage capture and reconciliation | 6 | Original ledger pages, fixed window and cursors, summary/balance capture, exact decimal amounts, job/correction view and visible incomplete states |
| Recovery and independent receiving | 4 | Same original operation continuation where the provider supports it, complete archive, cold reopen after donor closure |
| Operator delivery and installation | 4 | CLI/configuration instructions, one customer-operated opening, code/source inventory and key-free exported package |
| Acceptance review and corrections | 2 | Agreed result read by the accepting operator; documented remaining provider or deployment inputs |
| **Total** | **24** | **One complete customer integration and reusable delivery** |

The pilot is accepted when:

- The named operator receives and accepts the complete agreed customer output, with its original provider request identifier.
- The existing provider transport, credential custody and accounting remain the source of execution and charges.
- Every retained usage page belongs to the same selected URL/window/cursor chain. Missing pages or changed repeated rows are explicit.
- One media job has one group containing its original create/poll records and any linked corrections. The original summary remains the call-count authority.
- Known priced amounts include signed correction deltas using the exact captured decimal tokens. Pending amounts, missing days and a partial summary cutoff remain visible.
- An interrupted continuation resolves through the original selected operation, or preserves an actionable unresolved result when the provider cannot supply one. Recreating a paid POST is not used to conceal an unknown original outcome.
- The recipient reopens the complete result and capture package after the source process closes. Reopening consumes no inference or payment action.

## Runnable source included now

The MIT-licensed reference is in this directory:

- [blockrun-projections.mjs](blockrun-projections.mjs) and [its TypeScript declarations](blockrun-projections.d.mts).
- [The complete authored capture](blockrun-example.json), [its runnable example](blockrun-demo.mjs) and [result](blockrun-example-output.json).
- [The shared capture CLI](inspect-capture.mjs), preserving the earlier Nevermined and AIsa commands.

Run from this directory with Node 18 or later:

~~~sh
node blockrun-demo.mjs
node inspect-capture.mjs blockrun /absolute/path/to/blockrun-capture.json
~~~

The example is an authored two-page account capture with six rows, three provider-reported calls, one media-job group and a signed correction. Its known cost is exactly USD 0.028100000000000001. The same runnable example also presents partial and pending states and rejects a changed cursor. These are documentation inputs; this source has made no BlockRun API call or charge.

### Capture through the existing account client

**planBlockrunUsageCapture(selection, cursor)** returns the exact first or continuation GET. The selected **from** and exclusive **to** are UTC instants; this pilot uses one agreed window of at most seven days. The reusable planner admits the provider's documented maximum of 400 days and 1–500 rows per page.

The capture wrapper is TJLabs' local association, with:

- A local account reference and a local key reference, never an API key.
- The selected UTC window and page size.
- Each original requested URL, status, capture time, input cursor and complete **responseText**.
- Optional original summary and credits responses captured through that same declared account client.

Use the existing authenticated client to execute the returned GET, retain the response's original UTF-8 JSON text and append the complete page. Feed each returned **next_cursor** into the next request until it is null. Keep the same window and account association through the operation. A returned non-null cursor in the last retained page remains a resumable incomplete capture.

Pass the complete wrapper to **projectBlockrunUsageCapture**. The CLI accepts an absolute regular JSON file, up to 32 MiB for this profile; each retained provider body is limited to 4 MiB. The previous two profiles retain their 1 MiB CLI limit. Larger production accounts can use the same original captured pages and a separately agreed delivery window.

The wrapper records a local association. It is not a provider signature or a substitute for the existing authenticated account/session. Preserve the original capture file alongside the projected report during export and receiving.

### What the report means

**knownPricedAndFreeUsd** sums the final values in the observed rows, including signed corrections. **pendingRequestIds** preserves unsettled records. **callsInWindow** is the original summary's value; it is null when no summary was supplied. **mediaJobs** is the number of job groups observed, including jobs whose create may precede the selected window.

The original row bodies and request IDs remain in the report. A correction whose base lies outside the window stays in a named group with its target ID; its signed amount still belongs to the captured window. Identical repeated rows are recorded and counted once. A changed repeated row rejects the combined view so the original captures can be reconciled.

The account's **blocked** field remains its admission decision. A null **remaining_usd** is shown as unlimited, while an explicit zero remains zero. The report also retains unavailable days and **counted_through**, and compares the observed known total with the separately captured summary without claiming that two reads were an atomic provider snapshot.

The cost view does not assess customer fulfillment. The pilot's separate accepted-output handoff supplies that measure.

## Inputs and responsibilities

BlockRun or its selected platform supplies:

- One existing enterprise account, an authorized key through its own secret store and permission to read the selected account history.
- The actual customer input, rights to use and retain it, an accepting operator and one agreed endpoint/model.
- Any model/service charges and account credit, plus the customer runtime and ongoing hosting.
- Its current rate/usage contract, account capabilities and any provider-specific recovery procedure needed by the selected flow.

TJL supplies the implementation, configuration, original-workspace integration, source, complete receiving guide and acceptance delivery. The pilot uses the current platform deployment and provider SDK instead of introducing another credential manager or a replacement billing service.

If a wallet-paid path is selected later, the original supported network, wallet, facilitator and exact charge authorization must be supplied for that distinct scope. No BlockRun Stellar settlement or new network support is claimed by this proposal.

## Price, payment and delivery slot

**USD 3,000 fixed implementation fee:** USD 1,500 at kickoff and USD 1,500 when the agreed pilot is accepted, each payable within seven calendar days of invoice. These are proposed commercial terms.

The five-business-day delivery slot begins after the selected account, customer input, accepting operator and kickoff payment are available. Acceptance of the slot records the named delivery capacity. Any work using the same contributors as the 400-hour SCF plan is scheduled explicitly against that plan before a dated commitment; separately assigned capacity is named.

The fee covers the 24 hours above and corrections to the delivered implementation within that scope. Provider usage, hosting, account credit, purchase principal, network fees and subsequent support are paid by the selected platform under its existing arrangements. A further integration or ongoing service is priced from the actual delivered workload.

Internal planning uses USD 95 per delivery hour: USD 2,280 direct delivery cost and USD 720 contribution before overhead. The two proposed receipts cover the fee, while the actual workshare payment terms and opening cash determine any interim funding need.

## Ready-to-send first contact

**Public recipient:** hello@blockrun.ai, published for general, support and enterprise inquiries. [Official contact](https://blockrun.ai/contact)

**Subject:** One complete platform customer and usage handoff — USD 3,000

> Hello BlockRun team,
>
> I’m Bryce at Token Junkie Labs. We build request-to-output integrations for API merchants and agent customers.
>
> Your enterprise usage contract has a useful detail for platform onboarding: media creates and polls share a job, corrections are signed deltas, and pending costs stay visible. We have prepared a small runnable TypeScript/JavaScript capture projection that preserves those distinctions and the complete original responses.
>
> We can take one existing platform workflow through its useful customer response, original usage export and independent receiving for USD 3,000: 24 implementation hours over five business days in an agreed slot. Your existing provider client, key custody and account ledger remain the authorities.
>
> The proposed scope, acceptance and runnable source are here:
> [insert the reviewed immutable BLOCKRUN.md link]
>
> Would that be useful for one current platform onboarding? An endpoint, expected customer output and named operator would be enough to select the pilot.
>
> Bryce
> Token Junkie Labs

The original sender will perform the current company/recipient and both-mailbox relationship checks before sending. A positive human reply is held for Bryce to lead the next communication. The complete reviewed implementation, pricing and source remain attached to this same opportunity.
