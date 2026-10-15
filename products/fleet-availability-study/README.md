# Fleet Availability Study Desk

Open Fleet_Availability_Study_Desk.html in a modern browser. The self-contained application works offline and retains originals, imported extracts, mappings, physical membership, maintenance and supplier dependencies, safety review, actual duty execution and complete recurring work.

## Start an operating study

1. Set the operator, depot, consecutive measurement window and extraction cutoff under **Population & work plan**. Declare the full physical fleet membership and all 29 family counts, including observed zero-row families.
2. Retain original documents, including source availability. Import the original and returned CSV editions and explicitly map every canonical field. Use **Selected editions** and **Identity maps** to reconcile exact records.
3. Review actual faults, parts receipts and installations, work and supplier state, safety cases and source-bound release inputs. Named safety and operations reviews refer to the exact complete release basis. Record actual readiness observations separately from repair completion.
4. Review **Fleet readiness & duties** for elapsed physical vehicle-time, unknown intervals, actual departures, cancellations, substitution, completion and returns. Required-window fulfilment is separate from an observed trip.
5. Review actual commercial postings and all eight recurring-work phases across complete matched physical-fleet members. The app reconciles repeated observations of the same external transaction and preserves conflicting originals.
6. Record source-bound review and save the complete session. The recovery section preserves unfinished forms, previous studies and competing browser branches. Export the source-study ZIP and readable report when handing work to another operator.

## Complete authored course

The supplied four-vehicle course is fictional. It spans every family and a full depot period, including a completed repair and release, an unresolved fault and cancelled duty, actual substitute execution, and unknown readiness. Its 2,880 eligible vehicle-minutes reconcile to 1,245 available, 915 unavailable and 720 unknown. Because unknown time remains, the complete availability fraction is unresolved. Complete measured recurring work is 192 baseline and 128 current active person-minutes across all eight phases; this example is not a customer outcome.

## Native use

With a local Node runtime, run `node native/fleet-desk.cjs help` for commands. The CLI uses the same core, session and domain modules as the offline application. It imports CSVs and exact supporting bytes, prepares source-bound corrections, records reviews, exports complete sessions/reports/source ZIPs and builds the same offline HTML. Output files are created atomically; existing different files require a distinct output path.

## Source and delivery

The maintained source is complete, including schema, event engine, physical-population and duty analysis, recurring-work comparison, application renderer, native commands, fictional operating course and executable receiving courses. SOURCE_MANIFEST.json identifies every source member. See DOMAIN_CONTRACT.md and COURSE_GUIDE.md for interpretation and source preparation. Original records remain the operating evidence; the app records and checks the named operator's decisions.

## Installed Applications and Merchant workspace

See [INSTALLED_OPERATION.md](INSTALLED_OPERATION.md) for create/open/resume, the complete managed browser editor, source-bound Merchant operations and full working/HTML/source exports. [INSTALLED_RECEIVING.md](INSTALLED_RECEIVING.md) contains the executable receiving command and accurately scoped adapter courses.
