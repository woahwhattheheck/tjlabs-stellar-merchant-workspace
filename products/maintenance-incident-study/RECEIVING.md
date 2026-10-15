# Receive the complete maintenance application

Keep the complete source tree and SOURCE_MANIFEST.json together. Record the exact delivered HTML/source identities with actual receiving output.

## Native receiving

With Node 18+ in the source root:

```sh
node operator/run-course.cjs
node native/maintenance-desk.cjs course --kind first --out received/first.json
node native/maintenance-desk.cjs inspect --in received/first.json
node native/maintenance-desk.cjs course --kind corrected --out received/corrected.json
node native/maintenance-desk.cjs export-directory --in received/corrected.json --out received/complete-working
node native/maintenance-desk.cjs knowledge-digest --in received/corrected.json --side returned --id K1
node native/maintenance-desk.cjs build-html --out received/Maintenance_Incident_Knowledge_Study_Desk.html
node native/maintenance-desk.cjs source-zip --out received/complete-source.zip
```

Retain actual Node/OS version and stdout/stderr. The full runner executes maintained source; its injected handler/filesystem exercises are distinct from the actual filesystem commands above. Compare rebuilt HTML bytes with the delivered standalone HTML.

Read comparison.md and maintenance/report.md as ordinary documents. Check the complete session, field-availability manifest, exact original CSVs, diagnosis/knowledge documents and recovery index. The authored corrected study has zero source differences, ten eligible incidents and explicit unresolved/abstained/failed outcomes.

## Rendered browser receiving

1. Open the final HTML and confirm the empty operational study and normal editable sections.
2. Open the authored first return. Inspect its three changed fields and two changed-document findings.
3. Open the corrected return. Read the three denominator views, exact used symptoms, supplied ranks, later cause sets, four dated incident states and reviewed knowledge/handover.
4. Upload a UTF-8 CSV with BOM/CRLF. Leave a pending mapping, change sections and return. Apply it and download its exact original.
5. Prepare a record correction, change the selected extract elsewhere and verify the old draft cannot update the new edition. Retain the old draft, then prepare a valid correction.
6. Prepare a knowledge source review from the exact content edition. Confirm the digest is filled while decision, reviewer and actual source evidence remain for the operator to supply. Revise content and verify earlier approval becomes historical/unbound.
7. Retain a binary or image original, record source availability with its locator, link it to an exact record and inspect the changed byte comparison. Remove only the link; preserve bytes and earlier study.
8. Start a whole-study review, edit the study and verify the earlier draft is stale. Restart explicitly, retaining its old notes.
9. Use two tabs on one browser origin. Save different labels, observe conflict, adopt the intended branch and make another saved change. Both full branches remain recoverable.
10. Download complete session, working ZIP and source ZIP. Reopen in a fresh context with unfinished forms and history intact. Read ordinary reports and compare exact original bytes.

Record actual browser/version, source/HTML identity and any concrete receiving defect with its complete input/output. Preserve company records privately under the authorised local arrangements. This offline app retains source and working history; deployment authentication and remote CMMS access are separate systems.
