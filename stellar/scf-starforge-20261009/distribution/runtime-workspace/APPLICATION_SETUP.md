# Application setup snapshots and receiving

The Applications console keeps unfinished setup in its existing tab draft editor.
Complete setup snapshots add named browser storage, portable source documents, and
comparison with newer saved application settings. They feed the same Review and
Save controls used by the original application.

Open the private runtime workspace and select **Applications**. Choose a saved
application and **Edit settings**, or create a new application from the existing
library. In **Configure application**, expand **Complete setup snapshots and
receiving**.

## Keep a complete setup

The existing editor automatically retains changed fields in this tab. Its
**Retained setup drafts in this tab** selector resumes each unfinished application
or tool variant, including fields from a tool temporarily absent from the catalog.
Its **Download current draft** command exports the selected variant in the
original retained draft format.

For a named setup that should remain available after the tab closes:

1. Enter a **Snapshot name**. A blank name uses the application name or tool title.
2. Select **Save complete setup in this browser**.
3. Select the snapshot under **Saved setups in this workspace** when it is needed
   again.

Each save creates a separate complete snapshot. It includes the selected fields,
all retained variants from this setup task, the opening saved revision for each
variant, original field descriptions, available runtime source identifiers, and
previous receiving and reconciliation history. Current empty selections, empty
text and unchecked values remain present in the original raw form records.

**Download complete current setup** exports this complete family directly from the
editor. It works independently of browser snapshot storage. **Download selected
setup** exports a saved or imported complete document without changing the active
editor.

Complete snapshots use this browser's IndexedDB, partitioned by workspace ID.
The tab editor continues to use its original session storage. Browser storage is
local to the current browser profile and origin; changing the private console
origin or clearing browser data can remove access to those copies. Download the
complete JSON file when moving work to another browser or host.

**Refresh saved setups** picks up complete snapshots written by another tab.
**Remove selected browser snapshot** removes the selected snapshot; it does not
discard the active tab draft or a downloaded setup file. IndexedDB version checks
protect the removal and storage of an existing snapshot from concurrent changes.

## Reopen in the original workspace

Select a saved snapshot, or choose its JSON file in **Import a complete setup or
retained draft JSON file**, then select **Reopen selected setup**.

The editor opens the selected variant with its original application ID and opening
revision. Other retained variants return to the original draft selector. A new
setup context keeps other drafts for the same saved application available.

If the application has changed since the snapshot opened, the draft keeps its
fields and displays the revision difference. Use **Compare saved changes**, keep
the complete draft through the existing explicit control, or load the current
saved settings. The original Review action uses the draft's selected revision.

A setup from a different workspace uses **Receive as new application**. The
workspace ID in the document identifies its source; it does not select or change
the currently opened workspace.

## Receive on another host

1. Transfer the complete JSON file to the receiving operator.
2. Open **Applications** in the receiving runtime workspace.
3. Select the file under **Import a complete setup or retained draft JSON file**.
4. Select **Receive as new application**.
5. Select a ready runtime on this host. Inspect host-specific directories,
   installation selections and connection settings in the retained form.
6. Use **Review application**, inspect the native configuration, and **Save**.

Receiving assigns a new setup context in the current workspace. It clears the
saved application binding and runtime selection for every retained variant.
The fields remain available for the receiving operator to configure, and the
source workspace, opening revisions, full original variant records and prior
history remain in the next complete document.

The importer also accepts the original **Download current draft** JSON format.
That file contains its one selected variant. A complete snapshot contains the
whole retained family.

Files are limited to 2 MiB of UTF-8 JSON. Parsing checks the document schema,
workspace and active draft relationship, duplicate variants, raw field shapes,
and agreement between the complete configuration and selected original form.
Setup files can contain operator paths and connection configuration entered in
the form; transfer them using the same private working channel as that setup.

When a source tool is absent on the receiving host, the original draft editor
keeps its fields and shows the retained selection. Install the intended source
catalog, or choose another available tool and continue its separate variant. The
native review reports requirements for the runtime and host paths actually
selected.

## Reconcile concurrent edits

Choose **Compare saved changes** when a saved application has a newer revision.
The comparison reads the current saved application from the original local API
and shows five columns: field, opening value, current saved value, draft value,
and the value to retain.

The comparison handles each field as follows:

| Opening value | Current saved value | This draft | Result |
| --- | --- | --- | --- |
| A | A | B | Keep the draft edit B |
| A | B | A | Keep the saved edit B |
| A | B | B | Keep the shared value B |
| A | B | C | Choose the saved value B or draft value C |

Display name, runtime and settings are compared individually when the application
type is unchanged. Port defaults and checkbox values use their declared field
semantics, so equivalent saved and form representations do not create a conflict.

If either operator changes the application type, its type and complete settings
are compared together. This keeps one tool's fields from being combined with
another tool's configuration. An older retained draft that lacks complete
opening settings requires an explicit choice for that group while the known
display name and runtime can still be reconciled individually.

Select a value for every conflicting field, then choose **Apply reconciled fields
to this draft**. The application is read again before applying the comparison.
If its revision changed again, the screen presents the new comparison and clears
the previous choices. If the active draft changed, compare its current fields
again.

Applying the comparison moves the retained draft to the current saved revision
and carries the selected values into the existing form. The complete setup history
retains the previous baseline and selected source for each field. Use the original
**Review application** and **Save** to save those settings. Those controls retain
their existing request IDs, save tickets and interrupted-request recovery.

## Source layout

The implementation extends the existing Applications components:

| Path | Responsibility |
| --- | --- |
| `public/application-drafts.mjs` | Original tab draft editor, full opening application capture, family receiving and applying reconciled fields |
| `public/application-setup.mjs` | Complete JSON document, source history, field reconciliation and versioned browser snapshot storage |
| `public/application-setup-library.mjs` | Named snapshot, import, receiving and comparison controls inside the original editor |
| `public/applications.mjs` | Fresh saved-state read and opening the existing configuration form |
| `server.mjs` | Local serving of the two setup modules |

The existing Applications library supplies its catalog browsing, search, pins,
recents, selection and operations navigation. The backend application writer,
runtime process lifecycle and source-specific settings review remain the original
product's implementations.
