# Native catalogue source contract

This implementation preserves Webgriffe SyliusAkeneoPlugin v3.1.0, commit f5a38abc9537356dde16ad75f046f324a22ed6ec (MIT). The actual package requires PHP ^8.2, Sylius ^2.1.2 and Akeneo api-php-client ^11. It is an integration for an already selected installed application, not a claim about a prospective customer's installed dependencies.

Original ItemImport, its configured command bus/transport, Product importer, configured value handlers, Doctrine transaction, ProductVariantPreValidateEvent and native ItemImportResult remain authoritative. Whole-store reconcile and the original since-file are not invoked by this workspace.

An explicit selected cohort claims only its original identifiers. Unstamped live messages for claimed identifiers wait for review in the existing native failure transport; other identifiers retain original behavior. Approval binds complete source capture, current native values, installed mapping and local/source ownership. Outside selected locales/channels and existing stock fields remain local. Native queue acknowledgement is distinct from applied database state, native result persistence and staged-media publication.

The SourceGateway wraps the original middleware call. With sync transport the outer stamped call contains the nested Received call, so publication waits for the outer native transaction. A durable APPLIED marker shares that transaction; retries preserve the same operation/stamp and cannot rerun a committed native mutation. Source media is staged until actual commit and has its own original receiving journal.

## Source checkpoint status

This branch is an active complete-product implementation checkpoint. Bundle/configuration, admin/CLI and source/handover composition are being authored with the same owners. A source checkpoint is not an install-ready release or actual native/rendered acceptance. The final product guide and source manifest replace this status at whole release.
