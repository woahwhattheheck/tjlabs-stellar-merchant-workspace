# Turnover Workbench

Open Turnover_Workbench.html for a new project, or Turnover_Worked_Example.html for the complete authored two-edition case. Each standalone file includes the complete runtime and data.

## Receive an actual cut comparison

The workbench has a separate whole workspace. Its original inputs are two event CSVs and one cue CSV, all in a single explicitly declared rational rate. The source contract and API are in docs/TURNOVER.md.

Event headers:

```csv
event_id,clip_id,track,record_in,record_out,source_in,source_out
```

Optional event fields are use_id and label. The cue contract is:

```csv
cue_id,department,label,old_event_id,source_in,source_out
```

All positions are canonical integer frame counts and half-open intervals [in,out). The out frame is excluded. The event's source and record duration must match: this operation describes a selected one-to-one mapping. Preserve a stable source media identifier in clip_id. Only supply use_id when the original workflow actually maintains that occurrence identity across versions. Repeated footage without that identity remains an explicit reviewer choice.

Keep the original application exports alongside any normalized CSV and record the transformation, source/record origin, actual software versions and selected scope in the edition notes. The workbench accepts the declared CSV contract; it does not parse native project, AAF, OMF, EDL or session files. Actual retimes, transitions, handles and channel behavior must be resolved through the real application and recorded in the pilot scope.

Load the three complete originals, name the comparison, enter the common numerator and denominator, and press **Create immutable comparison edition**. CSV file imports use strict UTF-8 byte decoding. The complete input text is retained, including its original filename, BOM and line endings; malformed UTF-8 is rejected rather than replaced. Pasted source text is preserved as entered. Whole workspace JSON is parsed separately as JSON. Rejected source drafts remain editable; no partial edition is adopted.

## Review mappings and actual receiving

Select a cue to see its old position, status and every candidate mapping. The table retains new event and track, source interval, new record interval, frame offset and omitted head/tail. Accept a unique complete proposal or choose one explicit candidate. For removed or replaced material, record a meaningful keep-original, exclude or needs-work decision. Reviewer and reason are required.

A corrected decision appends history. A receiving note binds the current recorded review, including receiver, actual returned status, file/session reference and retained text evidence. If the review changes, an older receiving note stays visible but becomes superseded. A needs-work decision cannot be recorded as accepted until its review is resolved. A new cut edition receives its own review history.

The readonly history panel carries full decisions and returned evidence. Download the complete review report for sources, comparisons, review history and five CSV products. Download originals when the receiving editor needs to check the exact file. Record the actual native result and measured effort in the partner pilot record, linking its comparison edition and full workbench workspace.

## Workbench recovery

**Save complete copy** writes an independent IndexedDB copy and updates the head only if the saved version still matches the one opened. Two tabs produce retained separate proposals when their heads differ. **Open saved head** and **Open selected copy** preserve the current dirty state before adopting another complete body.

**Download full workspace** includes every source edition and command, the selected edition/cue, all unfinished source text, review drafts and receiving drafts. The saved JSON wrapper validates its complete core history and each draft's exact edition/cue/review binding when opened. Export and reopen that whole file to continue independently.

If storage fails, the current state remains in memory. Export it first. Adoption can then continue after confirmation that this exact file was saved; a further edit requires a new export. Input controls are locked during asynchronous file or copy operations, so an operation retains its original selection. Keep the complete JSON when moving between browsers or origins, because browser-local storage belongs to that origin.

Use a stable localhost origin when browser policy limits storage for downloaded files. For example, from the extracted directory, `python3 -m http.server 8765 --bind 127.0.0.1`, then open the files at http://127.0.0.1:8765/. Portable JSON export remains the continuity path.


## Native continuation

From this product directory, run `node native/build.mjs new-app-directory` to regenerate both standalone applications. Run `node native/receive.mjs new-course-directory` for the maintained authored receiving course. See [the complete CSV/API/CLI guide](docs/TURNOVER.md) for receive, review, returned notes and create-only package exports.
