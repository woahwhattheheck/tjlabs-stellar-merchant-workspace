# Agency operator configuration

Copy this directory to an agency-controlled private folder and rename pilot.template.json to pilot.json. Set productSourceDirectory to the absolute installed `ocds/` source directory, workspaceRoot to its private client-store parent, and operator to the assigned operator name. Record the installed product commit in productReference.installedCommit.

Assign each actual client a separate portfolio entry. Add that client's selected original OCIDs to selectedOcids and its saved publisher requests to source-selections.json. The initial empty entries preserve separate client stores until those assignments are configured. The [source-window guide](../../SOURCE-WINDOWS.md) gives the complete selection, refresh, review and handover commands.

source-contexts.json holds original public notice and tracker context. Its optional nativeDeadline binding is an exact pointer and literal from the original current edition; use expression-of-interest and tender deadlines with their distinct meanings. source-acquisitions.json can receive complete original record responses acquired by a connected source reader; source-originals.json can retain actual acquired attachment files. Each register records the actual original operation and its bytes, URL and time or observed completion bound. documents.json and retrievals.json retain any separate original-document register or retrieval records used by the agency.

```sh
ocds-agency init --config /private/agency/pilot.json
ocds-agency source-select --config /private/agency/pilot.json
ocds-agency refresh --config /private/agency/pilot.json --name baseline --out /private/agency/runs/baseline
```

The caller writes one current tracker row per portfolio ID and original OCID, plus a complete editable handoff for each selected client. Keep the received source context and original-body folders together when moving a handoff.
