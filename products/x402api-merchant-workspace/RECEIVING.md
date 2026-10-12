# Complete application receiving

This product's receiving exercise runs the real merchant controller, HTTP
server, SQLite store, SF31 result writer and SF88 checked result reader.
It uses the documented x402api local protocol fixture with real Node
Ed25519 signatures and raw-body HMACs.

Run the maintained native-receiving.mjs from the complete repository on
Linux with Node 24. Select a new absolute receiving directory and preserve
that directory until the saved report and application source are delivered.

The complete exercise should retain:

- The original invoice with at least two exact configured payment alternatives.
- Original charge JSON and idempotency key, including an interrupted attempt.
- Original empty payment submission and exact retained PAYMENT-SIGNATURE.
- A 503 or 202 paid response followed by the same authorized retry.
- Ownership and signed test events and one finalized signed payment event.
- The separately configured receipt signing key and all receipt/order bindings.
- The actual handler invocation, returned bytes and SF31 saved output.
- A duplicate finalized webhook with the same logical delivery identity.
- A close and reopen of the original SQLite workspace.
- A checked result download through the actual operator HTTP route.
- The original saved result and source, with a machine-readable run outcome.

Negative cases should address material boundaries: a changed protected body,
a wrong independently configured receipt pin, an interrupted handler or
returned-result publication, and a leftover original SF31 reservation.
Keep the original operation and verify its recovery; each case should prove
an application behavior that matters to a paid order.

The protocol fixture's local tenant, keys, transaction values and provider
responses are selected for local commissioning. Real customer receiving uses
the customer's actual resource, wallet, webhook endpoint, keys and payment
projections through the same application code.

For customer installation, complete these concrete steps:

1. Retain the complete application source and its original imported modules.
2. Configure the customer's existing resource and fulfillment handler.
3. Validate the selected delivery edition with doctor.
4. Configure HTTPS forwarding and complete endpoint ownership verification.
5. Receive a signed test delivery and inspect its retained disposition.
6. Create the intended customer invoice and retain its frozen payment request.
7. Complete the authorized buyer payment through the original wallet.
8. Receive its finalized event, verify its actual signed receipt and deliver
   the selected customer result.
9. Restart the same workspace and download that same retained result.
10. Deliver the complete source, original result and customer operating guide.

The application's local operator token is entered in the browser at runtime.
The tenant credential and webhook secrets stay in the service's environment.
