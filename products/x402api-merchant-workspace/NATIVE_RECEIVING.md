# Complete native merchant receiving

Operation: `SCF-X402API-MERCHANT-COMMISSIONING-7DE2-20261012`.

This programme commissions the complete merchant application using its actual HTTP server, tenant HTTP client, Node 24 SQLite store, native HMAC and Ed25519 verification, configured immutable-file delivery adapter, and the original SF31 and SF88 result implementations. The local provider responses, signing keys and authorizations are explicit commissioning fixtures; the programme does not submit a real payment.

## Complete source and entrypoint

The root application source includes the invoice UI, persistent business store, provider and protocol implementations, server, file-delivery adapter and operating guide. Five unchanged modules from the original merchant release at ec336d297fc7a49065d4f8a8712cbf1a840c25fe supply the existing result writer, verified result reader, and kernel lease. The source manifest records every complete file.

The original source receiver reads a bounded JSON frame through standard input, verifies its byte count and SHA-256, writes each full source under its exact identity, then invokes:

```sh
python3 source/products/x402api-merchant-workspace/run-native-receiving.py --root /dev/x402api-merchant-7de2-20261012
```

The native runner selects the actual installed Node 24 executable and Linux flock. It invokes one original phase at a time and retains stdout, stderr, source selection, PID, start and end state. The two intended SIGKILL phases count as completed only when the actual -9 exit matches their exact phase, attempt, workspace, source and boundary marker.

## Customer journey

Five invoices cover two accepted payment rails, the exact 503-to-200 retry of the original empty payment request, signed webhook and independent receipt pins, incorrect signature/key/request rejection, duplicate events, close and reopen, and complete result downloads. The programme also interrupts the actual handler after its original result returns, interrupts the actual SF31 writer while its payment-bound reservation is present, recovers a returned 200 after the original SQLite exchange commits, and retains an incomplete 200 without another payment POST.

Each completed invoice has one original fulfill invocation. The interrupted handler is reconciled through the same configured adapter. The result-writer interruption uses the durable original RETURNED bytes. The final receiving result records every invoice, payment identity, verified receipt and retained result hash.

## Open the delivery

DELIVERY_MANIFEST.json binds every archive member. The receiving directory contains the complete SQLite workspace, original customer file and manifest, exact fixture and provider exchanges, phase histories, complete result files and complete.json. The source directory is the complete development source, including this journey and the original fixture.

The archive retains control/native-complete-state.json as its closed native checkpoint. Keep its original private root paths when restoring this specific commissioning project; the runner reuses completed original phases and validates the same source and database. Product deployments instead use the normal merchant operating guide and their own explicit tenant, resource, wallet, receipt-pin and fulfillment configuration.

The live runner retains a finished archive until the original official file-save result is durably recorded. An uncertain save is reconciled using its original intent and returned identity; it never starts another payment or handler action. The full save receipt and final custody record are beside the archive after publication.
