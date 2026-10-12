# OpenAQ customer studies

The installed customer console operates the original OpenAQ Buyer from its retained merchant handoff through request preparation, native approval and recovery, accounting, complete export, and independent receiving. The same workflow is available through the typed customer client. Applications owns the process; browser pages and typed clients borrow that listener.

Source values, units, sensor and parameter identity, offsets, measurement intervals, flags, attribution and scientific review remain in the original study. The console adds no AQI, health classification, payment ledger or archive format.

## Host requirements and installation

Use the existing complete merchant distribution on Linux with its supported Node runtime, original Python/SF36/SF88 dependencies and the existing flock command. Browser acquisition uses the original SF81 Unix-socket approval broker. Its source, native validation, reservation, signing and accounting remain authoritative. If that host does not provide the original approval channel, use the original openaq-buyer terminal workflow on an equipped host; this console does not synthesize an approval.

The distribution contribution registers:

- Command: starforge openaq-buyer-console.
- Applications type: openaq-customer.
- Typed export: @tokenjunkielabs/starforge-merchant/buyer/openaq-study/console.
- Host export: @tokenjunkielabs/starforge-merchant/buyer/openaq-study/console/server.
- Initialization export: @tokenjunkielabs/starforge-merchant/buyer/openaq-study/console/config.

The original starforge openaq-buyer command and ./buyer/openaq-study typed API remain available. This console is an operating interface to those functions.

## Select one private customer host

Choose a new absolute directory under an existing owner-only parent. The selected source, original operator and console directories must be separate. Configuration is immutable; use another console directory for a genuinely different source or operator.

### Inspect the original handoff

Inspection needs the complete original handoff directory containing handoff.json and study.tgz. It does not need an operator or signer.

    {
      "directory": "/private/openaq/customer-inspection",
      "label": "Reviewed station study",
      "mode": "inspect",
      "handoffDirectory": "/private/openaq/merchant-handoff",
      "handoffSha256": "THE_EXACT_HANDOFF_FILE_SHA256"
    }

Save this as host-selection.json, then run:

    starforge openaq-buyer-console init --config /private/openaq/host-selection.json
    starforge openaq-buyer-console serve --dir /private/openaq/customer-inspection --port 0

Open the returned private URL. The source screen shows the original study, release, terms and named review, and downloads exact original handoff/study files.

### Acquire through the existing original operator

Use mode acquire with the same source fields and add the already initialized original SF88 operator directory:

    {
      "directory": "/private/openaq/customer",
      "label": "Station study customer",
      "mode": "acquire",
      "handoffDirectory": "/private/openaq/merchant-handoff",
      "handoffSha256": "THE_EXACT_HANDOFF_FILE_SHA256",
      "operatorDirectory": "/private/operators/customer",
      "python": "python3"
    }

The console does not provision a replacement account, seed, cap or signer. It reads the original operator binding through workspaceConfiguration, and the original Buyer resolves the existing execution environment when it runs. The fixed host paths cannot be changed through an HTTP request.

### Receive a complete delivered study

A receiving host needs the complete original delivery directory and exact delivery.json file hash. No source-provider access or signing configuration is needed:

    {
      "directory": "/private/openaq/customer-receiving",
      "label": "Received station study",
      "mode": "receive",
      "deliveryDirectory": "/private/openaq/transferred-delivery",
      "deliverySha256": "THE_EXACT_DELIVERY_JSON_FILE_SHA256",
      "python": "python3"
    }

Initialize and serve it with the same commands. Select a stable receiving ID, Receive, then Reopen. The original native Dataset ZIP and scientific study TGZ are opened by their original receiving engines. Files, original request, source capture and review, snapshot, native session and accounting must all agree.

## Start through Applications

After initialization, save an Applications entry of type openaq-customer pointing at the console directory. Its existing manager owns Start, Open and Stop.

Preparation binds the immutable console configuration, all customer-host source files, the original Buyer functions, Dataset/queue source and SF81 broker. Startup reads back the current console ID, configuration hash, source identity, instance ID, private connection file and URL. A response from another instance is refused.

The local HTTP listener uses 127.0.0.1 and a private bearer token. The browser obtains it from the URL fragment, removes the fragment and retains the token for this tab session. Never publish that private URL or connection file.

## Review and prepare

1. Read Source & release. The handoff retains the original capture, accepted source review, source export, merchant stage/release and baseline snapshot.
2. Choose an offered payment option, stable original request ID, query, maximum page count, total atomic-unit cap, maximum rows and bytes per page.
3. Review the selection. The original prepareOpenAQDatasetRequest adds the retained snapshot and validates advertised query parameters. The console resolves the current original operator binding, hashes the complete review, and rechecks it before preparation.
4. Prepare reviewed selection. The original customer request and native Dataset definition become durable. Changing form values invalidates the local review.
5. If preparation was interrupted, load the saved selection, review it again and use Resume original preparation. The original implementation reconciles its exact incomplete definition and retains its preparation lineage.

Preparing a request does not reserve funds or perform a purchase.

## Acquire, approve and recover

Run original Buyer uses the saved native merchant release and existing original operator. A CHALLENGE_ONLY handoff describes a seller without native settlement; retain that release and request a distinct configured NATIVE_X402 successor for paid acquisition. Do not edit the handoff mode or replace the original snapshot to make a different claim.

Each acquired page reaches the original SF81 browser broker. The UI displays that broker's original page intent, request hash, complete accepted terms, current native budget estimate and expiry. Approve or reject that exact original record. Its native reservation/signing result remains with SF36/SF88.

The broker's pending() method is only a bounded public-record accessor. It changes no approval, retry, reservation or signing behavior.

Accepted actions continue on the host after a page or typed connection disconnects. The browser saves the HTTP request ID before sending and reads the same listener's request on recovery. It never automatically resends a payment request after an unknown network result or a host restart.

After a restart, inspect the original Buyer and choose Recover original request. Explicit unpaid or expired continuation requires the original expected attempt hash and original continuation selection. The console forwards those exact values to the original engine.

Stop active request aborts this host's operation, retires its pending browser reviews, and leaves the original outcome for recovery. It is not a reversal or evidence of payment absence.

## Accounting and complete delivery

Accounting reads every original accounting page. Finalize uses the same original SF36 ledger through the native Dataset finalizer. Asset/network identities remain on each original entry; the console does not sum unrelated denominations.

Produce typed outputs invokes the original Dataset delivery. Export complete delivery requires the original acquisition to be complete, then packages the source handoff and study, every native acquired page/session archive, accounting, typed outputs, original manifest and operating guide through exportOpenAQBuyerDelivery.

The export ID and destination are retained by that engine. Repeat the same original export selection after interruption. The complete delivery directory is fixed at console/outputs/delivery; the separate receiving target is console/received.

The file table lists exactly the original declared members plus delivery.json. Individual downloads and the desktop complete-folder download verify their expected byte counts and SHA-256 values. A complete folder download accepts an empty destination or the same interrupted download; existing different or unrelated files are preserved and refused. On browsers without directory access, use the individual files or the original native export/receive commands for the whole directory.

Preview reads the original typed dataset and preserves literal values. It is a bounded view of those rows, not another scientific calculation.

## Typed operation

    import {randomUUID} from 'node:crypto';
    import {openOpenAQCustomer} from
      '@tokenjunkielabs/starforge-merchant/buyer/openaq-study/console';

    const customer = await openOpenAQCustomer({
      connectionFile: '/private/openaq/customer/connection.json',
      consoleId: originalConsoleId,
      configurationSha256: originalConfigurationSha256,
      sourceSha256: selectedSourceSha256
    });
    try {
      const before = await customer.view();
      const review = await customer.review({
        intentId: originalIntentId,
        acceptIndex: selectedOriginalOfferIndex,
        query: 'limit=50',
        maxPages: approvedPageLimit,
        maxTotalAtomic: approvedTotalAtomicCap,
        maxRows: 1000000,
        maxPageBytes: 1048576
      });
      const prepared = await customer.prepare(randomUUID(), review);
      const outcome = await customer.wait(prepared.id);
      if (outcome.state !== 'COMPLETE') throw new Error(outcome.error.code);
    } finally {
      await customer.close();
    }

The remaining named methods are run, recover, account, deliver, export, receive, reopen, decide, cancel, rows, job, wait and download. Their declarations are in client.d.mts.

Calling run submits the existing original Buyer operation. Read view().approvals and review the exact original terms/budget before decide({intent,approvalId,requestSha256,decision}). The agent connection does not approve automatically.

Job IDs belong to this listener and are limited to its most recent 128 completed/current requests. Durable original Buyer/archive state remains authoritative after eviction or restart. On a lost response, read that exact job first; if the listener changed, inspect original state and choose the corresponding original recovery path. Closing this client cancels only its own HTTP requests, not accepted server work or Applications.

## Lifecycle and receiving boundaries

The console holds one original Linux flock for its own host directory. The original customer and archive engines continue to hold their original per-operation leases. One host mutation runs at a time, while current native approval decisions and cached status remain available.

Shutdown stops accepting HTTP work, aborts its own native action and download responses, drains accepted actions/reads, closes its own broker, and releases the original host lease. The connection file is removed only if it still identifies this instance. Failed owned cleanup is reported and retains the handle for a later close; it is not reported as a successful stop.

Portable transfer uses the original complete delivery and receive/reopen APIs. Do not move a live private customer directory and rewrite its absolute path records. Stop the original host before an ordinary full-host backup, or export a complete delivery for independent receiving.

## Current worked-source context

The existing Del Norte example contains 140 retained historical observations and an original source review. The completed merchant and handoff operations have already reopened that same source without another provider request. They are distinct from a later paid Buyer operation.

The referenced actual merchant source release is CHALLENGE_ONLY. These previous source/merchant results do not by themselves establish a purchase, customer acceptance or revenue. The console and native workflow expose their actual returned states; any paid operating result must be retained from its own original native operation.
