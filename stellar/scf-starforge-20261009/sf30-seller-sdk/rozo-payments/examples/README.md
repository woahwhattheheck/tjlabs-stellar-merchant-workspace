# Editable original inputs

These files are templates, not account observations. Replace all REPLACE fields, select actual dates/asset precision, and use the original workspace revision returned by inspect/state before creating new requests. Retain each completed request file before dispatch and preserve its exact bytes/identity during recovery.

merchant-connections.json uses existing private environment-variable names. checkout-connections.json requires the actual verified publisher source directory. The original source/API boundaries and optional SDK/decoder requirements are in SOURCE_AND_RUNTIME.md.

orders.csv demonstrates original headers. In the staff intake map orderId→order_number, title→description, chainId→chain, tokenSymbol→token, amount→amount and fulfilmentRef→fulfilment_reference explicitly. CSV import verifies the complete raw bytes and rejects conflicting original orders.

The example request revisions 0/1/2/3 are explanatory; do not reuse them if the real workspace has another revision. Once dispatched, recovery keeps the original revision and request body rather than rebasing that request.
