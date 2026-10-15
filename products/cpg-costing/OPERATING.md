# Installed CPG costing

## Open and continue a workspace

Build/install the maintained source selection `cpg-costing` through the normal distribution launcher. Open **Applications → CPG costing**. Select a physical owner-private directory. To create a blank workspace, enter **New workspace label**. Start and Open the application. The same saved launch request and installation identity resume after restart; an existing session is never replaced by initialization.

The normal seven-section operator retains complete supplier, receipt, recipe, production and channel CSV, TSV or JSON files; exact unit and yield declarations; shared charge allocations; gross and net revenue treatment; immutable editions and full reports; comparisons across selected cost scopes; named review decisions; and previous sessions. See docs/OPERATOR.md for the complete domain workflow.

Enter the actor in the input form. Use **Save complete session** to retain all current work in the managed directory, including unfinished raw input, original-table mapping, row editor and review text. Drafts remain editable writing; freezing an edition and saving a review use the original costing domain model. Browser changes have their own complete IndexedDB copy until explicitly saved to the host.

**Open newest saved edition** retains displaced local writing as a full prior session. A rejected obsolete save preserves its original request and leaves the editor available for that explicit selection. A lost response remains pending: **Recover original request** reads/retries the same saved ID, base hash and complete successor. Exact retry after later host edits returns that original receipt and the current complete session.

Two browser openings compare the exact saved browser shell in one IndexedDB transaction. When another tab has saved, use **Keep this browser branch; retain saved copy**. Both complete preimages, their pending request identities and prior branches remain available as recovery JSON. Opening a different recovery does not silently discard a current pending request.

The current listener is authenticated on loopback. Its physical directory and installation identity are checked by the writer/client. The original automatic port is reused on restart so browser persistence remains at the same origin. For a deliberate new port, save complete recovery JSON before moving.

## Complete delivery

**Save retained handover ZIP** uses the exact saved host edition and verifies every returned byte plus the full hash. It includes all current application source, complete working sessions, the complete domain workspace, editable standalone HTML, every current original, all frozen lot, recipe, batch and sales reports, the selected comparison, named review, and every retained host request/edition. The history index distinguishes selected committed/rejected outcomes from prepared files left by an interrupted write. Prior sessions and their complete original data remain inside working/managed history.

Ordinary working JSON and editable HTML may also be saved while drafting. Reopen them through the standalone operator or explicitly receive into a new installation. The exported application source remains complete; its native installed commands use the source distribution's original private-writer dependency.

## Native use

```sh
node products/cpg-costing/cli.mjs init /physical/private/costing "Costing review"
node products/cpg-costing/managed.mjs --workspace /physical/private/costing
node products/cpg-costing/cli.mjs course /physical/private/authored-costing
node products/cpg-costing/cli.mjs receive /physical/private/received /physical/private/Costing_Working.json
node products/cpg-costing/cli.mjs inspect /physical/private/costing
node products/cpg-costing/cli.mjs connected /physical/private/costing /physical/private/original-request.json
node products/cpg-costing/cli.mjs connected-status /physical/private/costing /physical/private/original-request.json
```

Create parent directories with owner-only permissions. Close the running application before standalone writer commands; connected commands attach to its existing writer. `session`, `desk` and `export` create complete outputs without overwriting a different existing file. The donor `native/costing-cli.mjs` and full source-native course remain available for direct domain use.

A managed request retains schema `stellar-forge.costing-request.v1`, installationId, id, baseSha256, actor, at and kind. A `save` request has the full operator carrier. An `action` has an operation with the same id/actor/at plus exact expectedRoot, kind (`add-source`, `save-edition`, `review`) and original payload. See costing/core.mjs for the complete domain arguments; source payload is name/mediaType/content_base64, edition payload is name/input/parentEditionId/preparedBy/note, review payload is editionId/decision/reviewer/note.

## Customer-agent access

Declare a private JSON configuration:

```json
{"schema":"stellar-forge.costing-host.v1","workspaces":{"review":{"directory":"/physical/private/costing","label":"Costing review","inputs":{"receipts":{"file":"/physical/private/receipts.csv","sha256":"EXACT_64_HEX_SHA256"}}}}}
```

Use the existing Merchant provider initializer with this configuration as `connection`, or add `costingConnection` to the normal merchant configuration. The provider reads each exact declared file and captures the physical workspace identity. Credentials remain in the private connection file.

`merchant_costing_*` connects/disconnects, opens the browser, reads status, pages sources and frozen report collections, previews input/mapping/comparison, retains original sources, applies explicit domain actions, receives complete working/request files and exports/downloads a retained handover. Every paginated read binds expectedSha256 to the full host edition. Report collections include lots, boms, batches, sales, findings and assumptions. Use collection `input` with `table` naming one exact declared input table to read its complete frozen records; selected edition identity is required. Native request identity/base and domain expectedRoot remain distinct and are retained together. Whole working state and every operation payload are included in the full retained export.

The calculation preserves exact rational amounts and complete/incomplete/estimated status. Review received quantities, remaining inventory, production consumption, yield convention, allocation coverage and fee treatment before adopting a cost. Gross sales less processor fees and net realized revenue with fees already included are distinct declared cases. The responsible named review stays attached to the exact edition.
