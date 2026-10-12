# Complete collection handover from Python

The Python resource-review client can deliver a saved SF88 collection with every original file, receive it into an independent workspace, edit its annotations and members, and export a later revision. The Node collection archive, resource library and annotation writers remain the owners of those operations.

This lifecycle uses the same Python-owned native process as resource search and edition review. It adds no separate database, search index or archive format. Node 22.16 or newer is required by the original library; the ordinary Python package and checkout configuration are unchanged.

## Export a selected revision

Save a collection with the existing collection editor, CLI or SDK. Each selected member includes the actual resource ID, file SHA-256 and annotation revision; the current library validates that selection. Choose the returned positive collection revision before starting a portable export.

    from stellar_forge_buyer.review_library import ResourceLibrary

    with ResourceLibrary(checkout=checkout, state=author_state) as library:
        saved = library.collection(collection_id)
        transfer = library.export_collection(
            saved["id"], output_tar, revision=saved["revision"],
            transfer_directory=transfer_directory
        )
        archive_sha256 = transfer.sha256

Paths are absolute. The destination and transfer directory must be in the same filesystem, with a private parent directory as required by the original verified transfer. Retain the returned archive SHA-256, collection ID and revision with the handover.

The explicit revision makes a retry refer to the same original collection after another operator has saved a newer revision. The original file-transfer cursor verifies every downloaded chunk, resumes an interrupted transfer, rehashes the full result and publishes the completed destination without replacing a different file.

    python -m stellar_forge_buyer.review_cli \
      --checkout /absolute/checkout --state /private/author-library \
      collection export reading-selection --revision 3 \
      --out /private/delivery/reading-selection-r3.tar \
      --transfer-directory /private/delivery/reading-selection-r3-transfer

Use the actual revision returned by the library in place of the example revision.

## Inspect, receive and read independently

Inspection reads and verifies the complete original TAR, including manifest structure, original object sizes, file hashes and the full archive hash. It returns a compact summary so a large manifest does not exceed the native RPC frame. The complete manifest remains inside the unchanged archive.

    with ResourceLibrary(checkout=checkout, state=author_state) as library:
        inspected = library.inspect_collection(
            output_tar, expected_sha256=archive_sha256
        )

A receiving operator can receive and open the source in one native operation:

    with ResourceLibrary.from_collection(
        checkout=checkout,
        state=receiver_state,
        directory=received_directory,
        archive=output_tar,
        expected_sha256=archive_sha256,
    ) as receiver:
        receipt = receiver.collection_receipt
        current = receiver.status()
        resources = list(receiver.iter_resources())
        members = list(receiver.iter_collection_members(receipt["collectionId"]))

The receiving directory and state directory have private existing parents. Receipt creates the destination and publishes its original manifest only after every original file verifies. Use resume=True with the same archive and destination after an interrupted receipt. The retained intake manifest and full original file hashes determine whether that continuation is the same operation.

The receiving source contains its original manifest and original object files. The maintained library scans those files and adopts the collection once. Later opening the same state preserves local annotations and later local collection revisions.

    python -m stellar_forge_buyer.review_cli \
      --checkout /absolute/checkout --state /private/receiver-library \
      collection receive \
      --input /private/incoming/reading-selection-r3.tar \
      --sha256 ACTUAL_FULL_ARCHIVE_SHA256 \
      --out /private/received-reading-selection \
      --serve

The existing grayscale browser opens on this same native library. It retains its resource viewer, collection editor, file downloads and any composed edition-review features.

To inspect an archive before adopting it through the CLI:

    python -m stellar_forge_buyer.review_cli \
      --checkout /absolute/checkout --state /private/intake-library \
      collection inspect --input /private/incoming/reading-selection-r3.tar \
      --sha256 ACTUAL_FULL_ARCHIVE_SHA256

This opens the supplied library, or initializes its ordinary empty review-receiver source if it is new. It does not switch an existing library to the incoming source.

## Reopen and continue editing

    with ResourceLibrary.from_collection(
        checkout=checkout, state=receiver_state,
        directory=received_directory,
    ) as receiver:
        current = receiver.collection(collection_id)
        members = list(receiver.iter_collection_members(
            collection_id, revision=current["revision"]
        ))

The CLI can reopen directly into the original browser:

    python -m stellar_forge_buyer.review_cli \
      --checkout /absolute/checkout --state /private/receiver-library \
      collection open --directory /private/received-reading-selection --serve

For resource search, downloads, annotations, collection edits or an installed review extension, select that same received directory before the command:

    python -m stellar_forge_buyer.review_cli \
      --checkout /absolute/checkout --state /private/receiver-library \
      --received-collection /private/received-reading-selection \
      resources --all

Ordinary subsequent invocations that supply the existing state also reopen its already-bound source.

## Full members and identity after receiving

A collection keeps the full resource and annotation record at each immutable revision. The new members command streams those full original records without loading a large collection into a single RPC response:

    python -m stellar_forge_buyer.review_cli \
      --checkout /absolute/checkout --state /private/receiver-library \
      collection members reading-selection --revision 1 --all

Receiving creates a local resource ID tied to the received manifest and the original resource ID. The file SHA-256 remains the original file identity. The original collection and annotation revision are preserved in each received resource's origin:

| Field | Meaning |
| --- | --- |
| id | This receiving library's local resource identity |
| sha256 | Full original file SHA-256 |
| origin.manifestSha256 | Exact manifest from which this resource was received |
| origin.collectionId and origin.collectionRevision | Sending collection's selected revision |
| origin.resource | Complete sending resource, including its original ID and any earlier origin |
| origin.annotation | Sending annotation captured in that selected revision |
| annotation | Current receiving-library annotation, independently editable |

Do not match a passage or selection only by title or path. Resolve the saved original resource ID and full file SHA through this retained origin. A later received collection can carry an earlier origin as part of that full original record.

The local adopted collection begins at its own revision one. Its origin records preserve the sending collection's revision. These two revisions describe different editable libraries.

iter_collection_members pins the first native reply's actual revision and collection SHA for every following page. A later collection save cannot replace that traversal with a different selection.

## Export the edited collection

Use the original annotation and collection operations to make the desired edits. Annotation changes do not silently rewrite an earlier collection revision: save a new collection revision with the selected current annotation revisions, then export that actual revision.

    with ResourceLibrary.from_collection(
        checkout=checkout, state=receiver_state, directory=received_directory
    ) as receiver:
        current = receiver.collection(collection_id)
        selected = [
            {"id": resource["id"], "sha256": resource["sha256"],
             "annotationRevision": resource["annotation"]["revision"]}
            for resource in receiver.iter_resources()
        ]
        edited = receiver.save_collection(
            collection_id=collection_id,
            name=current["name"], note=current["note"],
            members=selected,
            expected_revision=current["revision"],
            operation_id=original_save_operation_id,
        )
        returned = receiver.export_collection(
            edited["id"], returned_tar, revision=edited["revision"],
            transfer_directory=returned_transfer_directory
        )

Retain the save operation ID for retries of that same edit. It belongs to the original collection writer and its request replay.

## API and native boundary

| Python operation | Maintained native operation |
| --- | --- |
| collection_members / iter_collection_members | collections.show of one immutable revision, paged full members |
| inspect_collection | inspectCollectionArchive |
| receive_collection | receiveCollection, keeping the current library open on its own source |
| ResourceLibrary.from_collection | receiveCollection when supplied, then openReceivedLibrary |
| export_collection | prepareCollectionDownload through the existing verified transfer |

Optional max_bytes values apply to the entire collection archive. Transfer chunk size, destination replay, cancellation and progress retain the existing Python file-transfer behavior. Inspection and receipt accept timeout and cancel_event; opening uses the existing ResourceLibrary constructor timeout.

The native open result exposes collectionReceipt for the actual receipt performed while opening. Reopening without a new archive returns no new receipt. The complete source manifest and files remain available in the received directory regardless of the compact runtime summary.
