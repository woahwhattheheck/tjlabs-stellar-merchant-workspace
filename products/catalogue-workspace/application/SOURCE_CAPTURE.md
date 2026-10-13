# Original Akeneo source and native media publication

This component extends the selected installed Webgriffe SyliusAkeneoPlugin.
It does not replace its Messenger transport, product importer, result middleware,
Doctrine transaction, value handlers or Sylius image path generator.

## Native authority

The implementation was read against:

- Webgriffe SyliusAkeneoPlugin v3.1.0,
  f5a38abc9537356dde16ad75f046f324a22ed6ec (MIT):
  https://github.com/webgriffe/SyliusAkeneoPlugin/tree/f5a38abc9537356dde16ad75f046f324a22ed6ec
- Akeneo api-php-client v11.0.0,
  b7f9448943b775fcec8f54ad7a29543899baae4b (OSL-3.0):
  https://github.com/akeneo/api-php-client/tree/b7f9448943b775fcec8f54ad7a29543899baae4b
- Sylius v2.1.2 native ImageUploader and FilesystemAdapterInterface (MIT):
  https://github.com/Sylius/Sylius/tree/v2.1.2/src/Sylius/Component/Core

These remain installed dependencies under their original licenses. This source
contains new adapter implementation, not a copied PIM client or importer.
The installed Composer lock, actual API builder and original storage selection
must be inspected during installation; a compatible declared range alone is not
an observation that a particular host has run successfully.

## Bundle integration

The owning bundle extension calls:

    SourceServices::register($container);

after defining Store::class, tjl_catalogue_workspace.directory and
tjl_catalogue_workspace.max_export_bytes. Its compiler pass calls:

    SourceServices::compile($container);

after the original Webgriffe definitions are loaded. This installs the retained
PSR-18 client via the native builder's setHttpClient and disables its optional
resource cache. An explicitly configured existing client is preserved as the
inner transport; otherwise native PSR-18 discovery chooses the installed client.
Original password/token configuration remains in the original factory. No
credentials, token requests, token responses or cookie headers are journalled.

The pass substitutes only the original configured FileAttributeValueHandler
filesystem and the original image uploader's filesystem argument. Its native
image adapter remains the backend; sylius.storage supplies actual complete
preimage readback through Flysystem FilesystemOperator. A custom uploader or
storage installation must retain this exact matching backend/readback binding.
The compiler does not guess a remote storage implementation. Private workspace
and locks must be shared by all original operator and Messenger processes.

## Public source API

Namespace: Tjl\CatalogueWorkspace\Source.

- SourceGateway::capture(projectId, captureId, selection): array
- SourceGateway::inspect(captureId): array
- SourceGateway::withApproved(projectId, operationId, snapshot, callable): mixed
- SourceGateway::operation(operationId): ?array
- SourceGateway::exportProject(projectId): array
- SourceGateway::importProject(projectId, files): void

Selection contains identifiers, an ordered unique list of native product
identifiers. Optional additional_requests contains explicit native read
descriptors:

    {"api":"attribute_option","method":"get","arguments":["attribute-code","option-code"]}

Allowed APIs are product, product_model, family, family_variant, attribute,
attribute_option, category, channel, locale, media, measurement_family and
association_type. Methods are get, all and media download only, subject to the
actual installed API's methods. No arbitrary URL, token parameter or write
request is admitted.

The complete source snapshot schema is tjl.catalogue.source-snapshot.v1.
It retains id, project_id, state, exact selection, authority, products keyed
by native identifier, graph, calls, exact requests, complete sources and sha256.
Each product has PRESENT/MISSING, original decoded data and source_ids.
Every source retains its exact nonsecret request, actual response status,
headers, protocol, complete body descriptor, byte hash and observation times.
Original bytes are authoritative; the decoded PHP values are a native client
projection. A capture is a collection of original responses, not a claimed
atomic upstream database snapshot.

Capture traverses the full selected product/model/family/family-variant/attribute
graph, native category ancestors, actual locale/channel references, every page
of select options and each referenced product image/file metadata and binary
download. The option collection uses the original importer's default page size.
Unknown custom dependencies remain explicit: a following capture adds the
actual descriptor and receives a new review; an approved snapshot is immutable.

Source and media bytes use the existing Store's private content-addressed blobs.
Independent private journals are durable outside Doctrine rollback. Source IDs
and exact complete responses survive same-operation continuation. Completed
capture requests are reused, while interrupted/failed attempts remain retained.
A native Retry-After on 429/503 creates an absolute authority deadline. No
hidden application retry or paid transport is introduced.

## Approved import boundary

The owning middleware wraps the ENTIRE native result/Doctrine/handler chain,
outside the outermost Doctrine transaction. An outgoing asynchronous dispatch
may finish without APPLIED and without media effects; it remains
AWAITING_NATIVE_IMPORT. Its later actual Received execution checks source anew.

Before an uncommitted import, all original native API calls are refetched through
the installed authenticated client. Every original request/status/body hash must
match the approved snapshot and the request set must be complete and identical.
The importer then reads only the already-checked retained responses. Each read
gets a fresh complete PSR stream. An unknown dependency is journalled and rejected
before its network GET; select and review that dependency explicitly.

The original handler writes its APPLIED marker inside the original Doctrine
transaction. The original result observer supplies the actual generated result
ID and COMPLETE state. The gateway requires the native transaction to have
finished before publishing media. A DB state it cannot read safely is
COMMIT_UNCERTAIN, not a fabricated rollback or commit.

## Media consistency and recovery

The native FileAttributeValueHandler moves attachments before SQL commit, and
the native Sylius uploader deletes/writes images during native events. Therefore
SQL rollback alone cannot recover those bytes.

During the approved call, MediaJournal records complete destination preimages
and stages each original write/delete/chmod. JournaledImageStorage.has observes
the overlay, so the original path generator and remove/write sequence remain
native. JournaledFilesystem preserves the original selected attachment
destination. Source downloads and native temporary files remain intact.

No destination publication occurs until APPLIED or COMPLETE survives the
database commit. After commit, the same operation compares the original
preimage, writes its retained after-image through the selected native backend,
reads the result back and records its actual outcome. A process loss after the
write can be reconciled by matching the original after-image. A conflicting
later destination is retained as an explicit conflict; it is not overwritten.

A post-commit media failure is MEDIA_PENDING. Retry reconciles the same journal
before the unchanged result-only recovery callback; it does not repeat the
native importer. A failure without the surviving commit marker leaves only
staged private bytes and NOT_COMMITTED. Earlier attempts remain in the journal.
Once a member is published, subsequent legitimate edits on the receiving host
are not reset by a repeated completed operation.

This is durable eventual publication after the native SQL commit, not an
atomic filesystem/database transaction. The operator must display native
APPLIED/COMPLETE and the separate gateway/media state. External writers must
not modify selected destinations during an explicitly commissioned import.
The journal detects differing preimages/readbacks but cannot make unrelated
remote storage clients participate in one cross-service transaction.

## Complete project export

exportProject returns [{path,blob}] with the exact Store descriptor
{sha256,bytes,path:"blobs/<sha256>"}. It includes all original source, check,
capture, apply, missing-dependency and media journals and every referenced
response/media/preimage blob. Host token/cache values and provider rate-limit
state are excluded.

The owner installs all declared blob bytes first, then calls importProject.
Every descriptor is verified before journal installation. Receiving is
create-only; exact replay reuses originals, and later same-binding receiving
attempts are preserved. Conflicting completed capture identities fail.
Source journal paths are portable under the receiving Store root; attachment
destinations are bound to stable handler IDs, then resolved through the target's
actual installed configuration.

The separate native full-project handover carries installed code, Composer
lock/vendor, the original database/queue and actual public/private storage.
It must also carry the entire private Store root so pending source/media
publication can resume on the explicitly bound target.
