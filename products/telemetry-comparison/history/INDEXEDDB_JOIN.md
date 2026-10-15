# Complete IndexedDB and retained-session join

Current domain calculation and shared-domain archive are byte-identical to the maintained 58-file application at Commons PR37929, commit5f3850948a79dd7511dba3fee276f3338c91e6a9. All original selected paths remain present; changed full preimages are retained in history/before-indexeddb.

The storage layer follows the existing maintained catalog transaction/branch pattern from tjlabs-stellar-merchant-workspace commitad310fc33d939099affca11674993ab0973e16fc, adapted to this exact telemetry session and immutable domain archives. It retains complete source objects once, small immutable draft/proposal records, and atomic expected-head publication. No telemetry/model domain decisions move into the storage layer.

Source execution exercised the complete original user journey, two independent writers, conflict proposal recovery, quota-failed persistence with emergency export, late input during a pending save, and embedded handover versus unrelated active-copy reopening. Explicit runtime adapters supplied the browser storage interfaces during source execution.

Final assembly preserves the newer maintainer's separate full/compact controls and all current native/import interfaces. Complete full205217-byte and compact75855-byte authored working copies remain byte-identical to that predecessor. The additional shared-node complete-session archive also reopens every field. The existing domain calculations and large-capacity processing interfaces remain available.

The existing commissioning/operator-course.mjs is kept as the production controller course; its storage adapter now operates IndexedDB transactions instead of the predecessor's single localStorage slot. The original full course source is retained under history/before-indexeddb. Native receiving continues through native/receive-operator.mjs and docs/BROWSER_RECEIVING.md.
