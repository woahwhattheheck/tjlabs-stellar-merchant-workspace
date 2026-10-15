# Manufacturing study processor

This is a companion to the prospect workbench. It turns a plant's recorded interval tables into a readable source-indexed study, preserves every original CSV body, and compares actual analyst effort on the same footage. It takes no video and performs no machine-control operation.

## Start

With Node.js available, run `node native/study.mjs template NEW_INPUT_DIRECTORY`. Choose a new directory. Open study.json and set the study label. Fill the four CSVs with the plant-approved observation. Leave them header-only to retain a blank template.

Run `node native/study.mjs run INPUT_DIRECTORY NEW_OUTPUT_DIRECTORY`. Both paths are explicit. The output directory must be new. The command writes Complete_Study.json, Study_Report.html, Cycle_Results.csv, Effort_Comparisons.json, original CSV and study.json copies and Manifest.json. The complete JSON also retains the exact configuration body with its SHA-256. Original UTF-8 BOM, CRLF and quoted multiline values are retained in the source copies; a configuration BOM is removed only for JSON parsing. Invalid inputs fail before the output directory is created. If an I/O failure interrupts publication, preserve that partial directory and rerun to another new destination.

## Original recording and cycles

recordings.csv supplies the clip ID, original reference, optional original video SHA-256, explicit seconds timebase, complete recording duration, permission owner and recording date. A supplied video hash is retained metadata; this processor cannot verify video bytes it has not received.

cycles.csv supplies a unique cycle ID, recording, study ID, product revision, station, explicit start/end seconds, yes/no inclusion, exclusion reason, quality record and reviewer. The timing window is explicit; it is not inferred from the first/last labelled element. Each excluded cycle needs a reason and remains in the complete result. Different study/product-revision/station combinations produce separate descriptive groups. The reported minimum, median and maximum summarize the included observed cycles only.

## Work elements and overlap

elements.csv supplies a unique element ID, cycle, track, kind (manual, machine or wait), start/end seconds, description and reviewer. All intervals must fall inside the selected complete cycle. Within a cycle, a track has one kind. Use different tracks for distinct operators or machines.

Elapsed time is the cycle window. Each kind's span is the union of its intervals. Manual-machine overlap is their intersection. The complete labelled coverage is the union of all elements; the remaining interval stays visible as unlabelled. Summed manual-track seconds describe the separate tracks, and may exceed elapsed time when several tracks overlap. Keep these quantities separate when interpreting capacity or work allocation.

## Analyst effort

effort.csv records an actual comparison ID, method (current or studio), tool/version, recording, cycle IDs separated by a pipe, recorder, timezone-bearing start/end timestamps, phase (prepare, label, review or export) and notes. Record active work intervals; break time is omitted by ending one interval and starting another.

A paired comparison uses exactly the same recording and cycle set, one tool version per method and the same measured phase set. Missing methods or phases remain visible without a numerical saving. An individual recorder's active intervals cannot overlap, including across methods. Different people may work concurrently and contribute separately to person-seconds. Different recorder sets are shown explicitly. The reviewer interprets experience, learning order, output quality and work-scope differences before drawing a conclusion.

## Receiving

The application should be opened and used in the actual target browser before external product delivery. Inspect the report with real selected inputs at desktop and narrow width, read the original files, and reopen the complete JSON. Source execution checks arithmetic and retention; it does not establish a rendered browser or native Node run. Existing equipped receiving owns that operation.

The companion is for measured station work and observed analysis effort. A process change is a separately approved plant trial with retained product/process revision and quality criteria. The included observation templates have no populated performance measurements.
