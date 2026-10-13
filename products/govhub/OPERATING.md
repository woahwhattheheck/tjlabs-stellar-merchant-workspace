# Operate one saved GovHub project

## Initialize or reopen

Use separate absolute private directories for the editable workspace and supplied inputs. Do not put either inside the public source tree. The original CLI creates one named administrator and stores the password using the existing assessment engine. The default password prompt avoids placing a secret in command history; --password-env NAME can select an already configured private host environment value.

~~~sh
starforge govhub --python /absolute/existing/python3 cli \
  --workspace /private/govhub/project \
  --source-root /private/govhub/inputs \
  --username operator init --name "Site operations" --mode SUPPLIED
~~~

Use PILOT only for an explicitly authored commissioning cohort. The application does not treat example rows as customer observations.

Open the original application:

~~~sh
starforge govhub --python /absolute/existing/python3 serve \
  --workspace /private/govhub/project \
  --source-root /private/govhub/inputs --port 0
~~~

The server prints its actual loopback URL and workspace directory. Open that address and sign in with the retained account. The installed Applications entry takes the same existing workspace, input directory, optional Python executable and port. It starts the same original server; the application's own service lease owns its worker. Use Applications Stop before opening another server or CLI worker on that project.

A workspace already containing assessment.sqlite3 must be reopened rather than initialized again. The source-input directory is part of the saved project binding. Follow the original receiving relocation path when moving a private project; do not edit stored operation identities or fabricate a new workspace to bypass a pending command.

## Native source and operation flow

Create or reopen the environment's original provider profile. Provider paths are runtime bindings; the project/site/environment IDs and source revision identify the intended target. Each provider guide lists exact supported actions and required native tools. Credentials are supplied by the existing host's native session or environment-name references.

Retain the complete source first. Review the current source comparison and selected native capabilities. Create the original operation with its stable request key. An accepted provider workflow or activity remains the authoritative continuation; poll that same identity and observe its original retry deadline. A lost response is reconciled using the provider's explicit association controls. It does not authorize issuing the mutation again with a new request key.

The original command journal retains argv, cwd, stdout, stderr, file identities and pending native command state. If the host or process is interrupted, use its saved continuation and actual receiving-host paths. Keep the original source and operation records. Cancellation and native completion are distinct states.

The native provider snapshots and local source packages also have different meanings. Upsun snapshots cannot be downloaded as source archives: its complete source arm receives actual Git, database dump and selected writable mounts. Pantheon, Skpr, Tugboat and the other adapters retain their native provider IDs and exact source semantics. Read the selected provider guide before choosing a recovery action.

## CLI operation and backup

Arguments after the launcher command are passed unchanged to the maintained programme. Obtain each full native syntax through:

~~~sh
starforge govhub cli --help
starforge govhub build --help
starforge govhub upsun-receive --help
starforge govhub pantheon-receive --help
starforge govhub static-releases --help
starforge govhub dnn --help
~~~

A named private JSON input can drive an original GovHub action:

~~~sh
starforge govhub cli --workspace /private/govhub/project \
  --source-root /private/govhub/inputs --username operator \
  call ACTION --input /private/govhub/request.json
~~~

Use the action and full actual input returned by the original interface; action names in the provider receiving courses are the authority. Native receiving programmes use the same saved queue rather than a second controller.

Create the full original private backup into a new absolute directory:

~~~sh
starforge govhub cli --workspace /private/govhub/project \
  --source-root /private/govhub/inputs --username operator \
  backup --destination /private/govhub/receiving-copy
~~~

Keep the original complete backup report and original source files. A backup containing an incomplete marker is pending receiving, not a finished delivery. The exact component receiving course carries its native artifacts, operation continuations and independently reopened project as described in RECEIVING.md.

## Actual product inspection

Open, use and LOOK at the exact outgoing product as its recipient would. Inspect the original saved project at the actual presentation width and relevant narrow width; view the real images you capture. Exercise the selected content/provider controls, populated and empty/error views, saved decisions, native continuation and downloadable results. Open every applicable report and usable archive content, then reopen the delivered project in a separate directory.

Source parsing, HTTP success, DOM counts and another worker's review are not substitutes for observed operation. Repair any clipped, unstyled, overflowing or unreadable output in the same maintained source. Keep this work focused on the actual remaining product risk; do not replace it with a broad test campaign.

If the selected runtime is unavailable, retain this complete source edition and pending original operation for its existing equipped owner and inspect that owner's actual rendered return. Do not claim a native provider action, account access or final customer acceptance from source review alone. Preserve the existing zero-spend policy: no hosted Actions, paid runner or new provider account is introduced by this product.
