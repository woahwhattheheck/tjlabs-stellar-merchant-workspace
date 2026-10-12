# Complete Grist source input

Use the actual Grist REST API from an existing authorized document. The reader supports a declared read credential or deliberately anonymous access to a publicly readable document. It does not create a Grist account, change sharing, write cells, copy documents, export the underlying database, or resolve referenced rows/attachments on the caller's behalf.

The exact site, document ID or URL ID, table ID, native membership filter, record order and field/type union form one immutable selection. A saved UI view is not a REST table selection. Fork/share/snapshot expressions and URL fragments are separate identities and are not inferred by this adapter.

## Source declaration

This is the shape; replace example table/column IDs and types with the actual discovery response:

~~~json
{
  "schema": "stellar-forge.grist-source.v1",
  "server": "https://public.getgrist.com",
  "apiVersion": "unversioned",
  "docId": "hik1whAV5snj",
  "tableId": "ACTUAL_TABLE_ID",
  "filter": null,
  "sourceOrder": [{"field":"id","direction":"asc"}],
  "connection": {
    "kind": "rest",
    "allowAnonymous": true,
    "maxPageBytes": 16777216,
    "maxCaptureBytes": 67108864,
    "maxRows": 1000000,
    "timeoutMs": 300000,
    "requestIntervalMs": 250
  },
  "queries": {
    "catalog": {
      "columns": {
        "record_id": {
          "source":"$recordId",
          "type":"string",
          "encoding":"identity-text",
          "nullable":false,
          "empty":"preserve"
        },
        "title": {
          "source":"ACTUAL_TEXT_COLUMN_ID",
          "providerType":"Text",
          "type":"string",
          "encoding":"native",
          "nullable":false,
          "empty":"preserve"
        }
      }
    }
  }
}
~~~

The API paths have no invented version segment. apiVersion is the literal unversioned. The server is an exact HTTP(S) origin and any fixed proxy prefix; URL credentials, query, fragment, encoded path separators and arbitrary endpoint overrides are rejected. Non-loopback plain HTTP requires the explicit allowHttp option.

For an existing private document, replace allowAnonymous with tokenEnv naming a configured host variable:

~~~json
{"kind":"rest","tokenEnv":"GRIST_READ_TOKEN"}
~~~

The value is read from the running host environment. The source file, browser, capture manifest and packet do not contain that value. A connection cannot declare both tokenEnv and allowAnonymous:true.

Read bounds are explicit. maxPageBytes bounds each full response, not a provider page size. The complete capture permits at most 256 MiB of raw resources and 1,000,000 records. No request is silently truncated to these bounds. A limit failure retains an incomplete attempt and cannot be declared a complete source.

## Actual discovery and capture

Discovery uses GET document, tables and columns through the same fixed-origin reader. A source may have queries:{} while discovering, but it still needs the actual original document and an intended table ID. The table listing is returned with discovery. To obtain an initial list before selecting a table, the authorized host may retain the real GET /api/docs/DOC_ID/tables response directly as provider acquisition context; it is not a completed capture.

~~~sh
node "$GRIST_SOURCE/cli.mjs" discover --source "$GRIST_REST_SOURCE"
~~~

Choose actual visible columns from that response. providerType must be the complete original type string, including a timezone or referenced table when present. Do not substitute a display label for a native column ID.

The native membership filter maps column IDs to nonempty arrays of accepted scalar values. Grist applies membership within each array and the selected columns together. This adapter supports strings, booleans, null and safe integers in filters. It does not accept free-form SQL, regular-expression execution, encoded cell objects or imprecise numeric filter literals.

~~~json
{"Status":["Published","Approved"],"Archived":[false]}
~~~

The source order uses actual column IDs and must end with id, the unique native row identity. Each direction is asc or desc. The reader emits Grist's actual sort parameter. The source does not allow hidden manualSort or gristHelper columns, nor does it reconstruct saved display options or UI-view filters.

Capture a new explicit observation:

~~~sh
node "$GRIST_SOURCE/cli.mjs" capture \
  --source "$GRIST_REST_SOURCE" --out "$GRIST_CAPTURE_DIRECTORY"
~~~

The eight retained steps are:

| Step | Actual fixed GET |
| --- | --- |
| document-before | /api/docs/DOC_ID |
| state-before | /api/docs/DOC_ID/states |
| table-before | /api/docs/DOC_ID/tables/TABLE_ID/columns |
| records | /api/docs/DOC_ID/tables/TABLE_ID/records?cellFormat=typed&sort=...&filter=... |
| records-after | The identical complete typed records request |
| table-after | The identical columns request |
| state-after | The identical states request |
| document-after | The identical document request |

The records request sends no limit, X-Limit, immediate or hidden option. The actual records route returns its complete API-visible table result in one response. A capture stores both full record response bodies, not a web rendering or a sampled extract.

Each body has exact bytes, SHA256, original request URL, receive time and an allowlist of safe response headers. Each successful request requires HTTP 200 and JSON content. The reader refuses redirects and does not retry errors automatically. Provider error response bodies and credential headers are not copied into public logs.

The capture checks:

- Every retained row has a unique positive native numeric ID.
- Every selected field is present and retains its declared native type in the visible column metadata.
- Returned user fields belong to that metadata. A missing selected field is not guessed to be null.
- The complete original records bytes are identical in the two reads.
- The visible column metadata SHA is unchanged.
- The native document metadata still names the same document.
- The first actual history state has the same action number n and hash h before and after.
- The observed source meets the declared byte/row bounds.

The states endpoint supplies retained recent history; history can be pruned. The capture uses its observed head, not a claim to all historical revisions. An empty states response cannot establish a document head and the capture fails clearly.

Only after these checks and validation of every selected projected cell does capture.json become complete. The manifest has complete:true, documentStateVerified:true, repeatReadVerified:true, countVerified:false and atomicSourceSnapshot:false. pageCount:1 describes the primary complete records response; resources retains both copies and all six surrounding responses.

There is no independent count endpoint in this contract. The observed row count comes from the actual complete records array. Access rules may omit rows or columns for the selected account. Formula changes or concurrent updates may cause a conservative mismatch even when an operator regards the display as equivalent. Preserve those bytes and deliberately choose another observation.

## Typed values and precision

Raw API bodies are retained before JSON values are interpreted. Node.js 24 JSON.parse source context preserves every numeric token as a GristNumber object with its exact text. Public projection never silently rounds a numeric ID, integer, decimal or timestamp.

Grist's typed response is an API representation. It already reencodes several native database values. In particular, native null list cells may be returned as empty encoded lists. The capture preserves those API bytes and does not claim to recover the prior raw database null.

| Grist value | Public choice | Rule |
| --- | --- | --- |
| Native row ID | identity-text | Exact numeric ID as a string; never inferred from a label. |
| Text or Choice | native string | Preserve alternate strings and emptiness according to explicit null policy. |
| Bool | native boolean | Strings such as "true" are not coerced. |
| Int or Numeric | number-text | Preserve the exact original JSON number lexeme. |
| Native JSON number | native integer/number | Allowed only after exact finite/safe decimal round-trip validation. |
| Date tuple ["d",seconds] | epoch-seconds-text | Preserve its numeric seconds token. No ISO/calendar conversion is inferred. |
| DateTime tuple ["D",seconds,timezone] | epoch-seconds-text | Preserve seconds and validate the original timezone against the complete declared type. |
| Ref tuple ["R",table,row] | reference-id-text | Preserve the native row ID, including 0 as the original empty-reference semantics. No referenced name lookup. |
| ChoiceList ["L",...] | typed-json string | Retain the complete encoded list. |
| RefList/Attachments ["r",table,ids] | typed-json string | Retain original IDs. Attachment IDs are not downloaded file bytes. |
| Any or mixed/alternate values | typed-json string | Retain an explicitly reviewed supported typed representation recursively. |

Selected error, censored, pending, skipped, unserializable, conflicting and unknown codes are rejected. This rule recurses through encoded objects and lists; a nested exception is not converted to a harmless string or null. Reference lookup/write-only codes are rejected. Raw responses remain retained privately for diagnosis.

Alternative text in a Numeric, Date or Ref column is a native Grist value. Number/date/reference encodings reject it; select an explicit typed-json representation or omit the field in a new selected source. Do not coerce it into zero, a guessed date, or a reference name.

A native null requires nullable:true. Converting an empty string into null additionally requires empty:"null". The original dataset CSV uses an empty field for null: nullable Text with empty:"preserve" therefore fails the original DATASET_EMPTY_NULL_CONFLICT check. Choose a non-nullable string to preserve empty strings, or explicitly convert empties to null.

## Interrupted requests

The capture directory has an original permanent kernel lease, selection/read-bound intent, exact step receipts and private credential fingerprint. Only its current writer may advance it.

~~~sh
node "$GRIST_SOURCE/cli.mjs" attempt --capture "$GRIST_CAPTURE_DIRECTORY"
node "$GRIST_SOURCE/cli.mjs" capture \
  --source "$GRIST_REST_SOURCE" --out "$GRIST_CAPTURE_DIRECTORY" --resume
~~~

Resume uses the same directory and exact source/read bounds. It validates a fully written matching staged body and receipt before any new GET, then adopts that original result. It never replaces a conflicting retained member.

A changed credential cannot continue a partial capture under the previous authority. If the source account changes, keep the old attempt and explicitly begin a new one. A completed verified capture may reopen without a currently available token because reopening makes no network request.

Source/schema/document/head/records changes, duplicate IDs and changed authority require a fresh observation. Timeout, cancellation, provider 429, transport loss and interrupted writes may resume the same original step journal when the source remains consistent. Honor the actual retry-after response and correct the original connection before retrying; the product does not loop requests.

If a request returned a body but stopped before any complete durable receipt, an explicit resume can repeat that read. It is read-only, and the final surrounding comparisons still govern acceptance. A retained complete matching receipt is always reused.

## Freeze and transfer complete source

Freeze the exact capture into an original source declaration:

~~~sh
node "$GRIST_SOURCE/cli.mjs" freeze \
  --source "$GRIST_REST_SOURCE" \
  --capture "$GRIST_CAPTURE_DIRECTORY/capture.json" \
  --out "$GRIST_FROZEN_SOURCE"
~~~

The resulting connection is kind:capture with the original manifest path and SHA256. It retains the selected source and projection. This is private merchant state.

For transport, use the provider's complete capture packet, or the authoring source packet which additionally includes the original query map:

~~~sh
node "$GRIST_SOURCE/cli.mjs" packet-export \
  --capture "$GRIST_CAPTURE_DIRECTORY/capture.json" \
  --out "$GRIST_CAPTURE_PACKET"

node "$GRIST_SOURCE/workspace/cli.mjs" packet \
  --source "$GRIST_FROZEN_SOURCE" --out "$GRIST_SOURCE_PACKET"
~~~

The packet includes the exact manifest bytes and all eight raw response bodies, verified by path, size and digest. Import validates the whole packet before publishing a complete destination and copies only exact members into a new directory. --resume permits only the same complete or matching partial original bytes; it never replaces another capture.

~~~sh
node "$GRIST_SOURCE/cli.mjs" packet-import \
  --source "$GRIST_REST_SOURCE" --packet "$GRIST_CAPTURE_PACKET" \
  --out "$GRIST_IMPORTED_CAPTURE"
~~~

Do not transplant an absolute original capture path by editing an old declaration and keeping its old hash. Use these original receiving APIs to create the new binding and retain both identities.

## Official public Task Management acquisition

The [official example page](https://support.getgrist.com/examples/2021-01-tasks/) identifies the public document URL ID hik1whAV5snj. The initial actual tables endpoint is:

https://public.getgrist.com/api/docs/hik1whAV5snj/tables

This is an acquisition candidate, not a supplied fixture. The operator must obtain and retain the real table listing, choose an actual user table and fields, then execute the original discovery/capture/freeze flow above. Select allowAnonymous:true. If the document is no longer public or the response is unavailable, retain its actual HTTP failure; do not substitute a mocked result.

The coordinated operation is SCF-GRIST-PUBLIC-SOURCE-20261012-14F5. Its owner retains all actual provider files and supplies the resulting source declaration, manifest SHA, row count, document state and complete source packet to the one product receiving continuation. The later browser/publisher/release/Applications/MCP flow consumes that same complete capture without recapturing or submitting a payment.
