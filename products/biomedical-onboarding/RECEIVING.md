# Receiving and operating record

## Executed maintained-source courses

The complete source was executed in V8 using its actual CommonJS modules and actual generated-HTML embedded script. The browser course supplies a small DOM and IndexedDB adapter; the native command course supplies filesystem/path/crypto adapters. These runs exercise actual application handlers and commands, rather than a second implementation.

- **16 model/session/migration checks:** nine first-return changes, zero corrected changes, exact binary comparison, unavailable report bytes, moved-device history, complete draft/branch reopen, stale review, later revise, v1 migration and exact original history metadata, quoted source-line spans and complete export.
- **28 browser-handler checks:** every ordinary section, staged CSV/map application, retained prior draft, actual cross-tab conflict, branch adoption and continued save, later unseen successor rejection, stale review restart, unresolved options, exact BOM documents, failed CSV recovery, normal document-link correction and complete source/session/export actions.
- **16 native-command checks:** source-owned commands create/edit/inspect/review/import/link/export/build; binary bytes outside UTF-8 survive; browser drafts survive native edits; a different existing destination remains unchanged; an erroneous link is removed while its original file remains.
- **5 production-boundary checks:** a valid session at 41,941,840 bytes, just below the actual 40 MiB limit, retains an oversized pending CSV mapping in emergency recovery. Preparing another mapping and submitting a successor cannot erase it. Leaving warns, and the normal emergency download remains available.

The actual result JSONs and complete course source are included under operator/.

## Rendered-browser and operating-system receiving

Open the delivered HTML in the intended desktop browser. Retain the application version and observations from the intake mapping, nine-difference comparison, corrected comparison, document-byte table and Save & recover screen.

Perform this full course against the delivered files:

1. Open the empty desk; ensure the initial UI is an ordinary editable study.
2. Open the first authored edition and inspect all nine differences, including the historical site and wrong billing/workorder link.
3. Open the corrected edition and inspect the three matching report SHA sets.
4. Import a small authorised or clearly authored CSV with noncanonical column names; map its ID and fields in the UI and save.
5. Add an authored binary document, link it to a report, inspect the attachment difference, then remove the mistaken link through the normal control and inspect the retained earlier edition.
6. Start review notes, change a selected input, and confirm the stale draft remains visible until explicitly restarted.
7. Save a complete session and ZIP; close and reopen the session. Confirm pending mapping drafts and prior branches still exist.
8. Open two tabs, edit both, exercise the explicit branch chooser, then continue saving the selected branch.
9. Extract the source on Node 18+. Run the commands below, inspect the output, and open the regenerated HTML:

       node native/onboarding-desk.cjs course --kind first --out receiving-first.json
       node native/onboarding-desk.cjs inspect --in receiving-first.json
       node native/onboarding-desk.cjs course --kind corrected --out receiving-corrected.json
       node native/onboarding-desk.cjs export --in receiving-corrected.json --out receiving-working.zip
       node native/onboarding-desk.cjs build-html --out receiving-desk.html
       node -e "console.log(JSON.stringify(require('./operator/complete-course.cjs')(),null,2))"

Record the exact delivered source identity, browser/Node versions, screenshots and concrete corrections with the operating handover. Runtime observations remain distinct from the executed injected-service courses above.

## Source custody and distribution

prior-first-edition/ retains every original donor file unchanged. Current source masters are enumerated in SOURCE_MANIFEST.json. Biomedical_Onboarding_Desk.html is generated from those masters and contains the full source download. The complete portable working session, including its own originals and private administrative data, is separate from the application source.

Keep actual customer originals within the source owner's authorised storage and delivery arrangements. Save independent complete-session copies as described in OPEN_AND_EDIT.md.
