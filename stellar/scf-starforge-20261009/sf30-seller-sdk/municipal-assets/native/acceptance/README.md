# McPherson municipal migration + API/Esri round-trip acceptance control

**Operation:** MCPHERSON-03-MODULE-ACCEPTANCE-20261009-GPT6-CLOUD  
**Status:** FUNCTIONAL OFFLINE TOOL; **no City/vendor/Esri API call performed**, no municipal data processed, no product certified, and no binding SOW/paid client.  
**Companion buyer/partner research:** [BUYER_PARTNER_WORKSHARE.md](../BUYER_PARTNER_WORKSHARE.md) on original Commons main, PR #32823.  
**Buyer authority:** [City of McPherson live software vendor invitation AD-01-2026](https://www.mcpcity.com/bids.aspx?bidID=12) and [the original seven-page invitation](https://www.mcpcity.com/DocumentCenter/View/5494). This is explicitly **not a formal RFP**, may use multiple modular vendors, and includes **G2 public works/asset/fleet/311** and **G4 financial/procurement** conversion and bidirectional Esri where relevant. Deadline Nov 4, 2026, 3 PM McPherson local. An actual vendor and data steward must authorize any future use.

## Commercial purpose, and why this is not a disconnected new CRM

This is the **concrete deliverable unit** a consenting G2 EAM/CMMS or G4 ERP vendor can include in a paid scoped implementation: compare its actual approved legacy export to its actual installed product export, verify consistent identifiers and selected mapped fields, verify *recorded real* two-leg EAM/ERP→GIS/API→EAM/ERP round-trip event receipts, and give vendor a deterministic content-bound signoff packet without copying raw data into GitHub or Slack. It runs locally/offline using Python stdlib; the vendor does its own product testing and City approval. This does **not** create a new outreach pipeline, scoring engine, GitHub work queue, bidder submission, product platform or alternate provider simulation.

Existing Commons `tools/rochester_crm_source_verifier/verify.py` hashes original *buyer RFP documents*, not application-to-application data; `tools/revenue_underwriter` evaluates funding claims, not source-to-target row accounting. The distinct actual-data acceptance seam warrants this scoped standalone tool; reuse those originals as-is, not duplicate or modify them.

## Packet contract

An authorized operator first obtains **two real CSV exports** and **actual recorded JSONL API round-trip events**, stores them in a private local folder, and creates an accompanying `manifest.json` in **the same folder**. The checker does **not** download, contact, simulate, solicit, calibrate, generate events, or write to a provider.

Minimal illustrative shape (the values below are **syntax placeholders, not real municipal evidence**):

```json
{
  "schema": "mcpherson-modular-migration-acceptance-v1",
  "run_id": "the-real-vendor-change-ticket-or-operation-id",
  "attestation": {
    "supplier_reviewer": "real-authorized-supplier-reviewer",
    "city_data_authorization_ref": "actual-approved-data-authorization-ID",
    "vendor_sow_ref": "actual-signed-SOW-or-PO-ID"
  },
  "source": {"path": "authorized-legacy-export.csv", "key": "asset_id"},
  "target": {"path": "authorized-vendor-export.csv", "source_key": "legacy_asset_id"},
  "field_pairs": [{"source": "asset_status", "target": "status"}],
  "expected_source_rows": 999,
  "expected_target_rows": 999,
  "approved_exclusions": [],
  "roundtrip_jsonl": "observed-real-api-events.jsonl",
  "expected_correlation_ids": ["actual-test-run-correlation-ID"]
}
```

- `expected_*_rows` are counts **independently obtained from complete authorized source/target extraction**, not calculated from a sample until the full-export data owner approves sampling. The checker demands exact equality and fails on empty exports, missing/duplicate key or header, malformed rows, undeclared dropped rows, orphan target rows, or configured mapped field mismatches. Field values compare **exact literal CSV values** without silently normalizing strings, case, time zones, units, coordinates, nulls or numeric formatting; vendor must explicitly define conversions outside this checker.
- `approved_exclusions` is a list of `{"source_key":"...","reason":"...","approved_by":"..."}` objects, each distinct, each source key present only in the original source, never in target. This is an explicit operator-approved data policy decision; `approved_by` is a recorded name/string **not cryptographically authenticated**.
- `expected_correlation_ids` must contain the full, vendor-approved observed test-run correlation IDs; duplicate IDs fail. `roundtrip_jsonl` has one JSON object per actual observed leg: `correlation_id`, `asset_id`, `leg` (one `request`, one `response`), `source_system`, `destination_system`, and `status`. Request `status="accepted"`, response `status="ok"`; asset ID must match a migrated source key and both legs must return to the named origin. Duplicate, missing, unknown, unsuccessful or unmatched events fail. The chosen correlation set is vendor-attested; this is **not a substitute for proving complete provider log capture, endpoint protocol semantics, response payload integrity, or actual bidirectional Esri support.**
- Only **relative local file paths** inside the packet folder are allowed; absolute traversal, backslash and symlink input rejected. The checker has no network code and never prints source/target row IDs or raw data. It emits per-input SHA-256, row counts, exception counts, verified round-trip count, manifest SHA and a deterministically recomputable receipt SHA. Keep unredacted evidence with the approved vendor; GitHub stores source only.
- Manifest `attestation` requires nonempty supplier reviewer, City data authorization reference and actual vendor SOW/PO reference. The program **cannot validate their authenticity**; a technically consistent receipt explicitly reports `vendor_or_city_acceptance: NOT_ESTABLISHED`. **Never record a fake placeholder in a live packet** and never confuse a locally green fixture test with City acceptance or paid work.
- Exit `0`: **technical packet internally consistent**; no legal approval or final signed acceptance inferred. Exit `2`: invalid packet, source/target mismatch, malformed input, missing evidence or output write failure. No provider mutation.

## Real use, after supplier engagement

```sh
python3 -B opportunities/mcpherson_ks_modular_software_2026/acceptance/verify.py \
  /private/vendor-approved/mcpherson-run/manifest.json \
  --output /private/vendor-approved/receipts/mcpherson-run.sha-receipt.json
```

The `--output` file must not exist before writing (exclusive creation refuses overwrite). If the vendor uses zero-export legacy field aliases or complex JSON APIs, it must deliver a signed-off, content-addressed canonical CSV/JSONL transformation as part of its real SOW; never silently claim the transform or mocks are original City data. Review actual schema versions, coordinate systems, status code maps and full export completeness in the approved implementation plan.

A single focused local fixture regression was run in the ChatGPT cloud container:
```
python3 -B -m unittest -v test_verify.py
# 1 focused test: good path + four fail-closed regression cases (orphan/missing, duplicate IDs, incomplete roundtrip, declared row-count mismatch). PASS.
```
This is a **local inert parser regression**, not a provider acceptance run, competition score, City sandbox call or full suite. No default CI, workflows, deployment, API integrations, vendor messaging or bidding touched.

## Adoption / paid stage

1. **Eligible municipal prime** confirms product edition and module plus three permissioned municipal references; true subcontract openness. Public Sourcewell roster/case studies are leads, not permission.
2. **Owner** separately approves actual supplier intro, rate schedule, access/SOW/data-processing terms, privacy, finance/procurement and product boundary. No cold outreach or buyer commitment from this artifact.
3. **Supplier + City data steward** provide authorized full source and target export references, a measured historical coverage denominator, actual vendor software event logs and expected correlations; run in approved tenant. Hash and review the output plus ticket exceptions, then supplier/City decide acceptance separately.
4. **Cash evidence:** only recognized after a real accepted work unit, invoiced to the contracting prime under SOW and settlement confirmation. `TECHNICAL_EVIDENCE_CONSISTENT` is not revenue.

**Original work-order custody:** MCPHERSON-03 only. MCPHERSON-01 buyer updates, -02 supplier reference screening, and -04 owner-auth intro/commercial decision remain distinct unclaimed work orders, subject to latest #sales deconfliction.
