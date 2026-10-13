# Econdb original API source receiving

Operation ECONDB-MARITIME-PERIOD-WORKSHARE-BBBD-20261013. Received 2026-10-13 UTC from the exact public https://api.econdb.com/v1/schema/ endpoint through Notion's supported public-file source receiver after web.open rejected application/vnd.oai.openapi. The complete original YAML is unchanged and includes all sixteen endpoint contracts, component schemas, original examples and original Python/cURL samples.

The four JSON examples are transparent data transcriptions of the named original YAML examples; raw YAML remains authoritative. They are not live requests, selected customer data or current port measurements.

- All sixteen documented data paths require tokenAuth. This source receiving performed no authenticated data request and created no account.
- Authorization is an apiKey header named Authorization with required literal prefix Token.
- The public documentation examples are original issuer illustrations, not observed live API responses or commissioned customer data. Port-specific example responses do not name a locode; do not label those rows Barcelona merely because the separate ports-list example is Barcelona.
- The capacity-by-operator default is throughput measured as vessel TEU, top eight operators plus Others. flow import/export/transshipment/cargo switches to container volume (TEU); top=0 or top=all returns every operator; top is ignored with operator set.
- The published capacity example itself includes Others. It is not an all-operator top=0 response.
- The selected port capacity/container/dwell endpoints declare no date_from/date_to parameters. Preserve the whole returned original and apply a clearly labeled local analytical period selection; do not invent unsupported server filtering.
- Container traffic Transshipment and dwell Transshipments are distinct exact source keys. Null is retained as unknown, not zero.
- The port list is the top400 ports by traffic, not a stated exhaustive universe of ports.
- Several current schemas make object fields optional or nullable; code must validate observed response without silently adding missing values.
- Port examples dated2022 are documentation examples; the schema's July29,2025 release description and current retrieval date do not make them current observations.
- Public documentation provides no verified resale/redistribution permission, customer licence, paid unit, payer, independent buyer or merchant hosting selection. These remain original commissioning inputs.
- Published complete-population choice is a feature of Econdb, not a reported defect.
