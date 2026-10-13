# Install and operate the x402api merchant

The maintained `x402api-merchant` selection packages the original invoice application and its Applications adapter. It uses Node 24 or newer, Linux, Python 3.11 or newer and the existing `flock` command. The merchant uses Node's built-in SQLite and crypto. Its selected feature declares no npm dependencies; the explicit Node requirement is still checked by the profile, installer, doctor and managed launch.

The source-owned contribution registers the original `x402api-merchant` command, its three public exports, the `x402api-merchant` runtime feature and the **Merchant invoices** application. The recipe includes the maintained installation and Applications lifecycle. It preserves the source paths and excludes the commissioning programmes from the installed runtime.

## Build the selected source

Use the actual accepted source commit. Keep the resulting archive and its returned SHA-256 digest together.

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/original-checkout \
  --ref ACTUAL_ACCEPTED_COMMIT \
  --selection x402api-merchant \
  --out /private/merchant-package
~~~

The original builder reads that immutable Git snapshot, verifies the selected files, follows their native module imports and retains the recipe identity in the archive manifest. Use `--offline` when the same Git object store already contains its complete source. Continue an interrupted build with its same output directory, commit and selection plus `--resume`. Do not substitute an unrelated complete-repository package for the selected product.

## Prepare and install the runtime

Use the maintained `starforge` command from the selected release or its original `distribution/cli.mjs`.

~~~sh
starforge runtime-install prepare \
  --dir /private/runtimes/x402api-merchant \
  --archive /private/deliveries/original-merchant.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --feature x402api-merchant --operator

starforge runtime-install install \
  --dir /private/runtimes/x402api-merchant --offline

starforge runtime-install inspect \
  --dir /private/runtimes/x402api-merchant --load --source

starforge runtime-install run \
  --dir /private/runtimes/x402api-merchant -- \
  doctor --feature x402api-merchant
~~~

Keep `native: false`, `features: ["x402api-merchant"]`, `operator: true` and `pins: {}` when selecting the same profile through the browser. The original installer creates and records the dependency lock even when the selected dependency list is empty. A ready profile requires Node 24 and the original Linux operator tools. It does not require the toolkit's optional Stellar seller dependencies.

A changed or interrupted dependency installation uses the existing **Inspect**, **Resume**, **Recover** and **Upgrade** controls. The original runtime directory, source archive, profile and kernel lease remain their authority. The application does not install or choose another interpreter during launch.

## Prepare the original merchant configuration

Use the complete configuration described in [README.md](README.md) and the original [config.example.json](config.example.json). Keep the configuration in a private regular file owned by the operator, with mode 0600. The application records the exact configuration bytes, the selected fulfillment module, and any declared delivery manifest and files.

The configuration continues to use environment variable names for the tenant credential, operator token and webhook secrets. Supply those values through the existing private Applications environment file, or the environment of the original runtime-workspace process. The environment reader retains its file digest; values do not enter the application review or shared receiving report.

For the original file-delivery adapter, set `fulfillmentModule` to the actual installed `products/x402api-merchant-workspace/fulfillment/file-delivery.mjs`. Keep `fulfillmentOptions.manifest` and `fulfillmentBinding` attached to the originally selected file edition. The manifest's declared file bytes and hashes must match. Each edition is included in the review, so reopening older completed invoices does not silently select a new file.

The **Additional handler files** field accepts a JSON array of absolute paths for a custom handler's other working inputs. The original file-delivery manifest and its declared files are included automatically. A custom handler remains responsible for its own external-operation reconciliation contract.

Run the original configuration doctor through the selected runtime before opening a production workspace:

~~~sh
starforge runtime-install run \
  --dir /private/runtimes/x402api-merchant -- \
  x402api-merchant doctor --config /private/merchant/config.json
~~~

The doctor verifies configuration and reads the selected file edition. It does not create an invoice or submit a payment.

## Open Merchant invoices in Applications

Open the maintained Runtime workspace, attach the ready runtime and select **Applications → Merchant invoices**. Enter the private configuration file, the original merchant workspace directory, port, and optional private environment file. A port of 0 lets the original server select an available local port.

Review and save the application. If the selected runtime has not yet been adopted into its managed home, use the existing **Connect**, **Retry** or **Resume** action for that same retained adoption request. Start is available only after the original adoption is ready.

The saved command contains the exact configuration/input fingerprint and original workspace directory. Review, Save, Start and the command's actual launch recheck those inputs. Changing configuration or a selected file requires a new application review; it does not silently modify the command that was already accepted. The file-delivery factory also verifies the retained manifest fingerprint against the exact bytes it parses.

Start the saved request and use its returned **Open application** URL. The adapter accepts only the original server announcement for the selected workspace and confirms its actual local health endpoint. The merchant's operator token remains private. Use the application's existing connection form to open its invoice desk.

For an existing workspace, the merchant keeps its SQLite store, completed invoices, retained authorizations, verified events and result files. Its original store lease excludes a simultaneous writer. Use the existing application stop control; the original merchant server finishes local durability before releasing that lease. The managed worker records the actual process result and output.

## Reopen and receive a completed workspace

The original completed commissioning archive is a usable receiving input, including its SQLite database, full saved results and source. The installed receiving programme described in [INSTALLED_RECEIVING.md](INSTALLED_RECEIVING.md) opens that saved workspace through this maintained Applications path. It reuses the five completed invoices and compares their original records and download bytes.

Retain the selected package, runtime profile and lock, application review and run IDs, original stop result, source/configuration input identities, and the complete following customer archive. An unreturned process remains the same original request until its actual state is reconciled.
