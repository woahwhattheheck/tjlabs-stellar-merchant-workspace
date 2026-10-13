# Catalogue workspace: native source and operation contract

This MIT bundle extends an installed Sylius application using the original Webgriffe SyliusAkeneoPlugin **3.1.0**, source commit **f5a38abc9537356dde16ad75f046f324a22ed6ec**. It preserves that plugin's ItemImport message, native importer, Messenger command bus and transport, Doctrine transaction, ProductVariantPreValidateEvent and ItemImportResult records. Installed Composer versions, original class bytes and configured handler/resolver definitions are part of every review.

Primary sources: [released connector](https://github.com/webgriffe/SyliusAkeneoPlugin/tree/f5a38abc9537356dde16ad75f046f324a22ed6ec), [native importer](https://github.com/webgriffe/SyliusAkeneoPlugin/blob/f5a38abc9537356dde16ad75f046f324a22ed6ec/src/Product/Importer.php), [bus middleware](https://github.com/webgriffe/SyliusAkeneoPlugin/blob/f5a38abc9537356dde16ad75f046f324a22ed6ec/config/packages/framework.php), [Akeneo PHP client v11](https://github.com/akeneo/api-php-client/tree/v11.0.0). The actual receiving site's Composer lock and configured services govern installation. Different connector versions require a source/integration review.

## Installation in an existing native project

Use the adjacent reviewed source installer in ../receiving. It stages this complete path package, resolves a candidate Composer lock without scripts or installation, and presents exact source/configuration postimages. The application requires ext-zip for the catalogue archive. Never run the connector's development test-app-init, database drop or fixture commands on an existing project.

Register Tjl\CatalogueWorkspace\TjlCatalogueWorkspaceBundle for all environments in the existing bundles.php. Import @TjlCatalogueWorkspaceBundle/config/routes.php under /%sylius_admin.path_name%/catalogue-workspace inside the existing admin firewall. The extension automatically registers its services; no replacement native bus or client is installed.

Configuration alias tjl_catalogue_workspace accepts directory, operator_role and max_export_bytes. directory must be an ordinary absolute private path shared by all original workers and operator processes, default %kernel.project_dir%/var/catalogue-workspace. operator_role defaults ROLE_ADMINISTRATION_ACCESS. max_export_bytes defaults 4 GiB and bounds expanded complete catalogue archives as well as their outer bytes. Native PHP memory limits and web upload limits remain actual host constraints; large files can use the streaming native command instead of browser upload.

The SourceServices compiler preserves the actual selected PSR HTTP client, original authenticated Akeneo builder/getters and native Sylius image uploader. It wraps only the file handler's filesystem and the uploader's storage adapter. Custom adapters must satisfy the original source/readback interfaces. Resource caching is disabled for the reviewed source scope.

Run the explicit install action to create only tjl_catalogue_record. It never alters native catalogue tables. Read engine next, and retain that actual response. The active source tree is authored and independently reviewed; native installed, browser and visual acceptance are completed by the actual receiving course, not by source inspection alone.

## Native command and actor

Run through the selected existing PHP and bin/console:

    /actual/php /actual/project/bin/console catalogue:workspace ACTION --input /private/input.json --operation-id original-command-id --actor existing-admin-username --output /private/result.json

Every action has a complete JSON object input, including {} for install, engine and projects. The actor must be an existing enabled Sylius administrator whose native role hierarchy includes the configured role. The retained actor identity is sylius-admin:ID:username. Browser actions derive the same identity from the existing authenticated native session and validate its CSRF token.

The result schema is tjl.catalogue.workspace-result.v1 with state, action, operation_id, project_id and result or error. A returned COMPLETE or WAITING_NATIVE envelope exits **0**. A thrown action returns ATTENTION and exits **1**. CLI input/parse/authorization errors also return the same error envelope when output can be written. A zero process exit with WAITING_NATIVE is an observed response, not a completed import.

The original command ID binds the exact action, input, project and actor. Repeating a completed command returns its retained result; repeating an incomplete capture drives the same source capture. dispatch and retry acknowledgements are retained independently from actual current operation status. The output file is atomically replaced with the current complete envelope; complete command and source history remain within the original project.

### Actions and exact input fields

All project actions require project_id.

| Action | Additional input | Result |
| --- | --- | --- |
| install | none | Own table installation status |
| engine | none | Actual packages, class hashes, mapping and engine sha256 |
| projects | offset, limit optional | Original project records, bounded page |
| project-create | label, identifiers[], locales[], channels[] | Original project and explicit active identifier claims |
| project | none | Project, complete cohort/import summaries and live-pending records |
| capture | capture_id optional, additional_requests[] optional | Complete selected capture/cohort page; same ID continues incomplete source |
| cohort | capture_id, offset, limit | rows, total, next_offset, original source descriptors |
| review | capture_id, identifier | Frozen source/native/mapping comparison with sha256 |
| missing-review | capture_id, identifier | Same explicit review for an observed missing source |
| approve | review_id, review_sha256, approve_native_mapping:true, rules[] | Exact immutable approval |
| dispatch | approval_id, import_operation_id optional | Original import operation and its observed state |
| retry | import_operation_id, preserve_original_approval:true | Same stamped import; current source/native checks remain authoritative |
| operation | import_operation_id | Actual current native/source/media state and original result IDs |
| retain-unapplied | import_operation_id, confirm_no_native_commit:true, reason | Explicit retained unapplied disposition; old stamp cannot mutate |
| missing-apply | review_id, review_sha256, confirm_selected_disable:true, acknowledge_access_boundary:true, disable_parent_if_no_enabled_variants optional | Actual bounded native disable effect |
| release-claim | identifier, resume_original_live_imports:true | Claim history retained, normal native import behavior restored |
| record | kind, id | One original review, approval, command, missing-effect, export, received, live-pending or result |
| files | none | All original project/source/journal blob descriptors |
| download | sha256, and CLI --destination /absolute/file | Complete SHA/size checked original file and its destination |
| export | none | Frozen catalogue ZIP descriptor and manifest identity |
| receive | archive_path | Same original project identity and accepted archive receipt |

The download action is a CLI/controller file operation; the browser uses its authenticated original download route. No caller-supplied filesystem path is accepted by the browser JSON dispatcher. Browser receiving uses a selected uploaded archive and retains its complete original bytes before entering the receiving transaction.

A field rule is {field_id, owner:"source"|"local", before_sha256, value?}. field_id and before_sha256 come from review.native.fields. Source ownership forbids replacement. Local ownership without value retains the exact reviewed native value; explicit value is validated by its native selector. Translation strings/null, enabled booleans, selected channel prices in integer minor units, attribute native values, taxons/positions, selected channels and dimension properties are supported. New native entities need an explicit local value when choosing local ownership.

Existing fields outside selected locales and channel prices, and onHand/onHold/tracked, remain local automatically. The complete original mapping runs inside the native transaction before ownership is applied at ProductVariantPreValidateEvent. The full source product and native mapping are shown together; the application does not invent a synthetic source-to-field projection.

## Original import continuity

A project claims only its explicitly selected product identifiers. A received ordinary unstamped ItemImport for an active claim is recorded as REVIEW_REQUIRED and sent through the installed failure transport as an unrecoverable message. It is never silently imported. Unselected traffic retains the original behavior.

An approved stamped import performs a fresh native GET traversal at actual handling. Complete method/URI/representation/body identities must match the frozen capture; an unknown dependency suspends before an unreviewed GET. Native getters then receive newly opened original response streams. Authentication remains with the original client and is never exported.

The handler locks and compares the actual reviewed native entities inside the original Doctrine transaction. Native importer and events run unchanged. The APPLIED row and native catalogue mutation commit together. A Doctrine observer records the actual generated ItemImportResult ID during its original flush. A duplicate of the same stamped operation never reapplies a surviving native commit.

A synchronous transport re-enters the same bus inside the original outer transaction. The active source context remains around the outermost call; media publication waits until that outer transaction is finished. Asynchronous admission may return QUEUED before the worker imports anything. Read operation to observe the actual result; never use queue acceptance, cursor advancement or process exit alone as completion.

If the database commit survives but a result is lost, APPLIED permits result-only recovery. If file publication is incomplete, MEDIA_PENDING, COMMIT_UNCERTAIN or NATIVE_RECEIPT_PENDING remains visibly waiting. The same operation reconciles original staged file intents; it does not reapply the catalogue mutation.

If source or native values changed, an unapplied operation can be explicitly retained with retain-unapplied. It cannot be reactivated by retry or an old queued stamp. A following capture/review/approval has new IDs and preserves all old evidence. This disposition does not delete transport messages or call an all-variant reconciler. A committed or uncertain publication cannot be disposed as unapplied.

A MISSING observation is the selected account's actual 404/access result. The explicit missing action obtains a following original capture and requires the item still missing and native state still equal. Only the selected variant is disabled. The optional parent action additionally requires no enabled variants. The original broad connector reconcile command is never invoked.

## Original files, export and receiving

Every complete source body, binary media response, media preimage/after-image, native command journal and review record retains its byte hash. Source and native import journals remain outside SQL rollback in the same selected private directory.

Export freezes its manifest and member descriptors before writing the ZIP. A resumed original export uses that same frozen cohort even when later project work exists. The archive is reopened and every member's name, size and SHA checked before its receipt is returned. No auth/token cache is exported.

Receive validates every member before original records are installed atomically. Exact same-archive continuation returns the accepted receipt without overwriting later local work. A different incoming archive cannot overwrite an already populated same-named project. Referenced native products/users/results still require the separately received original Sylius SQL/files/configuration graph.

Use the adjacent full native project tools for that installed application graph. Core catalogue export intentionally does not claim to reconstruct an unrelated shop database from review JSON. Receiving into the same original full native project preserves original IDs, claims and stamp/result continuity.

## Browser and required actual acceptance

The admin menu opens this bundle under the existing native firewall. The operator can create/open projects, capture and page the whole cohort, choose exact field ownership, approve/import, inspect real native result IDs, explicitly retain unapplied operations, review selected missing records, download originals and export/receive projects.

Browser pending actions are scoped to origin, native route, actor and project. Mutations retain complete input before dispatch. A lost response offers the same action; retained history/download permits a separate following action without cancelling original native work. Editable controls are held during a native request to prevent an awaited refresh from overwriting unsaved input. Current field drafts preserve malformed text until explicit validation.

The actual producing operator must open the exact installed pages and outgoing files, visually inspect real wide/narrow states, operate the important controls, verify downloaded original bytes, and reopen the same original project after interruption and on the selected second native site. Source parsing and DOM counts do not substitute for viewing. Keep native and visual acceptance honestly pending until those actual artifacts/results exist.
