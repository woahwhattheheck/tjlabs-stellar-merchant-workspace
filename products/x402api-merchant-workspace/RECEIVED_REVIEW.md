# Open a received merchant project in Applications

A completed merchant project includes its original archive, immutable receiving request and receipt, complete original source, and an independent runtime workspace. **Received merchant review** opens that same runtime through the existing invoice, payment history and retained-file screens. Applications retains the selected project, its source identity, startup result and stop/reopen history.

## Select the completed project

Use the complete current Merchant installation with the `x402api-merchant` feature and operator tools. The runtime needs its existing Linux Node 24 and Python executables. Keep the original received project at its received location, with these directories together:

- `control/`: original receiving request, complete result, source installation and runtime publication records.
- `original/`: complete original business and source files.
- `runtime/`: original received source archive, source tree, review configuration and independently received workspace.

Finish an interrupted original receiving through its existing request before adding the review application. The review entry reads the complete saved result and uses that exact receiving request to verify the original archive, source and runtime publication. It keeps the current runtime records and file-recovery progress.

## Prepare the private review credential

Choose a private review credential of at least 32 characters and place it in the installation's existing private environment JSON file. Use the environment name selected by `runtime/review-config.json`, or enter an explicit **Review credential name** in Applications.

The file must be a real owner-only file on the receiving host. The saved application keeps its path and SHA-256; credential values remain in that file and the original process environment. Enter the same private credential in the merchant screen when connecting.

This review opens the existing read-only merchant store. It requires the review credential alone. Live payment, webhook and fulfillment configuration belongs to the original live application.

## Add and start the application

In the installed operator's **Applications** view:

1. Choose the existing Merchant runtime and **Received merchant review**.
2. Enter the absolute completed project directory.
3. Select the private environment JSON file and, if needed, its review credential name.
4. Use local port **0** for an available port, or select the institution's fixed loopback port.
5. Select the existing Python executable if it differs from the runtime's configured Python.
6. Enable **Allow local commissioning origins** only for an original case whose configured payment endpoints are local.
7. Review the selected source and original inputs, save the application, connect its runtime release, then review and start it.

The retained startup verifies the complete receiving again, opens the original read-only store and checks the live listener's store identity before Applications publishes its URL. The listener is on `127.0.0.1`. Open the returned URL on the same host or through its existing SSH forwarding.

The Applications resource identity uses the original live Merchant family and the actual received workspace directory. Review and live operating applications therefore share the same managed resource ownership, backed by the original Merchant owner lease.

## Review invoices and delivered files

Open the application URL and enter the private review credential. The header shows **Project review** and the review banner.

Select an invoice to inspect its original state, payment records, event history, fulfillment and retained result. Open the original downloadable result to read the complete delivered bytes. Refresh reads the same original records. The read-only server does not start a payment polling timer, call a provider or load a fulfillment handler.

Use **Applications → Stop** when finished. The original managed stop drains requests and closes the Merchant owner lease. Its actual command result remains with the same operation. Reopen the saved application to review the same case in another managed run; the new run retains its own start/stop record and the original project/source selection.

If the operator process is interrupted, reopen the existing application and its original operation. Applications' normal recovery receives the retained start result and stop state. Keep its operation identity until that result is settled.

## Continue live operation

The received project retains its original activation configuration separately from review. Follow [Portable project receiving](PORTABLE_PROJECT.md) to prepare the existing live configuration and credentials, then use the existing **Merchant invoices** application against the same received workspace. Stop the review application before starting live work.

A later review shows the current received-runtime invoices and files while keeping the original receiving receipt and source edition as its identity. The complete receiving verifier checks the retained publication and source without resetting current locks, partial results or business progress.

## Command and application integration

The installed command is:

```sh
stellar-forge x402api-merchant-review \
  --project /absolute/received-merchant \
  --python /absolute/path/to/python3 \
  --host 127.0.0.1 --port 0
```

Supply the private credential through the original environment. Use `--operator-token-env NAME` to select its environment name. Managed Applications additionally pins `--expect-project-sha256` to the exact reviewed project selection.

The source provider retains both application kinds:

| Application | Command | Original resource |
| --- | --- | --- |
| Merchant invoices | `x402api-merchant serve` | Selected live workspace |
| Received merchant review | `x402api-merchant-review` | The completed project's received workspace |

The receiving programme `received-review-receiving.mjs` operates one original completed project through the actual installed Applications model, authenticated invoice/file review, desktop and phone browser views, stop and cold reopen. Keep the same project, Applications workspace, output directory and programme arguments when continuing an interrupted run. Its retained request IDs and original command results control continuation.

Run that full receiving against the original completed five-invoice case and its existing installed runtime:

```sh
node products/x402api-merchant-workspace/received-review-receiving.mjs \\
  --project /absolute/original-received-project \\
  --runtime /absolute/installed-merchant-runtime \\
  --applications /absolute/existing-applications-workspace \\
  --output /absolute/private/received-review-operation \\
  --environment-file /absolute/private/review-environment.json \\
  --python /absolute/path/to/python3 \\
  --playwright /absolute/path/to/playwright/index.js \\
  --chromium /absolute/path/to/chromium
```

Add `--allow-loopback` for the original local commissioning case. The programme requires the original five completed invoices, reads and downloads each result and payment request, and compares every original user table before review and after each stopped opening. Its two retained openings use the same saved application; the second follows a close and reopen of the existing Applications model. Resume uses the original per-opening operation and its real native outcome. Captured browser images remain private working output; customer delivery retains the complete project, returned files, structured operation and original source.
