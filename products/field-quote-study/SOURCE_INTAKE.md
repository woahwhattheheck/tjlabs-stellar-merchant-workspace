# Source intake and exact eighteen-family contract

Use the actual headers in templates/. Programme planning worksheets and public prospect profiles are separate from these operational inputs.

## Source families and relationships

| Family | Actual source purpose |
|---|---|
| companies | Company identity, currency and actual approval policy |
| users | Named company members and reported roles |
| sites | Company/site/customer identity and source address reference |
| visits | Complete consecutive visit inventory, opening, technician, service and selection |
| visit_events | Actual arrival, first departure, completion, cancellation and reopening |
| evidence | Exact captured field original and its retained byte digest |
| evidence_receipts | Actual stage/recipient-specific availability of those bytes |
| quote_editions | Supplied immutable version, actual status, stage, input cutoff, release and totals |
| quote_inputs | Exact evidence digest and actual input-use time for each edition |
| quote_lines | Actual item, unit, quantity, price, discount, supplied tax and totals |
| price_rules | Actual company/release/code/unit/currency rule edition and effective interval |
| line_price_bindings | Exact applied rule and any actual authorised price override |
| authorities | Named approval, send or price-override scope and amount ceiling |
| decisions | Actual Send now, Needs review or Locked result with policy and reason |
| approvals | Exact edition/payload review, authority, time and explicit supersession |
| quote_events | Actual publication, send, delivery, withdrawal and void events |
| customer_events | Exact customer/edition/payload response |
| effort | Disjoint observed person-work slices for each method and phase |

IDs are literal source identifiers. Explicit crosswalks connect original and returned identities, including parents. The unique exact-ID helper adds only unambiguous pairs and preserves existing choices. Similar names, addresses, filenames or prices are not an identity map.

## Original preservation

Text originals retain exact UTF-8 content, BOM, line endings and original row spans. Binary files retain exact bytes and a SHA-256 identity. Every original and selected extraction mapping remains in the complete session and exported source indexes.

Unmapped fields remain null. Selected CSV blanks alone do not express availability, so preserve selected/availability.json alongside them. A normal correction cannot populate an unmapped field without an explicit source mapping.

An extract's available_at describes when that complete edition was available. A later consolidated export cannot silently reconstruct its earlier contents. Select the appropriate retained edition for a historical cutoff. Captured-at time remains separately recorded.

## Receipt and output chronology

Use explicit UTC timestamps with real calendar dates. Retain effective, observed, recorded and imported times separately. A source event recorded before its own observation is unresolved.

An evidence record describes the actual original capture. A receipt names the stage and receiving identity at which the exact content was available. A quote input names the exact digest used and actual use time. The output's input cutoff cannot be later than production. A receipt must precede both use and cutoff at that output's actual stage/recipient.

A quote edition retains its actual predecessor. Failed or abstained outputs include their source reason and do not disappear from the visit cohort. Immutable quote/version IDs and payloads remain explicit even when later corrections improve the result.

## Authority and operational events

Retain the company's actual approval policy and effective authority records rather than inferring authority from a job title. Authorities specify company, user, action, service scope, currency, amount ceiling and effective interval. An observed empty ceiling is different from an unavailable field.

Operational approvals bind exact quote edition and payload. Source-backed supersession or revocation retains both records and their dates. Company-study acceptance in this desk is a separate review of the analysis.

Publication, sending and delivery are separate events. Keep actual event actor, recipient and delivery reference. Customer responses bind customer identity, quote edition and payload. Do not enter a predicted win, inferred signature, invoice or payment as an actual event.

## Intake bounds

Ordinary file intake accepts up to 24 MiB per original and complete-session intake up to 64 MiB before validation; expanded retained session state is limited to forty MiB. A rejected file or session remains an unapplied recovery candidate where it was read. Select a complete authorised study scope that fits these limits. Native exports preserve binary originals and pending browser forms.
