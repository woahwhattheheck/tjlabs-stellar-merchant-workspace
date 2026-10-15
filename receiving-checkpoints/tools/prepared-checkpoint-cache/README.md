# Prepared export checkpoint performance

The ZIP builder caches canonical base64 text by its private immutable prepared Uint8Array. add copies supplied bytes and copy shares the private prepared payload. Restore seeds the cache only after size, canonical base64 and CRC validation. Snapshot contents and ordinary ZIP bytes remain unchanged.

Use one createPreparer(codec) per active export job, then prepare(checkpoint) at each completed source group. It caches payload fragments by immutable base64 value and drops values absent from the active checkpoint. Metadata is rebuilt every time. Returned objects always include every referenced fragment, including computed but unpublished objects. The caller filters only its independently acknowledged durable object set; add to that set only after the provider commit succeeds. Retrying an uncertain or failed publication must read the original provider operation and cannot assume a cached computation was published.

The existing prepare(checkpoint,codec) remains stateless and compatible. createPreparer.statistics exposes cache work for the receiving operation. Live receiving may use these byte-equivalent dependencies while keeping its original source-file bank and job input identity immutable. Product integration creates a separately identified successor with every actual source-bearing archive entry regenerated.
