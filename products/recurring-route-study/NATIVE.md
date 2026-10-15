# Node18+ native workflow

Use the supplied complete source directory. The native CLI uses Node's standard libraries and the maintained application modules; no package install is required. Outputs are exclusive: an identical existing file is accepted, but a different existing file is never replaced. Use a new destination for each revision.

```sh
node native/route-desk.cjs course --kind complete --out work/route-course.json
node native/route-desk.cjs inspect --in work/route-course.json
node native/route-desk.cjs new --label "October route study" --out work/route-new.json
node native/route-desk.cjs import-csv --in work/route-new.json --kind stops --side source --file supplied-stops.csv --available-at 2026-10-12T07:00:00Z --out work/route-stops.json
node native/route-desk.cjs export --in work/route-course.json --out work/route-export.zip
node native/route-desk.cjs export-directory --in work/route-course.json --out work/route-export
node native/route-desk.cjs build-html --out Recurring_Route_Study_Desk.html
node native/route-desk.cjs source-zip --out Recurring_Route_Study_Source.zip
node operator/run-course.cjs
```

Import mapping defaults to exact matching canonical header names. Supply --mapping a JSON object covering every canonical field when the actual source uses different headers. An empty mapping value means unobserved, not blank. The original text, UTF-8 BOM and line endings remain intact.

Commands include new, course, inspect, set-config, import-csv, select, crosswalk, match-ids, add-document, link-document, unlink-document, document-availability, route-plan, record, review, import-session, restore-edition, open-branch, export, export-directory, build-html and source-zip.

route-plan takes --file containing a partial patch of the actual config.route fields. It refuses unknown plan fields. record takes a JSON value with kind, side, row_index and the full canonical value object; use null row_index for a new row and provide --reason and --at. An actual study correction preserves its prior extract.

add-document retains arbitrary bytes with --file, optional --type and --notes, and explicit --available-at. link-document requires side, kind, record, document and available-at. document-availability requires exact --digest and --metadata-digest for the selected document plus the new availability and source-backed reason. Compute those from the inspected retained source; a stale metadata digest is refused.

review requires --digest, --role, --reviewer and --decision accepted or revise; optional notes and explicit at retain the actual review record. Both configured roles refer to the complete applied-study digest.

Native input accepts the complete ordinary session or an applied study. Native edits preserve unfinished browser forms, branches and history. Import an emergency-recovery envelope through the browser's recovery interface before native use. Study-only input intentionally has no unrecorded browser forms; keep the complete session for portable handover.

The source builder reads SOURCE_MANIFEST.json once, checks every source member and emits that same captured manifest. The renderer sorts inputs itself. Normal and reversed source-list ordering produce identical standalone HTML.
