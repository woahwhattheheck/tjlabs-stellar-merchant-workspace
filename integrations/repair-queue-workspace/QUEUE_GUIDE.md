# BenchPing repair-queue receiving

This desk prepares a controlled import or later-sync comparison from the workshop's own original CSV exports. Keep a complete original copy. The official template contains an illustrative row; remove it before actual shop intake. The included authored course uses example.com contacts and is clearly separate from the researched businesses.

## Source contract

Use one header row and one job per row. Map the literal original columns; reference, customer name, customer email and item are required. Stable repair references must not be recycled. Retain accessories/model, reported issue and customer-visible notes separately from internal notes. The original CSV text, filename, bytes, SHA, row occurrences and literal mappings travel with each named edition. CSV parsing is strict; malformed originals can stay in the unfinished desk draft for correction.

Declare initial-import, later-sync or manual-app-entry. Later sync requires the full previous source. Declare sheet-managed or app-managed authority. BenchPing reads connected Sheets and does not write application edits back. Map original statuses to explicitly reviewed workflow labels; the desk does not presume the application's internal enum. Confirm those mappings in the actual product.

## Notification receiving

An initial file import establishes the queue without item-added messages. A later new row or status change can be a notification candidate. A customer-note-only edit is not a status transition. A changed raw status mapping to the same workflow label requires an actual application check. Missing rows never mean completion or deletion. Duplicate references and changed customer/email/phone/item/model identity remain visible attention and are not silently matched away.

Email and SMS candidates require explicit configuration. For SMS, record a Canadian recipient country, consent, valid international phone and separately funded credits. A +1 number alone does not establish Canada. US workshops use the email/tracking comparison. Candidates are not delivery receipts. Record actual provider/application observations in the separate source-bound outcome history. Keep controlled operator contacts for first receiving.

## Corrections and decisions

A review describes an investigation, accepted difference, corrected-source plan or trial exclusion. It does not erase a numeric/row discrepancy or send anything. Reuse a review/observation ID only within its exact source edition and reference; corrections append complete earlier versions. Corrected CSVs become new named source editions. Full workspace reopen checks original bytes, parsed values, source pairs and retained history binding.

## Native continuation

Node 20+ is sufficient. Materialize the files together. Run `node cli.mjs receive --input examples/intake.json --out NEW_OUTPUT_DIRECTORY`; output is create-only. Continue with `--workspace workspace.json`, including the desk's complete wrapper. Review/observe accept a record JSON through `--input`. When a browser wrapper is supplied, current workspace.json keeps its complete session and original-file receipts with the updated core. core-workspace.json provides the pure core; original-input-workspace.json preserves the prior input exactly. All source CSVs, comparison JSON/CSV, report and manifest are also retained. `node source-course.mjs` executes the existing authored source course. The native CLI uses strict UTF-8 and preserves BOM/CRLF source content.

## Hand calculation for the authored case

Four old and four new rows yield five distinct references: one later new job, two changed rows (one status and one note-only), one unchanged, one missing. The configured Canadian example yields two email candidates and one SMS candidate, with the missing reference retained for investigation. Initial-import mode yields none. Switching the declared recipient country to US removes the SMS candidate. No example result is a repair-shop performance claim.

## Scope and source

Official source: https://benchping.com/guides/google-sheets-repair-tracker/ ; https://benchping.com/templates/repair-order-template/ ; https://benchping.com/pricing/ . Observed 2026-10-15. Existing appointment tools, quotes, approval evidence, payment/deposit systems and specialist technical records remain the shop's authorities. Customer-facing tracking links are private bearer links. Keep customer exports and personal information in the workshop's authorized workspace.
