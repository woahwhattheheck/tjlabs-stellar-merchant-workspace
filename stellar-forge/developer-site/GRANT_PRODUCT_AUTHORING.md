# Product Sources workspace

Product Sources is part of the existing SCF submission workspace at
`/grant-submission.html`. It edits independent product declarations against the
complete reviewer source edition retained in that application. Answers, native
plans, issuer fields, source files and product authoring use the same draft and
saved version history.

## Prepare a product declaration

1. Open the application or a complete reviewer source package. In **Source
   editions**, receive its four original files, then choose **Author product
   sources**.
2. Start product source editing and select the retained reviewer edition. Its
   complete companion supplies the chapter chooser; its original source index
   supplies the existing source IDs and measured file identities.
3. Choose **Receive indexed product declarations** to edit declarations already
   recorded in that edition. Use **Import registration files** to receive
   complete existing JSON declarations. Imported file bytes remain available
   under **Retained original registration files**.
4. For a new product, enter its stable product ID, select the actual H2 chapter,
   and create the declaration. Read the complete selected chapter in the editor.
5. Add the chapter's original sources. The source chooser uses its immutable
   Git links and original indexed records. Choose an existing source ID when it
   identifies the same original work. The maintained composer retains the
   original label for an existing source record.
6. Select the repository, original path, file or directory, and optional exact
   commit. Empty commit selection follows the chapter's unambiguous immutable
   edition. Required sources must occur when that chapter is present; optional
   sources may be omitted by that edition.
7. Use **Measured file editions** for a file's original Git blob, SHA-256 or byte
   length at a full commit. The source chooser carries measurements only for
   that exact file. Changing the repository, path or source type clears those
   working measurements. Original imported files and preceding versions retain
   their original values.
8. Choose **Preview source changes** to run the same receiver as the command-line
   composer. Inspect added and changed records, or open all retained records.
   The preview names a missing product chapter and any optional source omitted
   from the selected edition.

The form retains incomplete working declarations so an author can save and
continue. Preview and declaration exports validate the whole selected document
set with the maintained source-registration rules.

## Review complete chapter coverage

**Preview source changes** receives the selected complete reviewer bundle and
validates the working declarations with the same chapter selector used by the
composer. **Chapter coverage** shows one row for each declared heading, all of its
product owners, and whether that complete chapter is present in this retained
edition. A shared chapter appears once even when several products contribute
distinct original sources. **Read complete retained chapter** opens its full
Markdown, including all H3 and deeper sections.

The summary distinguishes products from unique chapters. An absent product does
not disappear from the report. Its declaration remains available for a later
edition; receive that edition's complete four-file reviewer bundle or correct
the declaration's selected heading. A repeated H2 in the selected companion for a registered heading is rejected by
the original source receiver. Preview does not move a canonical chapter or
silently select another source edition.

**Exact coverage source** retains the reviewer bundle identity and complete
companion/source-index SHA-256 values. **Download complete chapter coverage**
saves the same report displayed on screen. The complete declaration ZIP includes
that report as `product-chapter-coverage.json`.

The report schema is `stellar-forge.grant-product-chapter-coverage.v1`:

- `basis` identifies the original reviewer bundle, its received time, application
  hash and full companion/source-index descriptors.
- `declarationFiles` binds every exported working JSON by relative filename,
  complete byte count and SHA-256.
- `products` contains every selected product ID, exact heading and `present`
  boolean, including absent chapters.
- `chapters` retains each present heading's complete Markdown once and its
  `productIds`. Product IDs retain the declaration order; chapters retain their
  order in the original companion.
- `counts` distinguishes present/absent products, present/absent unique chapters
  and present chapters shared by multiple products.

The declarations, source-index preview and chapter coverage are produced from
one captured working selection. Editing that selection invalidates the displayed
preview; a read that finishes after the author selects another draft, bundle or
declaration cannot publish a stale preview. The report describes its named
retained edition only. Current canonical composition and its resulting four
files remain the publisher's operation.

## Save, reopen and restore

**Save author project** writes the complete application to its existing browser
draft store. **Download full author project** exports that same complete draft,
including all retained application editions, four-file reviewer bundles, native
planning files, imported registration bytes, editable declarations, saved
versions and submission handover.

Use **Open author project** to receive the complete JSON in another browser or
**Saved browser drafts** to reopen its current local revision. The original
cross-tab revision check remains in force. **Version history** restores the
selected product declarations, author notes and selected reviewer bundle with
the answers and other working state. It retains the state from before that
restoration as another version.

Preparing a submission freezes its product-authoring state with the existing
author snapshot. The complete original reviewer files remain in the parent
draft and are reconnected when that prepared edition is reopened or verified.

## Export composer files

**Download this declaration** exports one complete JSON declaration. **Download
all composer files** creates a standard ZIP containing:

- `grant-products/<product-id>.json` for every working declaration;
- `source-index-preview.json`, the complete index computed against the selected
  retained companion;
- `product-chapter-coverage.json`, every product's presence, every complete selected
  chapter and its product owners, and exact declaration/source file identities;
- `README.md` with the selected source identities and composition command.

The export rereads and verifies the selected original reviewer bundle. It also
verifies each original imported registration. The existing command-line
composer binds the exact newly exported declaration bytes when it receives
those files; a preceding declaration's file identity remains with its original
import.

Extract the archive and select its complete declaration directory:

```sh
node stellar-forge/developer-site/grant-compose.mjs \
  --directory stellar-forge/developer-site/dist \
  --manuscript /absolute/path/to/current-canonical.md \
  --product-registrations-directory /absolute/path/to/extracted/grant-products
```

The directory option selects the complete declaration set. Keep one file per
product and include installed declarations that should remain active. An
additional product with a new ID can instead be appended to the installed
defaults using `--product-registration /absolute/path/to/new-product.json`.

The retained companion determines the authoring preview. The selected current
canonical manuscript determines the final composition. A registered complete H2
can remain in its author's existing manuscript location, including after the
main demonstration section. The composer receives that whole chapter through
the same declaration and reports each product's actual companion presence in
`productChapterCoverage`. Multiple declarations may share one H2; the complete
chapter is received once and their source IDs remain distinct.

If a complete chapter is absent from the retained preview edition, receive the
later four-file reviewer bundle after its canonical composition. The chapter
chooser then opens that complete received chapter. The same composer continues
to produce its complete application reader, application Markdown,
product-and-finance companion and source index.

## Source organization

The shared pure receiver lives in `dist/grant-product-sources-core.mjs`.
The existing `grant-product-sources.mjs` entry point re-exports its original
public API, preserving the command-line composer and installed callers. The
browser chapter chooser uses that receiver's fence-aware chapter outline.

The authoring model, source receiving and workspace are in the three
`dist/grant-product-authoring-*.mjs` modules. Their browser routes are declared
in the existing `browser-assets.json`. The submission core retains authoring
selections in ordinary versions; the original handover receiver verifies the
complete imported files and reconnects a prepared snapshot's source bundle.

See [GRANT_PRODUCT_SOURCES.md](GRANT_PRODUCT_SOURCES.md) for the complete
registration schema and maintained command-line options.

## Inspect the installed Product Sources workspace

Open the exact outgoing installation at `/grant-submission.html` through its
original saved application. Inspect the rendered screen itself at a normal
desktop width and a narrow mobile width. Read the tables and complete chapter
details, operate the controls, and correct clipping, unreadable text, overflow
or broken actions before describing that edition as ready for customer use.
Source review, HTTP responses and captured screenshots that have not been
viewed do not establish the rendered result.

Use a complete retained reviewer edition and its existing declarations for the
following course:

1. Open **Source editions**, select the retained four-file bundle and choose
   **Author product sources**. Verify that the source identity shown by the
   workspace is the selected original edition.
2. Receive its indexed declarations or open their complete original JSON
   files. Choose **Preview source changes**. Inspect the product counts and
   unique chapter counts separately, open a complete retained chapter, and
   inspect a shared chapter's full list of product owners.
3. Inspect an absent chapter using an actual retained edition that predates
   it, when available. Confirm that the declaration remains in the report and
   that the workspace identifies the absence in that selected edition. Do not
   substitute current canonical content into the older retained bundle.
4. Edit a working declaration. Confirm that its prior coverage is no longer
   displayed as current. Preview the complete edited selection again and
   inspect its source changes and chapter coverage. The received original
   declaration and saved preceding versions must remain available.
5. Download the standalone chapter coverage and **all composer files**.
   Open the ZIP and inspect every complete declaration, the source-index
   preview, `product-chapter-coverage.json` and the included guide. Check that
   the coverage identifies the selected reviewer edition, binds those exact
   declaration files and retains each present chapter once with all its
   product owners.
6. Save and download the full author project. Reopen that complete project
   through the original workspace, then inspect its selected bundle, imported
   originals, working declarations and saved versions. Repeat the preview and
   declaration download from the reopened project.
7. Inspect the ordinary empty and loading views during that course. If an
   actual source read or declaration validation fails, inspect the displayed
   error and continue through the original correction controls without
   discarding the retained source or draft.

At both widths, inspect the grouped chapter table, product owner lists, source
identities, complete Markdown details, editing controls and download actions.
Keep the industrial layout readable and preserve the original computations and
source-selection rules.

When the local runtime is unavailable, give the existing equipped application
receiver this exact source edition, its complete retained reviewer bundle and
these opening steps. Review its actual rendered result and returned downloads
before reporting customer readiness. Keep the source-review and rendered
outcomes distinct while the original receiver completes that operation.
