# Complete maritime project receiving and reopening

This is an additive delivery of the original operation `ECONDB-MARITIME-PERIOD-WORKSHARE-BBBD-20261013`. Keep its original commissioning case and equipped receiving owner. It uses the existing Econdb analysis and native edition receiver. It does not acquire another API credential, invent a request filter, issue a purchase or trigger hosted Actions.

## What a project contains

A project groups explicitly selected source views. Each entry selects one retained current edition, an optional retained previous edition, and a local half-open date range. An entry can also select two local periods for comparison. Previous editions are supplied explicitly; filenames, timestamps and neighboring folders are not used to infer a pairing.

The complete immutable destination contains:

| Member | Purpose |
| --- | --- |
| `report.html` | Offline project overview with per-entry source semantics, coverage and review findings |
| `observations.csv` | Combined annotated selected observations; original entry, edition, request and source identities remain on each row |
| `project-analysis.json` | Complete structured project result, including distinct unknown states and exact decimal strings |
| `browser-workspace.json` | Complete editable browser workspace with original response/descriptor pairs and exact calculation binding |
| `project.json` | Portable configuration with paths under `originals/<entry-id>/current` or `previous` |
| `originals/<entry-id>/<role>/` | Exact original response, descriptor, receiving state and original edition manifest |
| `entries/<entry-id>/` | Original per-edition report, selected CSV/JSON, source binding and any explicitly requested comparisons |
| `source/` | Exact period/project engines, native receivers, CLIs, offline workbench, workbench builder and active instructions |
| `project-state.json` | Input configuration, exact source/edition bindings and original build identity |
| `project-manifest.json` | Length and SHA-256 of every delivered member except the manifest itself |
| `REOPEN.md` | This guide, kept alongside the outgoing project |

Counts in the overview count entry-level source cells. Two views of one edition both contribute their selected-cell counts. Capacity, container volume, different ports, requests, populations and source roles are never summed into a cross-measure total.

The CSV is a spreadsheet-oriented export. Its explicit status separates known, null, absent and unsupported values. JSON preserves exact decimal strings and original numeric lexemes. Empty selections remain empty. Unknown source values are never replaced with zero. A documentation example without a LOCODE remains unassigned; it is not represented as an acquired customer port.

## Runtime and actual source limits

Use the existing Linux receiving host with Node.js 22 or later and the existing `flock` command. Project receiving uses only Node built-ins and the included application modules. It needs no new npm installation, network call, payment or account change.

The native product accepts 1–48 explicitly selected entries and at most 500,000 current-plus-previous source cells across the whole project. These are technical bounds; they do not expand an agreed customer scope such as up to twelve ports and two source editions. Each native file is limited to 128 MiB and the complete handover to 2 GiB. Source editions must be complete original native receiving directories; retain an external raw response through the original `maritime-cli.mjs receive` operation first.

Use a private disk directory with enough available space for the originals and reports. The project-managed writer checks available filesystem blocks before writing its members; it does not use effective-user privileges to consume reserved blocks. Each child report runs through the unchanged original edition receiver, which removes its own incomplete temporary directory on a returned write failure. An abrupt process interruption can leave that temporary directory for the exact project continuation to reconcile. The project creates no new shared-memory staging root. Partial receiving remains beside the selected target if storage or execution fails.

## Choose the original source editions

`project.json` uses schema `econdb.maritime-project.v1`:

- `id` is a lowercase file-safe project identifier.
- `title` is the operator's project title.
- `entries` is the ordered array of original views.
- Each entry has `id`, `title`, `current`, `selection: {from, until}`.
- `previous` is an optional explicit original edition directory.
- `before` and `after` are either both omitted or both explicit `{from, until}` ranges.

Edition paths are resolved relative to the input project file. Calendar selection is local: `from <= original Date < until`. The receiver does not add from/until query parameters to an Econdb request. Source endpoint, flow, operator/top selection, measure, population, frequency and original URL remain attached to the exact retained source.

The repository's `examples/project.json` selects the two actual issuer documentation examples already used in the original receiving course:

| Entry | Retained directory | Local selection | Period comparison |
| --- | --- | --- | --- |
| capacity | `editions/issuer-doc-capacity-by-operator` | 2022-02-01 to 2022-04-01 exclusive | February versus March |
| traffic | `editions/issuer-doc-container-traffic` | 2022-02-01 to 2022-04-01 exclusive | None |

Both examples keep `source_role: issuer_documentation_example` and null LOCODE. They contain fifteen selected source cells and one null cell. Their use exercises the retained published source; it does not establish authenticated API access or a named port.

After the original two receive commands have written those directories under the existing operation's `$WORK/editions`, copy the original example project file to `$WORK/project.json`. Do not synthesize customer rows or create another project case for verification.

## Build the complete project

From the existing application source directory:

```sh
node maritime-project-cli.mjs build --project "$WORK/project.json" --out "$WORK/project-delivery"
node maritime-project-cli.mjs inspect --project "$WORK/project-delivery"
```

The builder:

1. Opens each source with the original `openEdition`, verifies every original manifest member and checks the complete directory membership.
2. Normalizes the project into portable paths and binds the original response, descriptor, receiving manifest and exact source-module identities.
3. Holds one kernel `flock` lease for the selected destination while receiving into its private sibling `.project-receiving` directory.
4. Copies the exact original edition bytes and invokes the original `analyzeEdition` for each entry.
5. Writes the combined analysis, CSV and offline HTML, checks source stability, flushes the completed files and publishes the directory by rename.

The stable `.project.lock` file is bookkeeping for the kernel lease. It is not an active process and should not be deleted to force another build. If the parent exits, the lock child receives stdin EOF and the kernel lease ends. Another active builder is refused without creating a second publication.

Rerunning the same command is an exact continuation. A completed destination is reused only after every manifest member, source module and input binding agrees. A changed completed destination is preserved and refused; select a new explicit destination for a new source edition or configuration.

The initial staging directory is published only after its complete input binding is flushed; an abrupt exit during initialization can leave a separate uniquely named initialization directory, which the next build does not consume or overwrite. An interrupted staging directory is reused only when its retained full binding matches. Under the same acquired lease the receiver removes only its exact abandoned temporary-write files and original analyzer temporary directories. Existing complete child reports are verified and reused. Mismatched stages and incomplete published destinations are preserved and refused; no customer source or prior publication is overwritten.

## Open and use the outgoing project

Open `$WORK/project-delivery/report.html` directly in the recipient's browser. It is self-contained and requires no web server. Follow each detailed-report link, open the original response and descriptor, download the combined and per-entry CSV/JSON, and use the actual period/revision links where selected.

The included `source/maritime-workbench.html` is the original offline interactive workbench; its complete operating course travels in `source/OPERATOR_GUIDE.md`. Open it and load one of the actual retained originals with its matching descriptor. Operate the relevant local date selection and comparison controls, inspect unknown values, and reopen the saved workspace using that same outgoing source edition. The project overview deliberately preserves separate entries rather than combining different measures into a financial or traffic total.

Use the actual screenshare width and a narrow/mobile width. View the actual rendered screens or screenshots yourself. Check legibility, horizontal overflow, download links, selected-source labels, populated and empty local selections and visible error handling through the existing full receiving course. Capturing screenshots without viewing them is insufficient.

## Independent portable receiving

Copy the complete project directory intact through the original authorized delivery route. No absolute source-host path is needed after receiving. Use the included source CLI:

```sh
node RECEIVED_PROJECT/source/maritime-project-cli.mjs inspect --project RECEIVED_PROJECT
node RECEIVED_PROJECT/source/maritime-project-cli.mjs reopen --project RECEIVED_PROJECT --out NEW_RECEIVING_DIRECTORY
```

The receiving destination must be separate from the original directory. Reopening first checks every delivered member and exact included source identity, then rebuilds from the retained originals into the new destination. It requires identical input binding, project analysis, combined CSV and project HTML. Per-entry receiving timestamps belong to their actual new build; source observations, source IDs and original descriptor/receiving bytes stay unchanged.

Open `NEW_RECEIVING_DIRECTORY/report.html` and use its actual links and downloaded files. Reopen the included interactive workbench and its saved workspace. Preserve the original receiving result with the existing operation; do not report native/browser completion from a source-only review.

For a deliberate source upgrade, retain the old complete publication. Build a new explicit project edition with the upgraded source and original selected inputs. A different source module is never silently treated as the same received application.

## Rendered-product and attachment requirement

Before calling any customer/prospect-facing application, report, dashboard or export ready, run/open/render the exact outgoing version, view its actual rendered screen or real screenshots and operate the important controls. Inspect screenshare and narrow/mobile widths where relevant, populated/empty/loading/error states, downloads, exports and reopening. Open and use every outgoing attachment and archive member as a recipient would. For any final audio or video, watch and listen to the actual export.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output directly while preserving the real source and computation. Use readable tables, clear hierarchy, restrained controls and useful labels. Source review, DOM counts, HTTP 200, unit checks and another worker's approval do not substitute for seeing and using the product. Keep receiving focused on this actual operation and do not create broad suites, synthetic customer data or a separate verification product.

Carry this requirement into current, future, resumed and delegated worker instructions across providers and local/cloud runtimes. Preserve historical and vendor instructions and existing owner cutoffs. Do not force restarts, add watchers, revive stopped work, start hosted Actions or create a duplicate runtime. If execution is unavailable, join the original equipped receiver with the complete exact source and opening steps, then inspect its actual rendering while continuing independent implementation.

## Browser project editor and full native continuation

Open the included `maritime-workbench.html`. The fifth panel collects complete applied source reviews into one project. Give the project an identifier/title, apply a source and local period above, give the entry a descriptive title and select **Add reviewed entry**. Repeat with the next port, source measure or source edition. A new source review does not change an existing entry automatically.

Select **Edit entry** to return that entry's complete current/prior source and periods to the original review controls. Apply the revised selection, then **Replace selected entry from review**. **Update selected title** changes only its title. Entries can be reordered or removed. **Undo last project change** restores the preceding complete in-memory project, including a project replaced by a successful reopen. The page does not use a remote service or browser persistence; download the project before closing it.

A saved project uses `econdb.project-workspace.v1` and carries every referenced complete original response and descriptor. Identical response/descriptor pairs are stored once and referenced by entries. Its analysis/project module hashes select the producing calculations. Reopening validates every retained original, all source references, complete project configuration and calculated entries before replacing the existing working project. A malformed, changed-source or mismatched-engine file preserves the current project. Use the accompanying original workbench for an older engine, or explicitly receive original pairs in a new project.

The browser exports:

- A complete project workspace with all original current/prior data and applied selections.
- A standalone HTML report containing the overview, all selected observations, comparisons, source revisions, exceptions and source identities for every entry. It has no directory-relative download links.
- Source-annotated CSV for every selected cell, preserving separate measures, missing states and original numeric lexemes.
- The complete structured project analysis JSON.

Native `build` now also writes `browser-workspace.json` in its complete manifested project. Reopen that file in the included browser workbench to continue the same entries. Every new native project carries the standalone workspace module and project UI source alongside the original engines and builder.

Receive a browser-saved project through the existing Linux CLI:

```bash
node maritime-project-cli.mjs import-workspace --workspace /absolute/path/saved-project-workspace.json --out /absolute/path/new-native-project
node maritime-project-cli.mjs inspect --project /absolute/path/new-native-project
node maritime-project-cli.mjs reopen --project /absolute/path/new-native-project --out /absolute/path/independently-reopened-project
```

The import retains the exact incoming file in `<output>.browser-inputs/workspace.json`, checks its complete originals and engine binding, receives each original through the existing edition receiver and builds the same complete native project. The browser result and native result must agree. Repeating the same import reconciles the already received project. A different workspace or analysis binding requires a new destination; it cannot replace the previous intake. The intake and published project have distinct kernel locks, so source receiving and complete project publication each keep their existing operation safe. No API call, account, token, package install, purchase or hosted workflow is involved.

The browser receives saved files up to 256 MiB; native project members and this native import use the existing 128 MiB per-file limit. Both use 1–48 entries and the original 500,000 retained-current/prior-cell project limit. A browser workspace above the native file limit can continue in the browser or be received as explicitly selected smaller complete projects. Customer commissioning scope remains the agreed commercial scope.

After changing a browser source, run `node build-workbench.mjs` from this directory. It embeds the exact period engine, project engine, workspace module and UI source and updates their analysis identities in the standalone HTML. The builder refuses missing boundaries. Keep the produced workbench and its source files together in native projects.

### Actual receiving for this extension

Join the original Econdb receiving operation. In the exact outgoing desktop and narrow workbench: add both retained issuer examples with descriptive titles; edit, rename, reorder, remove and undo an entry; save/download and cold-reopen the whole project; open the complete standalone report and every CSV/JSON; review the unknown traffic cell and complete capacity comparison. Open a native project's `browser-workspace.json` in the browser. Import the downloaded browser workspace through the original CLI, inspect it, repeat the same import and independently reopen the native project.

Exercise an empty selection and a rejected malformed/changed-source workspace while another valid project is open; the existing project must remain available. View actual screenshots of the important states and correct readability/overflow. The JavaScript original-source calculation and workspace round trip are already exercised; actual browser interaction and native import execution remain with that same equipped receiving owner.
