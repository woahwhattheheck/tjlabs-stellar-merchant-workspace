# Complete API customer handover and receiving

This application retains and restores the **existing managed Buyer API-customer workspace** through the original SF88 workspace recovery engine, its native ledger checkpoint and SF101 authenticated encryption. No recovery action creates a purchase, approves a payment, submits an API request, refreshes allowance or retries a saved customer task.

The original customer workspace remains authoritative for passes, replacement relationships, prepared requests, returned response bytes, purchase reviews, payment proofs, reports and portfolio settings. Its original Buyer/Inbox owns all business execution.

## Complete retained data

The handover contains the selected original customer configuration and complete customer directory; managed Buyer operator, policy, signing keys and consistent ledger; complete purchase inbox; Buyer client state when present; every external purchase directory and original handoff referenced by the customer; optional complete agent setup, operation/export/read journals and host-declared original inputs/purchases.

Capture checks saved hashes for request bodies, responses, reviews, proofs, reports and agent inputs. The application record binds the full original workspace JSON, workspace ID/revision, configuration, dependencies, pass/order/manifest identities, unresolved tasks and agent setup. Every retained file is also authenticated by the original native recovery manifest.

Runtime code and named environment values are installed separately. Review lists the original runtime requirements and claim environment names. Supply claim tokens and backup passphrase separately. A customer without a managed Buyer keeps its existing individual exports; this complete ledger-based handover requires an actual managed Buyer and does not invent one.

## Source setup

Stop the original customer cleanly. Stop its agent and all other writers of included data, Buyer, inbox and agent journals. Review/capture acquire the original customer OS lease. The existing native engine locks/checkpoints the ledger and compares inventories before and after copying. Other native writers must be quiesced explicitly.

Choose a private absolute state root containing every customer data dependency. Keep the recovery journal, recovery configuration, programme output and encrypted output outside that root and outside each other. Paths must be ordinary private files/directories owned by the current user, without links or shared hardlinks. Optional not-yet-created client state is recorded as absent.

~~~sh
api-pass-recovery configure \
  --directory /private/recovery-journal \
  --out /private/recovery-config.json \
  --source-config /private/customer-state/customer-config.json \
  --state-root /private/customer-state \
  --agent-directory /private/customer-state/agent
api-pass-recovery serve --config /private/recovery-config.json
~~~

The returned private loopback link opens review, capture, verification, restore, encrypted-file downloads and original-customer reopening. A receiving host configures a journal without the source flags. The existing api-pass-workspace recovery subcommand accepts the same commands.

Never put a passphrase value in a JSON file, command argument, browser form, launch URL, handover index or archive directory. Only the environment variable name is accepted, default SF88_BACKUP_PASSPHRASE. The original native engine also requires that name to differ from its wallet environment name.

## Stable operations and continuation

Every action uses a UUID and an immutable request. The journal retains the dispatch before the native call and its complete returned result before marking completion. Repeating start with identical options returns the original request. Different options under that ID are rejected. Continue an unfinished request with resume; do not create a replacement request.

If a capture response is lost, resume verifies the already-published encrypted bundle against the original request ID and reviewed source hash. If a restore response is lost, resume verifies the entire exact original baseline before acknowledging the destination. A known return that could not be saved is RETURN_PENDING; its process keeps that exact return for persistence.

Once restoration is completed, reopening uses the current original workspace. It never rolls recipient edits back to the capture. FAILED or CANCELLED describes an archive attempt, not proof that no file publication occurred. Error history and the immutable original dispatch remain for explicit same-ID reconciliation. Journal startup does not retry operations. Cancel affects archive work only.

The journal holds one OS lease for its lifetime. While serve is running, use its HTTP interface; a separate CLI cannot acquire that same journal concurrently.

## Capture

Run review with the configured original source and retain profile.reviewSha256. The complete start request has this shape:

~~~json
{
  "requestId": "e27d4e23-ddae-4221-8b6e-520479cfc601",
  "kind": "SNAPSHOT",
  "options": {
    "output": "/private/handover/customer",
    "expectedReviewSha256": "ACTUAL_64_HEX_REVIEW_SHA256",
    "passEnv": "SF88_BACKUP_PASSPHRASE",
    "quiesced": true
  }
}
~~~

~~~sh
api-pass-recovery review --config /private/recovery-config.json
api-pass-recovery start --config /private/recovery-config.json --request /private/capture-request.json
api-pass-recovery inspect --config /private/recovery-config.json --request-id UUID
api-pass-recovery resume --config /private/recovery-config.json --request-id UUID
~~~

Refresh review after a legitimate source change. Do not change an already admitted request to describe a new edition.

## Verify, restore and use original data

A verification request selects the complete encrypted directory and actual original Python:

~~~json
{
  "requestId": "086d48bd-6c7d-4a03-81cd-5472d5862016",
  "kind": "VERIFY",
  "options": {
    "bundle": "/private/received/customer",
    "passEnv": "SF88_BACKUP_PASSPHRASE",
    "python": "/usr/bin/python3"
  }
}
~~~

A restore refers to that **completed verification in the same journal**:

~~~json
{
  "requestId": "2e92cbd1-6036-475c-bb74-1c7d65c6a1bd",
  "kind": "RESTORE",
  "options": {
    "verifiedRequestId": "086d48bd-6c7d-4a03-81cd-5472d5862016",
    "expectedStateRoot": "/private/customer-state",
    "passEnv": "SF88_BACKUP_PASSPHRASE",
    "python": "/usr/bin/python3"
  }
}
~~~

The exact original root must be absent or empty. The operation never deletes, merges or overwrites populated customer state. A separate receiving host creates only the ordinary parent directory and installs the original runtime prerequisites. Original absolute paths remain unchanged: relocation and rewritten signed configurations are not supported.

After completion, open-result returns current verified original config/agent pins. The browser's Open restored customer uses the maintained launcher in terminal approval mode. It reads retained data immediately. Native purchases/API calls still require their normal original controls and explicit actions. On opening, interrupted saved tasks become the existing application's INTERRUPTED records; they are never automatically executed.

## Agent and HTTP interface

The installed api-pass-recovery CLI accepts complete JSON request files. Typed JavaScript callers use openApiPassRecovery through the installed recovery operations export.

| Method | Route | Purpose |
|---|---|---|
| GET | /api/session | Stable journal ID and active original customer |
| GET | /api/operations?offset=0&limit=50 | Paginated operation history |
| GET | /api/operations/UUID | Original request, outcome and continuation state |
| GET | /api/operations/UUID/files | Exact encrypted member inventory |
| GET | /api/operations/UUID/file?name=manifest.json&offset=0&limit=262144 | Bounded base64 chunk plus chunk/whole SHA-256 |
| POST | /api/review | Stopped original source review |
| POST | /api/start | Admit one immutable request |
| POST | /api/resume | Continue that exact request ID |
| POST | /api/cancel | Stop active archive work |
| POST | /api/open-result | Prepare verified original customer launch |
| POST | /api/open-customer | Explicitly open restored customer |
| POST | /api/close-customer | Drain and close that same customer |

All POST requests require the exact loopback Origin and bearer token. Keep token-bearing launch URLs private. A historical launch may exist inside encrypted original data; opening a receiver creates a fresh listener and token.

File reads expose only original encrypted manifest.json and objects/NNNNNN.gcm members, never decrypted keys or responses. Preserve names, lengths and full hashes. Folder download streams members through the browser File System Access API. Browsers without it can save individual files up to32MiB; use CLI/agent bounded reads for larger files. Consume every operation-page nextOffset and file-chunk nextOffset through null.

## Complete original-data programme

Run recovery-programme.mjs with --input ABS_JSON. The input uses schema stellar-forge.sf101.api-customer-recovery-programme.v1, a UUID operationId, a private output directory and separate journalDirectory.

Capture mode requires the explicit quiesced:true acknowledgement and supplies source:{configFile,stateRoot,agentDirectory?}, output and optional passEnv/python. It reviews, captures, verifies, compares exact record hashes and retains the complete encrypted inventory.

Receive mode supplies bundle, expectedStateRoot, optional passEnv/python, and optionally recipientEdit:{profileId,label}. It verifies, restores, opens the actual customer over HTTP, reads each original pass's full history, optionally records an explicit harmless label edit through the original API, closes and independently cold-reopens that same customer. Optional browser:{module,executable} uses actual installed Playwright/Chromium and retains a real restored-customer screenshot.

This programme never creates customer records, grants allowance, substitutes fixtures, deletes source state, dispatches payment or submits API calls. Inputs must identify the actual original operator. Capture and receiving can run on separate hosts with the same original data paths. A first receiving baseline is retained before recipient edits, and continuation keeps fixed phase results without replacing progressed state. Completion returns full JSON artifacts and hashes.

Git publication alone is not evidence of native capture, restore, browser receiving, a paid purchase or customer acceptance. Actual native outcomes and reopen diagnostics remain separately reported.
