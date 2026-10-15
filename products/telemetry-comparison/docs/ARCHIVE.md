# Complete shared working archives

The current operator and native API keep the original telemetry workspace and numerical meaning. The shared working archive is an additional lossless portable format for repeated originals, exact rational values, source references and frozen report structures.

## Use the maintained module

```js
import { createTelemetryAPI } from "./telemetry/core.mjs";
import { createArchiveAPI } from "./telemetry/archive.mjs";
const api = createTelemetryAPI(runtime);
const archive = createArchiveAPI(api, runtime);

// The same selected runtime supplies SHA-256 and exact UTF-8.
const saved = archive.serialize(currentWorkspace);
// saved.filename = Telemetry_Shared_Workspace.json
// saved.content, bytes, sha256, workspace and nodeCount are complete.

const reopenedWorkspace = archive.receive(downloadedText);
// Accepts the original full JSON or the new shared working JSON.

const detail = archive.inspect(saved.content);
// Checks input format, node structure, reference order, declared lengths,
// depth and expanded size before constructing the expanded working object.

const reopened = archive.open(saved.content);
// Reconstructs every original JSON byte, verifies its SHA-256 and root,
// then independently replays the original engine operation history.
```

The UI's existing save/download control can offer the shared format while retaining the full original format. Its existing open/import control should pass either format to `receive`. A working copy must still preserve every unfinished form and proposed command through the existing draft lifecycle. This module represents the workspace only; an operator's complete draft wrapper must keep its existing fields alongside the selected workspace archive and restore them through its original validated adoption path.

The native CLI accepts either file as `--workspace`. Every native output still includes the full `Telemetry_Workspace.json`, every original, all full reports and paired CSVs, the complete application source, and the additional `Telemetry_Shared_Workspace.json`. The smaller portable file does not reduce the total complete handoff by deleting the original/report outputs.

## What is retained

Strings, booleans, finite JSON numbers, nulls, arrays and ordered object members have explicit node types. Identical complete nodes share a reference. Source Base64 is retained unchanged. Exact decimal and rational strings remain strings. The format makes no rounded summary substitute for an occurrence or paired value.

References must name earlier nodes. All object keys must be unique strings. Before reconstruction, the reader calculates each node's expanded UTF-8 JSON size and depth, requires the root size to match the retained original workspace, and enforces the original 128 MiB expanded workspace limit. The input is also limited to 128 MiB, four million nodes and depth 256. Every reconstructed byte is then checked against the original full workspace digest. The original model's replay remains the final source/history validation.

## Calculation reuse between frozen editions

The engine can reuse a previously valid calculation when only a prediction model's declared identity, version or note changes. These fields are still retained in the new report and input commitment. The complete key retains all point definitions, source identities, mappings, unknown fields, units, scope, cadence, clock, calibration, quality, duplicate and alignment policies.

Every cache hit verifies the actual complete referenced source bytes. Invalid or inconsistent declarations for the same logical prediction run fall back to the original calculation and retain its ordinary findings. Invalid reports are not reused. Calibration changes, different prediction or observation sources, and changed calculation settings require their own calculation. Editing a returned preview cannot modify the retained cache. The cache is local to one API instance, limited to two reports and a total of 32 Mi UTF-16 code units; it is not persisted as a substitute for originals.

A version label alone does not prove a changed physical model or improved energy use. Comparisons retain both model declarations and the original measured-cohort semantics.

## Receiving and measured scope

The original nineteen-case receiving course remains unchanged. The same native entrypoint now additionally operates the shared archive and checks full original bytes, fresh-API reopening, source preservation, unchanged-calculation reuse, mutable preview isolation, calibration findings, inconsistent run declarations and invalid archives.

```
node native/run-telemetry-course.mjs /existing-parent/current-course
node native/run-telemetry-course.mjs /existing-parent/current-capacity --capacity
node native/telemetry-cli.mjs receive --workspace /private/Telemetry_Shared_Workspace.json --out /existing-parent/received
```

The authored 1,000-timestamp × 12-point capacity course retains its original two-edition calculation, comparison, full export and history replay, then measures packing and reopening the complete shared archive. Its capacity API instance is reused, so these are warm-cache timings. The separate archive course constructs a fresh API instance for independent reopening. V8 source execution is not a Node, browser or facility-physics timing.

The predecessor capacity result and full source remain in the source history. Current actual measurements are retained separately under verification; they do not overwrite that earlier result. No additional provider, browser launcher or execution controller is introduced.
