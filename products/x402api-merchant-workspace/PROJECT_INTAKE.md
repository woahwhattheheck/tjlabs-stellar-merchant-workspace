# Receive an original merchant archive in Applications

**Receive merchant project** opens the complete original project ZIP in a private intake desk. It shows the original store, export, source edition, table counts and every retained file before receiving. The same saved application starts or resumes the original native receive and then opens the original invoice workspace.

The archive remains the customer's original export. The receiving directory holds its original request and receipt, source, independently received runtime and current operating records. Applications retains the selected archive, native operation, source and managed start/stop history together.

## Choose the original project and destination

Use the complete current Merchant runtime with the existing Linux Node 24 and Python executables. Select the ZIP returned by the original **Export project** workflow in [Portable project receiving](PORTABLE_PROJECT.md), together with that export's SHA-256.

A commissioning-study ZIP or a directory-handover archive has its own original reader. Open that delivery through its original receiving workflow first; select its original browser-project export here.

Choose a receiving directory under an existing private parent owned by the operating account. The parent must be a real directory with owner-only permissions. The destination can be new, empty, or this same original project's existing receiving directory.

Keep the archive outside the destination and the destination independent of the original merchant workspace. Retain that destination on continuation: the saved request binds the archive path and SHA-256, receiving directory and native operation.

## Prepare the private credential

Use the installation's existing owner-only environment JSON file. Set a review credential of at least 32 characters without whitespace under **MERCHANT_REVIEW_OPERATOR_TOKEN**, or select another environment name in Applications.

Enter its value in the private environment file and connected browser. Saved application settings, source and startup records retain the environment name. The invoice review opened by intake uses that same credential.

Live payment-provider, webhook and fulfillment credentials stay with the original live application.

## Save and start the application

In the installed operator's **Applications** view:

1. Select the current Merchant runtime and **Receive merchant project**.
2. Enter the absolute original project ZIP path and export SHA-256.
3. Enter the selected receiving directory.
4. Select the private environment JSON file and review credential name.
5. Select the existing Python executable if it differs from the runtime's Python.
6. Use port **0** for an available loopback port or the institution's selected port.
7. Enable **Allow local commissioning origins** for a project with original local payment endpoints.
8. Review the original summary and source, save, connect the runtime release, then review and start.

Preparing and saving inspects the complete archive. The actual receive starts when the operator selects **Receive project** in the desk.

The review displays the store, export operation, complete archive/source identities, original table counts and destination. The saved command binds the complete original request, including additional fields retained by an earlier native receive.

## Inspect and receive

Open the managed application's returned loopback URL and connect with the selected credential.

| Section | Original content |
| --- | --- |
| Original project | Store, export, archive path/bytes/SHA-256, native manifest identity, source SHA-256 and destination |
| Original business tables | Every original table and row count |
| Complete archive inventory | Every retained path, byte count and SHA-256 |
| Complete manifest download | Complete parsed original project manifest |
| Receiving status | Original receive operation, phase and concrete continuation condition |
| Receiving record download | Exact complete native receipt bytes |

Use **Find files** and **Previous files / Next files** to inspect the complete inventory. Download the full manifest before receiving when reviewing a delivery.

The displayed **Native manifest identity** follows the original native encoding. The downloaded JSON preserves the complete parsed manifest with the desk's JSON encoding, so its file-byte hash can differ. Archive and retained-member hashes are exact original byte identities.

Select **Receive project**. The native reader retains the original request, verifies the whole archive, source and records, and publishes the independent runtime. The desk advances through receiving and opening invoices to **Project received**.

Download the original receiving record. Select **Open original invoices** and connect with the same private credential. The original screen opens invoices, payments, event history, payment-request envelopes and complete retained files; see [Received merchant review](RECEIVED_REVIEW.md).

Both desktop and phone use this same desk. Long identities wrap; the complete file inventory scrolls within its table.

## Stop, reopen and resume

The intake application owns both its desk and original read-only merchant listener. **Applications → Stop** drains native receiving, closes both listeners and releases their original resource ownership.

Keep the same archive, hash, destination, saved application, private environment and Applications operation after interruption. If a response disappears, **Refresh status** receives its actual state. **Receive project** and **Resume original receiving** reuse the original native request.

When a concrete continuation condition appears, resolve it at that original destination and resume the same operation. The original receiver reconciles its existing request, receipt and publication records.

A cold opening verifies the original complete receipt and opens the current received workspace. It preserves later business rows, valid activation configuration and original file-recovery progress.

Use Applications' original recovery for an interrupted managed run before continuing it. Its actual native outcome remains in the same run history.

To continue live merchant work, stop intake/review and open **Merchant invoices** with the received workspace and existing activation configuration. All three application kinds share the same original Merchant resource family for that directory.

## Command and integration

```sh
stellar-forge x402api-merchant-intake \
  --archive /absolute/original-merchant-project.zip \
  --archive-sha256 ORIGINAL_64_CHARACTER_SHA256 \
  --destination /absolute/private/received-merchant \
  --python /absolute/path/to/python3 \
  --operator-token-env MERCHANT_REVIEW_OPERATOR_TOKEN \
  --host 127.0.0.1 --port 0
```

Supply the credential through the process's existing private environment. Applications additionally pins the native operation and exact reviewed selection SHA-256.

Source exports are **inspectMerchantIntake** and **startMerchantIntake**. The package export is **./merchant/x402api/intake**, the Applications kind is **x402api-merchant-project-intake**, and the command is **x402api-merchant-intake**.

| Request | Result |
| --- | --- |
| GET /api/state | Saved selection, original summary, receive phase and original review URL |
| GET /api/manifest | Complete original parsed manifest |
| GET /api/files?offset=0&limit=50&filter= | Original inventory page; limit at most 100 |
| POST /api/receive with an empty JSON object | Begin or resume the same native request |
| GET /api/receipt | Exact completed native record |

These routes use the same loopback Host, same-origin and private bearer credential checks. Project selection belongs to the original Applications review and retained command.

## Complete original operating course

The full **received-review-receiving.mjs** programme accepts an original project archive or an already received project. Its archive route operates the actual installed Applications model and browser:

1. Review, save and connect the archive-intake application.
2. Read every inventory page and download the full manifest.
3. Submit the real receive, deliberately lose its first successful HTTP acknowledgement, and receive that same operation through refresh.
4. Download the original receipt and operate desktop and phone views.
5. Stop, close the Applications model and cold-reopen the same saved intake application.
6. Save a separate received-review application and read all five original invoices, histories, envelopes and result files.
7. Operate desktop and phone invoice review, stop, cold reopen and repeat.
8. Compare every original user table and retain actual managed results, complete downloads and source selection.

```sh
node products/x402api-merchant-workspace/received-review-receiving.mjs \
  --archive /absolute/original-merchant-project.zip \
  --archive-sha256 ORIGINAL_64_CHARACTER_SHA256 \
  --project /absolute/private/received-merchant \
  --runtime /absolute/installed-merchant-runtime \
  --applications /absolute/existing-applications-workspace \
  --output /absolute/private/merchant-receiving-operation \
  --environment-file /absolute/private/review-environment.json \
  --python /absolute/path/to/python3 \
  --playwright /absolute/path/to/playwright/index.js \
  --chromium /absolute/path/to/chromium \
  --allow-loopback
```

Use the original five-invoice commissioning case and original project export. Remove the local-origin option for a case with external provider origins.

Continue with the same arguments and output directory. Each completed phase validates its actual stopped command and every downloaded file before reuse. Browser close failures stay with the owning operation. The complete output retains both intake openings, both invoice openings, original table identities and Applications history.

Browser images remain private working output. Customer delivery keeps the complete original project, receipt, returned files, structured operating result, complete source and this guide.
