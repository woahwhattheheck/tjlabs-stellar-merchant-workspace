# MPC server-backup proposal workspace

An editable engineering workspace derived from the original Savannah MPC RFP 2026-01 and both issued addenda. The self-contained HTML works offline in an ordinary browser.

## Open and use

Open `workspace.html`. Change the protected-data, retention, transfer and capacity assumptions; record each response decision; update the twelve recovery/acceptance steps; and enter actual supplier quotes. Save the complete case JSON before closing. Reopen that JSON to continue the same case. Export the complete report or current response CSV for proposal assembly.

The report includes every response item and recovery step even when a table filter is active. All observed quantities and proposed assumptions retain their labels. A missing supplier quote remains missing when known subtotals are calculated.

## Files

- `workspace.html` — complete offline customer workspace.
- `planner.cjs` — portable calculation and case-validation implementation, identical to the embedded core.
- `planner_cli.cjs` — calculate a saved case, or write the editable default example to standard output.
- `requirements.json` and `response-register.csv` — all 64 issued-source and response-planning rows.
- `acceptance-steps.json` — twelve recovery, receiving and handover steps.
- `sources.json` — original issuer and PDF URLs.

## Calculate a saved case

Requires Node.js with CommonJS support and no third-party dependencies.

```sh
node planner_cli.cjs calculate saved-case.json > calculated-result.json
node planner_cli.cjs default > starting-case.json
```

The command validates the whole case before calculating. The default is an editable assumption set; set the proposing firm's actual retention, storage factors, quotes and measured quantities before using its output.

## Model

The protected baseline is 41 TB, derived from Addendum 2's 40.777 TB inventory. The source anticipates no more than 1 TB annual server growth. Daily changed data is unmeasured, so it is an explicit adjustable input. Microsoft 365/Entra scope is retained separately and requires the selected service's actual volume and retention sizing.

Each repository models complete independent full chains, their incremental or differential restore points, additional independent archive full copies, explicit temporary full-copy workspace and reserved free space. Deduplicated block sharing, compression and platform-specific synthesis must be reflected in the actual observed storage factors and policy. The baseline's four full chains are an example policy.

Transfer units are decimal TB and Gbit/s. Initial seeding always moves the selected full payload. A periodic active full retransmits that payload; a synthetic full avoids the assumed full WAN retransmission while still requiring its daily changes, local I/O and recoverable complete chain. Incremental changed bytes scale with the start interval. Differential point sizes accumulate within a chain, capped at the original full size.

The nominal oldest-to-newest restore-point span is `(points - 1) × start interval`. The conservative serial-transfer recovery-point age bound is `max(start interval, longest transfer) + longest transfer`. If a transfer is longer than the requested interval, the fixed cadence is marked infeasible. These are planning bounds under the declared serial-transfer assumption; full end-to-end recovery-point age also depends on snapshot, queuing, processing and verification.

The cost schedule keeps four years distinct: one initial year and three optional renewal years. It reports known quoted subtotals with the missing lines listed. A blank quote is never treated as a free service.

## Issued requirements

The live issuer page and both addenda govern the procurement. Addendum 1 changes the date to 15 October 2026; the original 3 p.m. physical receipt deadline remains. Addendum 2 preserves the original five-paper-copy plus PDF-on-USB method. The response register includes the relevant source question/section for every row.

The isolated backup administration design follows Addendum 2 Q50: individual controlled identities with MFA and revocation, without synchronizing administrative credential trust to the on-site AD/Entra environment. The acceptance sequence includes the demonstrated bare-metal recovery cycle, Microsoft 365/Entra coverage, hurricane preparation, three-staff handover and exit/data custody.

## Source and execution record

The current portable core was evaluated directly with its ordinary calculation functions, including actual interval scaling, independent retained chains, differential accumulation, copy/reserve requirements, quote completeness, saved-case validation, and a 41 TB / 4 Gbit/s transfer longer than a 12-hour start interval. Complete saved source and the delivered workspace were reopened byte-for-byte. The HTML scripts parse and their referenced element IDs resolve in the source. The original browser receiving journey is tracked with the maintained delivery, including save/reopen, report and CSV downloads.

This directory contains the reusable engineering source. Commercial relationship correspondence and supplier-specific proposal terms remain in their existing private case.
