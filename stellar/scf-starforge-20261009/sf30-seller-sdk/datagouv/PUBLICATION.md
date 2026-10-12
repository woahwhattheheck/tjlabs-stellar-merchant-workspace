# Native data.gouv.fr draft and publication

This module connects the saved publisher workspace to the original data.gouv.fr API. It uses Node 24 standard-library APIs and has no server, background worker, scheduler or import-time network activity. The application owns persistence, explicit operator actions and the API credential's environment. The module does not execute any writes merely because a source file or workspace is opened.

## The operator contract

A selected input creates one durable operation. Saving that operation creates or updates a **private dataset**, then saves each selected hosted file or remote resource. Review binds the complete native dataset and resource projection to a SHA-256. Publication is a separate explicit action naming that review. It sends the sole private:false mutation and requires an authenticated native readback followed by an anonymous readback of the same exact public projection.

Every dataset create and draft update explicitly includes private:true. A selected existing public dataset therefore becomes private when Save draft is executed. Show that actual effect before the operator saves. This module never uses an implicit draft update as a publication shortcut.

The selected organization and any existing dataset/resource IDs must be original native IDs, not display labels or slugs. The module does not create an organization, change organization membership, create credentials, delete datasets/resources, or restore deleted/archived objects.

## Files

- datagouv-publication.mjs: complete reusable implementation.
- draft-input.example.json: exact input structure with visibly marked example metadata and placeholder native organization ID.
- publication-input.schema.json: the module's exported preparation schema.
- PUBLICATION.md: this guide.
- SOURCE_MANIFEST.json: exact source identities and verification disposition.

The JSON example is not authorization to write to its placeholder organization. Replace it with the actual user-selected organization and retained input file. No Datactivist credential or organization write has been used to create this source.

## Host integration and private persistence

Import the named factory:

    import { createDataGouvPublisher, PublicationError, publicationInputSchema }
      from './datagouv-publication.mjs';

    const publisher = createDataGouvPublisher({
      loadOperation: async id => workspace.loadRemoteOperation(id),
      saveOperation: async (id, next, expectedRevision) =>
        workspace.compareAndSaveRemoteOperation(id, next, expectedRevision),
      tokenEnv: 'DATAGOUV_API_KEY',
      apiBase: 'https://www.data.gouv.fr/api/1/',
    });

loadOperation returns null or the complete original saved JSON object, including its revision.

saveOperation must atomically compare the original stored revision, commit the complete next object, and return exactly true on success or false on conflict. For the first insert expectedRevision is null and next.revision is 0. Subsequent writes use expectedRevision 0,1,2,... and next.revision one higher. The host must not acknowledge a write before its durable transaction commits. A conflict produces operation_revision_conflict and no dependent API write.

The module serializes calls to one operation within the same process. The host's durable CAS is also required across processes. The dispatching state is saved before the first network byte; a second caller that encounters that state performs a readback and cannot submit another mutation. The host should keep one explicit action active per operation and show its saved state.

Store the operation journal in the existing private workspace database and include it in that workspace's supported backup/restore. It contains selected local paths, private dataset metadata, native responses, original IDs, all attempt times and explicit review notes. It contains no file body and no credential. Export public operating evidence separately from the private journal.

DATAGOUV_API_KEY is read from the process environment for each authenticated request. It is never a method argument, an HTTP UI input, a saved operation field or an exported example. No authenticated redirect is followed. The API base is fixed by trusted host configuration; do not accept a replacement API base from an untrusted import. API keys, authorization values, account token fields and the actual credential string are excluded from retained responses/state.

## Exact public methods

All methods take one object argument.

| Method | Input | Result |
| --- | --- | --- |
| prepareDraft | operationId, organizationId, optional datasetId, dataset metadata, resources | operation, inputSchema, reused |
| saveDraft | operationId, optional filePaths mapping, optional retryRejected step-key list | operation, draft |
| reviewDraft | operationId, reviewer, note, decision, expectedDraftSha256 | operation, review, reused |
| publish | operationId, reviewId, optional retryRejected boolean | operation, publication, complete |
| reconcile | operationId, optional exact datasetId, optional resourceIds mapping | operation and unresolved/reconciled lists; completed publication returns publication/complete |
| inspect | operationId, optional refresh boolean | operation, with a draft, observation or publication when requested |
| locateDrafts | operationId, optional page and pageSize | operation, one page's candidates, native pagination and response identity |
| inspectAccess | organizationId | minimal native user/organization/membership/permission observations |

publicationInputSchema() returns the exact JSON preparation schema without I/O.

prepareDraft saves the selected intent and hashes each original file. It does not call the data.gouv.fr API. Reusing the same operation ID with a changed selection fails. A new absolute file path for identical retained file bytes is allowed through saveDraft.filePaths; it does not alter the original request or selected SHA.

saveDraft is an explicit provider mutation. It can finish an interrupted multi-resource save without repeating a completed native step. A saved dataset/resource ID comes only from a retained native response or a conclusive original-ID readback. It never invents an ID.

reviewDraft requires decision approved or needs_changes, an explicit reviewer and note, and the exact operation.draft.sha256 displayed to that reviewer. It reads the native draft again. A stale review fails before it can be recorded. The most recent review controls publication; an older approval cannot override a later needs_changes decision. The module records the reviewer as operator-supplied provenance; it does not manufacture independent review.

publish requires the returned review.id of the current approved review. It rereads the entire native projection and compares its hash immediately before dispatch. A local review or a Prepare button alone does not publish. A native publication followed by an unavailable anonymous read yields complete:false and published_readback_pending. The next explicit inspect/reconcile can finish that readback without another PUT. The first successful anonymous readback seals the original publication receipt. Later inspect({operationId, refresh:true}) calls append separate current observations and return current_matches_reviewed; they never replace that completed receipt. complete describes the original publication's completion, while current_matches_reviewed describes only the new observation. A completed publish/reconcile replay reuses the sealed receipt without another network call; inspect without refresh also remains local.

inspect with refresh:false is local-only. refresh:true reads the original native object; it can update the displayed draft after a change and require a new review. It does not resend a mutation.

locateDrafts reads exactly one native organization dataset page. The response retains nextPage/previousPage/total as returned by the API. It does not automatically crawl all pages. Incomplete membership visibility or an empty page does not prove that an uncertain create failed.

reconcile performs provider reads only. It can bind an explicitly selected original dataset/resource ID after comparing organization, operation marker, exact metadata and selected bytes. It cannot be used to execute an unissued request. Pending unsent steps remain visible and require an explicit Save draft or Publish action.

## Preparation input

Use the complete input schema returned by prepareDraft or publicationInputSchema. Required top-level keys are operationId, organizationId, dataset and resources. datasetId is optional for creating a new draft.

Required dataset values are title, description and license. Optional native fields are description_short, acronym, frequency, frequency_date, temporal_coverage, spatial, tags, extras, contact_points, access_type, access_audiences, authorization_request_url, access_type_reason_category and access_type_reason.

Do not include private in the input dataset object. The module owns the draft/publication visibility transition. Unsupported fields fail rather than being silently ignored.

Each resource needs a stable key, mode and metadata. The key uses letters, digits, dot, underscore or hyphen. Resource metadata requires title, type and lowercase format. Native types are main, documentation, update, api, code and other. Optional metadata is description, mime, schema and extras.

For a hosted file:

    {
      "key": "selected-csv",
      "mode": "file",
      "metadata": {
        "title": "Selected source edition",
        "description": "The exact reviewed edition and its collection limitations.",
        "type": "main",
        "format": "csv",
        "mime": "text/csv"
      },
      "file": {
        "path": "/absolute/retained/selected.csv",
        "filename": "selected.csv"
      }
    }

file.bytes and file.sha256 may pin a previously retained source. The module independently reads the full selected bytes, checks a stable file identity, computes SHA-1 and SHA-256, and validates any supplied pin. The configured default maximum is 250 MiB; this is a host limit, not a claim about the provider's current limit.

For an external resource:

    {
      "key": "selected-remote",
      "mode": "remote",
      "metadata": {
        "title": "Original agency resource",
        "type": "main",
        "format": "csv"
      },
      "url": "https://agency.example/public/selected.csv",
      "checksum": {
        "type": "sha256",
        "value": "REPLACE_WITH_THE_ACTUAL_DECLARED_64_HEX_DIGEST"
      },
      "filesize": 1515512
    }

The remote URL must be HTTP(S), with no user information or fragment. checksum/filesize are optional declarations. Remote resources are not downloaded or independently hashed by this module. Keep a separately retained source-capture receipt if the application needs to substantiate those declarations. Do not imply that creating a remote link freezes the external site's future bytes.

A resourceId selects an existing native UUID and requires an existing datasetId. The module verifies it belongs to that dataset. The native API does not convert a hosted file into a remote resource or vice versa. Select a new resource if the route changes.

## Native routes and actual effects

| Operation | Native route | Body/effect |
| --- | --- | --- |
| Access | GET me/ and GET organizations/:id/ | Minimal identity/permission observation; complete /me response is not persisted |
| Create private draft | POST datasets/ | Selected metadata, exact organization, operation marker, private:true |
| Update private draft | PUT datasets/:id/ | Retained exact metadata body, original organization, private:true |
| New hosted resource | POST datasets/:id/upload/ | Multipart file; API creates native URL, size, checksum and resource UUID |
| Replace hosted bytes | POST datasets/:id/resources/:uuid/upload/ | Replaces the original resource's bytes and deletes the prior hosted storage file |
| New remote resource | POST datasets/:id/resources/ | Native resource JSON, filetype:remote and selected URL |
| Update resource metadata | PUT datasets/:id/resources/:uuid/ | Original resource type/URL, selected metadata and original operation marker |
| Explicit publication | PUT datasets/:id/ | Exact reviewed metadata with private:false |
| Readback | GET datasets/:id/ | Authenticated draft/public state and then anonymous public state |

Hosted metadata updates preserve the native URL, checksum and size. They do not manufacture those values from local assumptions. The original file is read as a file-backed immutable Blob, and that exact Blob is hashed against the retained selected SHA before upload. No complete upload body is copied into the operation journal.

A hosted filename includes a stable operation/key suffix. This lets a lost native create response be reconciled against a newly created resource with that exact unique filename and server checksum/length. The original selected filename remains in the journal. The subsequent metadata update sets the reviewed display title. No original file content is rewritten.

Replacing hosted bytes has no automatic remote rollback. Preserve the original source and the prior workspace/export when rollback custody is required. Dataset draft visibility does not make a hosted URL an encrypted storage boundary; use the platform's documented access behavior.

## Interrupted work and rate limits

Every step retains its exact method/path/body or file identity before dispatch, then the full sanitized native response before a dependent ID or mutation. Its states distinguish prepared, dispatching, response_received, verified, rejected and uncertain.

A lost response to a create is an uncertainty barrier. A retry can read the original object, locate candidates by the operation marker, or reconcile an explicitly selected exact ID. It cannot repeat the POST merely because a result file, local ID or search hit is missing.

For a new dataset with a missing create response:
1. Inspect the saved operation.
2. Read selected organization pages with locateDrafts, or use an original ID from the native data.gouv.fr account.
3. Reconcile the exact candidate with reconcile({operationId,datasetId}).
4. Continue the same Save draft action only after the original dataset is verified.

Hosted-file candidates must have the expected new resource ID boundary, stable original upload filename, exact byte length and native SHA-1/SHA-256. More than one matching candidate remains unresolved. Remote-resource candidates must carry the complete original operation/selection/resource marker and match the intended body. Existing resources stay bound to their original UUID.

A definitive native 4xx rejection is retained. Failed reads, including prerequisite account/dataset reads and anonymous publication reads within an operation, are also saved before the caller throws or continues reconciliation. The module honors Retry-After/reset deadlines from all retained read and write responses before further operation-network work. The relative deadline is anchored to the original response observation. It never shifts the deadline to a later retry time. Legacy last_reconciliation and public_readback responses remain part of this deadline check. The standalone inspectAccess({organizationId}) call has no operation journal; its returned error retains the actual response/deadline for its caller, and it never retries automatically.

An operator can explicitly retry a rejected Save draft step by passing its exact step key in retryRejected after correcting the external condition. An operator can explicitly retry a definitively rejected publication using publish.retryRejected:true. Status-less results, 5xx, 408 and 409 remain uncertain and cannot be turned into a blind retry. There is no retry timer or automatic redispatch.

Before an existing-object retry, the module rereads the original preimage. A different current object stops the write. Its staged exact request cannot be silently rebased onto someone else's later changes.

## Review scope and limitations

The review hash covers original dataset/organization IDs, private/deleted/archived state, editable metadata, and the ordered full resource projection including unselected resources. It excludes volatile metrics, permissions and update timestamps. Extras are retained, including automatic analysis results; if those change the reviewed projection, refresh and review the actual current draft.

The API source inspected for this module does not establish an atomic provider-side compare-and-swap or client idempotency key. This implementation provides local durable CAS and fresh native precondition/readback checks. A separate external writer can still change an object between a GET and a PUT. A mismatched postimage remains explicitly unresolved; the module does not claim isolation it cannot provide.

Permissions are evaluated by the original provider. inspectAccess exposes original observations and the write responses are authoritative. A member role alone is not advertised as an editing grant. A native dataset edit:false or edit_resources:false stops a selected write; no group membership or alternate actor is invented.

This source was prepared and syntax-reviewed without executing a data.gouv.fr write. The enclosing workspace's receiving run must report its actual saved draft, review, publication and readback outcomes separately. A source merge or local prepared intent is not native publication evidence.

## Official source contract

Inspected 12 October 2026:

- Official API guide: https://guides.data.gouv.fr/api-de-data.gouv.fr/prise-en-main/gerer-un-jeu-de-donnees-par-lapi
- Native OpenAPI description: https://www.data.gouv.fr/api/1/swagger.json
- Original implementation: https://github.com/opendatateam/udata
- dataset/api.py blob 053881d74c5cf3d3cd90f529568e95a32db647ef
- dataset/forms.py blob 130de75a414545f38135b47ec9cd2a0d1652f27f
- dataset/permissions.py blob 595c8138ada870d585dd934a7d5500f331c9f311
- organization/api.py blob 5159ff13db58422391c7eef3843361ca6276139f

The guide explicitly requires private:true for draft API changes. The implementation confirms that new resource JSON creation is for remote URLs, hosted files use upload endpoints, file replacement deletes the prior storage file, and the native permission checks remain authoritative.

## Native upload naming and completed receipt recovery

The inspected native storage handler lowercases and slugifies multipart filenames. Newly prepared hosted-file requests therefore use a deterministic resource-<operation/key digest> basename with an optional strictly lowercase alphanumeric extension. The original human filename remains in the private selected-file journal. The module does not emulate arbitrary filename normalization or infer a new upload from checksum alone. Existing original IDs remain preferred; an older selection, a backend-renamed basename or ambiguous candidates requires the exact native resource ID through reconcile. No uncertain POST is repeated.

This boundary is grounded in opendatateam/udata core/storages/api.py blob 60d0b960413021b5d9976f093cf9010034ff45fd and core/storages/utils.py blob 4302d6b54e53e4cad88eee424a5f9b773ec7b316. The single-file handler normalizes the multipart file's name, then reports the actual stored basename, measured size and SHA1. The dataset upload handler uses that basename as its initial resource title. The later resource metadata PUT supplies the explicitly selected display title.
