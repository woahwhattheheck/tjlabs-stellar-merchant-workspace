# Complete browser receiving course

Use the actual output/Costing_Desk.html in a current browser. This course follows one coherent fictional source operation. Retain the exact browser name/version, opening path and observed results with the received source. Source-only execution is described in commissioning/source-execution.json and remains distinct from this actual browser course.

1. Open the supplied blank desk in a fresh profile or use Open and restore → New blank workspace. Confirm zero originals, zero editions and zero reviews. Enter a named preparer and an incomplete input such as {"unfinished": in the full input JSON. Save complete working JSON. Close and reopen that JSON through Open and restore; the exact incomplete input must remain.
2. Open and restore → Open clearly authored example. The previous draft-only session must appear in Retained previous sessions. Read the example name and its source files as fictional authored data.
3. In Original sources select the supplied authored candidate receipts CSV. Inspect its exact rows. Verify ID, unit, quantity and monetary strings against the complete original. Use Download exact original and compare its byte count and SHA-256 with the source manifest.
4. Choose the matching lots target. Fill exact column choices or enter explicit mapping strings. Preview first. Change the mapping and confirm the previous preview visibly becomes stale. Restore the intended mapping and preview again.
5. In Saved editions select the authored baseline and use it as corrected input. This retains previous pending input. Apply mapped rows only to the explicitly chosen draft table; verify the target preview before choosing append or replace.
6. In Cost model edit the selected receipt or cost record through its scalar editor, retaining the source references. Leave invalid row JSON pending, switch sections, save editable HTML and reopen it. Confirm that the unfinished row and complete draft survive. Restore the intended row and Apply current record.
7. Give the corrected edition a name, preparer and reason. Preview complete calculation. Check all errors, warnings, cost statuses, exact numerators/denominators and coverage flags. Change the name or input; the old preview must become stale. Preview again and freeze the complete edition. Confirm its parent, preparer and note in the full frozen record.
8. Compare the exact baseline and corrected edition. Read both scope contexts and all noncomparable reasons. Confirm changed source costs propagate only through the selected lot/BOM/batch/channel relationships.
9. In Named review select the corrected edition. Enter reviewer, decision and explanation of permitted use. Retain the decision. Verify the original edition and earlier review records remain.
10. Export complete report JSON/CSV, selected comparison JSON/CSV, domain workspace, complete working JSON, editable HTML, full source and complete handover ZIP. Reopen domain JSON separately and confirm the same immutable domain root. Reopen working JSON and HTML and confirm pending drafts and prior sessions also remain. Inspect the ZIP's original files and source manifest.
11. Restore the original draft-only session. Confirm its invalid draft text remains and the completed cost session is retained as a previous session. Restore that completed session again.
12. Open two tabs from the same desk. Edit and save one tab. The other must report that the browser copy changed while preserving its local work. Export both. Use Open and restore to explicitly retain and select the chosen version; confirm both histories remain recoverable.

Native source commands, run in the unpacked source directory:

    node native/build-desk.mjs output/Costing_Desk.html
    node native/receive-desk.mjs

The build command creates a new destination and refuses to overwrite an existing output. The native receive command exercises the unchanged session and domain APIs over the authored source. Complete browser interactions above establish the rendered-interface result separately.
