# Roastery production workspace

A complete offline production desk for retaining original order and inventory CSVs, allocating packaged and roasted stock, calculating batch charges, reviewing an immutable input edition and recording actual batch outcomes.

Open `Roastery_Production_Desk.html` for a blank period or `Roastery_Worked_Example.html` for a labelled two-lot example. Keep the exported complete workspace with the standalone HTML. The neutral industrial interface works without a server or third-party packages.

The maintained calculation factory uses integer micrograms, explicit roasted-share recipes and separate roast and packing losses. Browser saves retain complete proposals in IndexedDB; conflicting writers keep their own recovery copies. Production periods keep their originals, frozen plans, unfinished drafts and append-only measured corrections.

- [Operator guide](docs/OPERATOR.md): exact input tables, arithmetic, period lifecycle and recovery.
- [Native workflow](native/README.md): build standalone desks or process original CSVs through the same factory.
- [Worked inputs](examples/originals/commands.json): seven complete authored input tables and a native command sequence.

This is a material-planning and outcome workspace. Review machine time, staffing, roast duration, cleaning, dispatch feasibility and source permissions with the roaster. Dates determine allocation priority. Use fresh physical stock and outstanding order snapshots for each production period.

An optional private prospect programme adds source-linked profiles and editable working notes. Supply it when building; the generic source and worked example contain authored production records only.
