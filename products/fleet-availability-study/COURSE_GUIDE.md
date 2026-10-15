# Four-vehicle authored depot workflow

This complete fictional workflow belongs to the Fleet Availability Study Desk. Every operator, person, vehicle, source document, event and amount is authored. The records exercise an actual application path and provide an editable starting example; they make no claim about a researched fleet.

## Open the complete example

Open `examples/complete.study.json` in the desk. It contains the original and returned versions of all 29 canonical source families, 58 CSV originals, 158 retained document originals, 314 typed links and explicit identity mappings. The selected depot population contains four physical vehicles throughout 1 October 2026, 06:00–18:00 UTC. The source cutoff is 2 October at 00:00 UTC. Source data class is `authored_course`.

The complete session at `examples/complete.session.json` continues that example through an actual receiving correction. It retains the previous selected study and a deliberately unfinished CSV/mapping form, including a multiline cell. Its current returned availability source has a revised explanation for V4's unknown opening readiness. Original documents and source editions remain available. This session intentionally demonstrates a source difference and unfinished work, whereas the original complete study has equal original/returned mappings.

`examples/input/` contains 29 complete editable CSVs with the exact current canonical headers. Their document references match the retained complete study. The raw fixture `examples/fleet-course.records-and-documents.json` separately preserves the original authoring identities and complete document text. The builder maps those original identities to the application's retained document IDs and recalculates the exact release-input and review hashes.

## Follow the four vehicles

**V1 — repair and authorized return to service.** The vehicle is observed available at 06:00 by a person with both operations and safety authority. A blocking fault at 06:30 starts an unavailable interval. Workshop activity, parts procurement, an outside component job and a safety hold overlap. They are reasons for one physical vehicle interval, not separate elapsed savings.

The part arrives at 08:00 and is installed at 09:00. The supplier completes its job at 09:45, after its 09:15 promise. Physical work completes at 10:00 and the fault closes at 10:05. The safety decision occurs at 10:30, is recorded at 10:31 and becomes available to the office at 10:35. These are separate facts.

The release case includes five exact requirements: fault closure, work completion, installed part, supplier completion and safety clearance. Input rows bind the exact retained completion records. Safety accepts the complete basis at 10:40 and operations accepts the same basis at 10:42. An actual available observation is recorded at 10:45. The subsequent duty has actual departure at 11:00, completion at 13:00 and return at 13:10. None of these events is inferred from a previous stage.

**V2 — unresolved fault and missing part.** This vehicle is initially available, develops a blocking fault at 07:00 and has an unresolved workshop and safety case. Its requested part has neither a receipt nor an installation. The morning assignment is explicitly cancelled. Its open fault remains in the recovery population; it is not dropped when the mean of completed episodes is reported.

**V3 — explicit substitute.** The actual V3 assignment identifies the cancelled V2 assignment it replaces. Departure at 08:00, completion at 10:00 and return at 10:05 are all retained. This is one physical vehicle serving one required duty; the cancelled assignment does not create a second fulfilled vehicle.

**V4 — unknown readiness.** The opening record explicitly says readiness was unobserved. Its entire 720 eligible minutes remain unknown. The study therefore does not publish a complete availability percentage.

## Read the measures correctly

The complete four-vehicle denominator is **2,880 vehicle-minutes**. It contains **1,245 available**, **915 unavailable** and **720 unknown** minutes. The V1 unavailability interval is 255 minutes, counted once even while several restrictions overlap. V2 contributes 660 unavailable minutes. V3 contributes 720 available minutes.

One fault episode is completed in 215 minutes and another remains open. The mean of completed recovery episodes is therefore 215 minutes, explicitly conditional on completion. It does not represent every fault or the full return-to-service interval.

All four members have explicit observations for eight recurring-work phases under both methods: source capture, fault triage, workshop handover, parts/supplier coordination, safety review, dispatch reconciliation, outcome follow-up and correction. The authored comparison is **192 baseline versus 128 current active person-minutes**, a signed change of **−64 minutes**. Safety review increases from six to eight minutes per member. Whole observed work is retained; elapsed waiting and cash benefits are not inferred from these timings.

Actual commercial postings are kept separately: a £250 supplier invoice, a £25 credit and an £80 stores cost. The study does not assume these are all additive economic categories or label them cash receipts.

## Source history and receiving checks

A later V2 fault wording revision is recorded on 1 October but becomes available at 01:00 on 2 October, after the selected cutoff. It remains in the originals without replacing the earlier known source in the baseline view.

The retained independent countercases check three actual business boundaries: a later description-only fault revision must preserve earlier closure and duty history; a duplicate external invoice observation cannot manufacture a second charge; and an actual trip wholly outside the required duty window cannot fulfil that window. The corrected engine passes all three while preserving the original correct baseline.

The source/session course also checks the complete prior-study identity. A retained study must recover the same digest even when reconstructed from compact storage, so existing source-bound review history is not made stale by object-key order alone.

## Run the maintained source

`fleet-course.cjs` exports `build()` and `optionsFor(fixture, overrides)`. `examples/build-course.cjs` exports `buildStudy()` and `run()`. The default `run()` constructs the complete study through the actual Core APIs, executes the domain, makes a receiving correction, retains the unfinished form and prior study, reopens the portable session and produces ordinary exports. Its optional prepared-study argument supports a focused replay of that same continuation.

`verification/fleet-business-peer.cjs` exports the three exact variants and a `run()` result. `verification/history-key-order-peer.cjs` checks retained prior-study digest equality. Before-fix and after-fix results are both retained. Eight complete Core/session/export checks, all three independent business checks and the history identity check passed against the received corrected source. The original Core module was unchanged between full import and final continuation.

These results are execution of the actual maintained JavaScript modules in the available runtime. Native operating-system and rendered-browser receiving belong to the complete application's own receiving course.
