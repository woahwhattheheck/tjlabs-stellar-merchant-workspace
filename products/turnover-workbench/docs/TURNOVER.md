# Turnover comparison and receiving

This operator compares explicitly normalized cut-event and cue CSVs. Its output is a source-linked review package: old/new event differences, exact proposed frame positions, unresolved repeated uses, reviewed selections, and returned receiving notes. The actual editorial and sound applications remain responsible for changing and checking the media.

## Open a real comparison

1. Obtain two complete event exports for the selected reel, episode or other explicitly named scope, and the cue list anchored to the older cut. Save those originals unchanged.
2. Normalize the exports into the contracts below. Keep the original application exports alongside the normalized files when the export required transformation. Record the tool/version and transform in the edition notes. The desk accepts UTF-8 CSV; it does not parse EDL, AAF, OMF, Resolve projects or Pro Tools sessions.
3. Declare one exact common frame rate with integer numerator and denominator, such as 24000/1001. Frame columns are integer frame counts, with [in,out) ranges: the out frame is excluded. A range 20–40 contains 20 frames. Preserve the actual source/record origins in those counts.
4. Receive the three full CSVs as a named edition. Review each ambiguous, partial, removed or replaced-source cue. Persistent occurrence identifiers may only be populated if the source workflow actually preserves them across versions.
5. Export the full JSON workspace and the comparison/decision CSVs for the recipient. Record a returned note against the exact edition, cue and current review. Append a correction when a review changes. Receive changed original cuts into a new named edition.

Do not enter timecode strings, seconds, floating point rates, drop-frame labels or sample counts in frame columns. Convert only through a documented external process with the actual rate and origin. This core rejects non-1:1 source/record durations instead of silently retiming audio or picture. A cue extending beyond its explicitly referenced old event needs a separately defined scope or mapping before intake.

## Event CSV

Required columns:

```csv
event_id,clip_id,track,record_in,record_out,source_in,source_out
```

Optional columns are `use_id,label`; additional source columns remain in the retained original.

- `event_id`: unique within that particular cut; a row/occurrence identifier. The old and new IDs may differ.
- `clip_id`: explicit stable source identity across both cuts. Use the application's stable media identity or a documented media identity mapping. Matching filenames alone does not establish equivalent media.
- `track`: the explicit track name/ID. A track move is visible.
- `record_in,record_out`: position on that cut's timeline.
- `source_in,source_out`: the clip's original source-frame range.
- `use_id`: optional stable occurrence identity, unique in each cut. Use only when its meaning is known to persist across versions. Blank is valid.
- `label`: readable operator label.

Each record duration must equal its source duration. Negative integer origins are supported; fractional frames, empty ranges and implicit speed changes reject. Canonical integer strings contain no thousands separator, decimal point, leading plus or leading zeroes.

## Cue CSV

```csv
cue_id,department,label,old_event_id,source_in,source_out
```

Each cue ID is unique within the edition. The source range must be contained within its named old event. Department and old event ID are required; the readable label may be blank. One cue may represent a named sound, caption or other downstream element, but the core applies only the same explicit source-frame mapping; it does not infer a department-specific stretch, crossfade or creative treatment.

## How matching works

The source clip identity and overlap of source ranges identify possible new occurrences. A supplied persistent `use_id` resolves a specific occurrence only when the same ID and clip agree. Otherwise a proposal is unambiguous only when it has exactly one source-overlapping new occurrence and that new occurrence has exactly one old source-overlapping occurrence. Repeated footage with overlapping ranges stays ambiguous.

For each cue, the proposed range is the intersection of its source interval with the new event's source interval, translated at 1:1 speed into the new record position. Partial mappings retain omitted head/tail frame counts. A same-use event that changes to a different clip or nonoverlapping source range remains source-replaced, with no invented mapping. Added new events appear separately.

This is conservative by design: the occurrence choice comes from the actual timeline/source identity or a named reviewer. It is never chosen by row order, nearest time, label similarity or matching clip basename.

## Review and receiving

Review decisions:

| Decision | Meaning |
|---|---|
| accept-proposal | Accept the unique complete unchanged/moved proposal. |
| choose-mapping | Explicitly select one of this exact cue/source pair's mapping IDs, including a partial surviving interval. |
| keep-original | Keep the old position as a documented decision; it does not assert correspondence to the new cut. |
| exclude | Exclude this cue from the proposed new handoff while retaining its original and history. |
| needs-work | Leave the cue unresolved with a reason. |

Every review requires a reviewer and a concrete reason. Optional evidence is retained as a complete named UTF-8 text original with byte count and SHA-256. Correcting a review appends a new record with its predecessor ID; it does not replace the earlier decision.

Receiving records require edition, cue, current review ID, named receiver, reference and one of received/accepted/needs-rework. Their notes and optional original evidence travel in the workspace. “Accepted” is the receiver's declared status for the review package; a review record is not a media-conform execution log. An unresolved needs-work decision cannot be accepted without first appending its resolved review. When a review changes, the earlier receiving note remains visible and is marked as referring to the superseded review.

A new source edition begins with no inherited reviews. The old edition's complete source, decisions and receiving history remain available.

## Whole workspace and failures

The core uses immutable return values. Receive/review/receiveNote return a new workspace only after the entire candidate validates. The caller keeps the previous body until that succeeds. Reopen validates the retained hash chain, source byte identities, CSV structures, frame geometry, decision source bindings, predecessor links and receiving relationships.

Save the whole JSON workspace to retain all editions. CSVs and the HTML report are useful receiving products; the complete workspace is the continuation format. Original names/text, including UTF-8 BOM and CRLF, remain retained exactly. Browser UI should preserve rejected/pending file drafts in its own full saved desk copy; a rejected core intake does not create a new edition.

The current source admits up to 10,000 rows per original CSV and 10,000 retained operations per workspace. Split larger real projects by an explicit operational scope such as reel/episode and retain the scope definition in notes. No native application, network, database or media path is mutated by this core.

## Pure JavaScript API

```js
const core = createTurnoverCore();
let workspace = core.create({id:"film-reel-01",label:"Reel01 turnover"});
workspace = core.receive(workspace, {
  id:"v07-v08", label:"v07 to v08",
  rate:{numerator:"24000",denominator:"1001"},
  old:{name:"v07.csv",text:oldCsv},
  next:{name:"v08.csv",text:newCsv},
  cues:{name:"cues.csv",text:cueCsv},
  notes:"Actual source applications, versions and normalization method."
});
const comparison = core.compare(workspace,"v07-v08");
workspace = core.review(workspace,{
  editionId:"v07-v08", cueId:"cue-1",
  decision:"choose-mapping",
  selectedMapping:comparison.cues[0].mappings[0].id,
  reviewer:"Named reviewer", reason:"Actual occurrence-selection reason."
});
const current = core.compare(workspace,"v07-v08").cues[0];
workspace = core.receiveNote(workspace,{
  editionId:"v07-v08",cueId:current.cueId,reviewId:current.review.id,
  receiver:"Named receiving editor",status:"received",
  reference:"Actual receiving message/file reference",notes:"Actual returned notes."
});
const portable = JSON.stringify(workspace,null,2);
const reopened = core.reopen(portable);
```

`editions(workspace)` returns the full source originals and rate/identity/count metadata for each edition. `compare` returns eventChanges, addedEvents, cue proposals, current review/receiving records and their complete histories. `csv(workspace,editionId,kind)` supports cues/events/added/reviews/receiving. `report` returns a complete offline HTML with all source originals, histories and downloads. An optional expectedRevision on mutation requests rejects a stale prepared action.

## Native command line

The included native CLI uses Node.js standard modules and the same maintained core. All output files/directories are create-only: choose new paths and keep the previous workspace.

```sh
node native/cli.mjs create --id reel01 --label "Reel01 turnover" --out empty.json
node native/cli.mjs receive --workspace empty.json --out received.json \
  --id v07-v08 --label "v07 to v08" --rate-numerator 24000 --rate-denominator 1001 \
  --old v07.csv --next v08.csv --cues cues.csv
node native/cli.mjs review --workspace received.json --out reviewed.json --request review-request.json
node native/cli.mjs note --workspace reviewed.json --out returned.json --request receiving-request.json
node native/cli.mjs export --workspace returned.json --edition v07-v08 --out new-receiving-package
node native/receive.mjs new-authored-course-output
```

Request JSON uses the same review/receiving object as the browser API. The CLI reads each original once as strict UTF-8, preserves BOM and line endings, and writes its exact text when exporting. Export writes the complete workspace, HTML, comparison JSON, five CSVs, all three source originals and a full byte/hash manifest. The manifest is written last; its presence identifies a completed export.

## Included authored course

The complete authored case has eight old events, eight new events and eight cues at 24000/1001 fps. Its initial comparison contains one unchanged cue, two moves, one partial trim, two repeated-use ambiguities, one removal and one replaced source range. All eight receive explicit review decisions; the replaced dialogue remains needs-work. The partial cue retains 10 omitted head frames and a returned needs-rework note. A correction to the unchanged cue demonstrates that the earlier receiving acknowledgment becomes stale. A later named cut moves the dialogue a further 24 frames and begins its own review history.

The maintained receiving course passed 17 material checks when executed against the actual production source in V8. The saved result identifies that runtime precisely. The Node runner is included for native continuation using the same course; browser and application receiving results should be recorded from their actual environment.

