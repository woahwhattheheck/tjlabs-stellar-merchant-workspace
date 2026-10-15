# Operating the shipment commissioning desk

Open Shipment_Commissioning_Desk.html. Enter the recording operator. The empty workspace is ready for a real authorized case; Overview can also open the complete authored worked example.

## Reference and observed work

1. Retain original files in Originals. Enter their origin and description. JSON output captures are retained as original files before mapping; PDF, images and other supporting documents remain intact for human reference.
2. Create a Reference case with a title, scope, reference owner and ordered checkpoints. For every checkpoint enter original references with precise pages/cells/spans, expected document-to-shipment bindings, typed field values and ownership, and gate status/missing fields. Large numeric identifiers must be entered as their exact decimal text, with the correct type.
3. Save the reference edition and record its named review. Editing a saved case creates a new edition and clears approval. Existing runs keep their original frozen reference.
4. Configure Output mapping with JSON Pointers into the agreed captured output. Each list pointer selects an array. Column pointers are relative to each row. The default shape belongs to the authored example and is not asserted to be a vendor API.
5. Create a Run against an approved case, stating method, deployed product/configuration and scope. Select each checkpoint and add an output capture from a retained JSON original. State observed timestamp and delivery/retry context. A newer capture does not remove the prior capture; selecting a different capture clears the run review.
6. Inspect differences and underlying source locators. Record the named review with a disposition for remaining differences. Every checkpoint must have a selected capture before review, including a checkpoint with no expected rows.
7. Record effort with actual performer, phase, timestamps, active seconds and measurement conditions. Numeric differences appear only for the same frozen case, explicitly comparable records and equal phase coverage. Results remain case-specific.

## Recovery and portable handover

All ordinary editor fields, navigation, workspace and prior branches are saved as one browser session. A storage failure keeps current work in memory, shows the failure and warns on closing. Save complete session JSON for portable recovery. Workspace JSON is the replayable domain state; it excludes unsaved form drafts.

Another tab's changed branch is never silently overwritten. Use Open and restore → Open saved browser branch to explicitly choose the current saved branch. This atomic choice retains both full preimages and acknowledges that exact saved branch. A later concurrent change still causes a conflict. A retained branch can be restored deliberately. Opening a portable file downloads the current session first and retains its complete prior branch.

File import is reserved as a single busy operation across reading, validation and adoption. Navigation and editing are disabled until it finishes. A loaded session is replay-validated before replacement.

Handover exports complete workspace, original commands, per-run findings, effort, readable report, full session and original bytes. Source-native files remain in the separate full source package supplied with this desk.

## Worked example

Two fictional shipments share a weak container reference. Four checkpoints cover initial booking, quantity amendment 100→90, exact amendment retry and a late revision-1 document. A locked reviewed consignee and a numeric reference above JavaScript's safe-integer limit are retained. The first authored output edition has thirteen differences; the corrected authored output edition has zero. The four-minute timing difference is authored example data, not a measured customer outcome.

Switching or starting a reference-case or output-mapping editor retains the complete prior editor state in Open and restore. Original download paths and report filenames use safe hash identifiers; the index preserves each original name and logical ID.

For runs with differences, the review form includes a responsible owner and next action or accepted explanation for each current finding. A changed capture selection expires that review; previous review commands and unfinished disposition drafts remain retained.
