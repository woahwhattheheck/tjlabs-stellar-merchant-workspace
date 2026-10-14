# Actual cutover source API and installed integration

## Runtime

`require("./cutover/runtime.cjs")` exports the inherited migration codec/comparison/ZIP utilities plus cutover `core`, `workspace`, `exportFiles` and readable `report`.

### Core

- `core.contract(value)`: validates the complete four-snapshot contract and returns a copy.
- `core.build(contract, originals)`: original map values contain filename/content. Returns an immutable plan with selected input byte SHA256s, complete change classifications, original row references and input issues.
- `core.packet(plan, decisions, originals, actor, at)`: rechecks selected originals and produces an immutable ordered proposal, preserved work, guarded reversal and expected after-state. Unresolved decisions and invalid identities prevent packet issue.
- `core.reconcile(packet, observed)`: observed object members contain target and crosswalk CSV strings; relationship members contain target CSV. Returns complete observed input hashes and findings.
- `core.reversalCheck(packet, observed)`: returns ready, conflicts and manual sections, tied to the packet and observation identity. Existing target identities are pinned to the packet. New record assignments remain manual.

### Workspace

`create(id,title)`, `apply(ws,operation)`, `validate(ws)`, `archive(ws)`, `restore(archive)`.

Operations share id, actor, at (real UTC ISO timestamp), expected_revision, kind and payload. Kinds:
- ingest: new id, filename, complete content.
- configure: new id, title, complete contract.
- plan: new id, configuration_id.
- decide: plan_id, item_id, choice, reason; custom choice also value.
- issue_packet: new id, plan_id.
- reconcile: new id, packet_id, observed mapping entity→role→retained source ID.
- record_execution: packet_id, actual completed step_ids, reference, executed_at and notes.

Each operation retains the complete original request and result. Exact retries are idempotent. Changed retries conflict. Validation replays every operation and compares the full workspace. Archives contain schema crm-cutover.archive.v1 and the canonical workspace SHA256.

## UI and native receiving

`require("./cutover/render-desk.cjs").renderDesk(files,archive)` renders one complete offline HTML. Source modules are embedded directly; normal controls configure fields, enum transforms, directed labels and decisions. IndexedDB save uses an expected current hash; importing validates the full archive before adopting a branch.

The existing installed product should preserve its single leased writer, managed request base hash, stable workspace/directory identity, exact exported files, pending request recovery and source-owned providers when adding this model. The donor supplies no additional host controller and makes no platform writes.

## Source ownership

Author: Commons revenue_delivery. Independent reversal identity review: root and toolkit_publication. Maintained comparator and archive modules are retained with their original APIs. This donor contains no customer programme, offer, contact list, email, private source predecessor or customer correspondence.
