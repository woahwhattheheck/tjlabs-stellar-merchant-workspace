# Brewery onboarding inventory workspace

Open Brewery_Worked_Example.html for the complete authored receiving/review case, or Brewery_Onboarding_Desk.html for a new source intake. Both work offline and retain complete exportable working copies.

The exact rational core receives item identities, aliases, opening counts, signed timestamped movements and independent cutover counts. Recipe versions, accounts and order references are retained alongside the balances. Immutable editions and source-bound review corrections preserve the original inputs and decisions.

Read docs/OPERATOR.md for the complete working flow and docs/RECONCILIATION.md for source contracts and native commands.

```sh
node native/build.mjs new-app-output
node native/receive.mjs new-receiving-output
```

Both commands create new output directories. Native CLI uses create-only workspace and export paths. Browser storage retains competing proposals; complete JSON includes unfinished intake and per-exception review drafts. Original file receiving preserves UTF-8 BOM and line endings and rejects invalid bytes.

The repository's AGENTS.md instructions apply. Keep hosted Actions disabled. Use the existing equipped product receiver for actual rendered desktop/mobile operation and retain that result with the received source version.
