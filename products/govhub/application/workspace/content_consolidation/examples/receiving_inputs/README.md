# Bind complete original receiving inputs

Use bind_inputs.py to turn a selected receiving recipe into an immutable case
file with exact original SHA-256 and byte counts. The tool reads complete existing
files under the original intake directory; the existing GovHub service still
parses their rows, retains them and compiles the native mapping.

~~~sh
python3 content_consolidation/examples/receiving_inputs/bind_inputs.py \
  --recipe "$SELECTED_RECIPE" --source-root "$GOVHUB_INPUTS" \
  --out "$NEW_RECEIVING_CASE"
~~~

Each stage.files entry contains name, path, source_label and category. Leave
sha256 and bytes absent or null when asking the binder to compute them. If either
is supplied, it must match the actual original file. An existing file_id must
already carry its original hash and size.

The binder preserves each original source observation, key encoding, mapping and
receiving instruction. It does not infer dates from file modification time,
contact upstream providers, edit records or choose destination fields.

## Complete recipe structure

The case is a JSON object with:

~~~json
{
  "schema": "govhub.content-consolidation.receiving-case.v1",
  "id": "selected-content-project",
  "family": {
    "family_id": "content-original-family-id"
  },
  "stages": [
    {
      "id": "first",
      "label": "Original complete editions",
      "files": [
        {
          "name": "one",
          "path": "first/feed-one.json",
          "source_label": "First original source",
          "category": "Extract"
        },
        {
          "name": "two",
          "path": "first/feed-two.json",
          "source_label": "Second original source",
          "category": "Extract"
        }
      ],
      "feeds": [
        {
          "name": "first_feed",
          "source_id": "first-feed",
          "label": "First original feed edition",
          "observed_at": "REPLACE_WITH_ORIGINAL_OBSERVATION_TIME",
          "format": "JSON",
          "record_keys": ["source_id"],
          "files": ["one"]
        },
        {
          "name": "second_feed",
          "source_id": "second-feed",
          "label": "Second original feed edition",
          "observed_at": "REPLACE_WITH_ORIGINAL_OBSERVATION_TIME",
          "format": "JSON",
          "record_keys": ["source_id"],
          "files": ["two"]
        }
      ],
      "mapping": {
        "migrations": [
          {
            "id": "govhub_selected_first",
            "edition_name": "first_feed",
            "source_ids": ["source_id"],
            "projection": {"title": "title"},
            "process": {"title": "title"},
            "destination": {
              "plugin": "entity:node",
              "default_bundle": "page"
            },
            "existing_target_policy": "CREATE_ONLY",
            "removal_policy": "RETAIN_TARGET"
          },
          {
            "id": "govhub_selected_second",
            "edition_name": "second_feed",
            "source_ids": ["source_id"],
            "projection": {"title": "title"},
            "process": {"title": "title"},
            "destination": {
              "plugin": "entity:node",
              "default_bundle": "page"
            },
            "existing_target_policy": "CREATE_ONLY",
            "removal_policy": "RETAIN_TARGET"
          }
        ],
        "files": [],
        "routes": []
      }
    },
    {
      "id": "corrected",
      "previous_stage": "first",
      "label": "Reviewed corrected source editions",
      "files": [
        {
          "name": "one",
          "path": "first/feed-one.json",
          "source_label": "First original source",
          "category": "Extract"
        },
        {
          "name": "two",
          "path": "corrected/feed-two.json",
          "source_label": "Corrected second original source",
          "category": "Extract"
        }
      ],
      "feeds": [
        {
          "name": "first_feed",
          "source_id": "first-feed",
          "label": "Retained unchanged first feed",
          "observed_at": "REPLACE_WITH_ORIGINAL_OBSERVATION_TIME",
          "format": "JSON",
          "record_keys": ["source_id"],
          "files": ["one"]
        },
        {
          "name": "second_feed",
          "source_id": "second-feed",
          "label": "Corrected second feed",
          "observed_at": "REPLACE_WITH_CORRECTED_SOURCE_OBSERVATION_TIME",
          "format": "JSON",
          "record_keys": ["source_id"],
          "files": ["two"]
        }
      ],
      "mapping": {
        "migrations": [
          {
            "id": "govhub_selected_first",
            "edition_name": "first_feed",
            "source_ids": ["source_id"],
            "projection": {"title": "title"},
            "process": {"title": "title"},
            "destination": {
              "plugin": "entity:node",
              "default_bundle": "page"
            },
            "existing_target_policy": "CREATE_ONLY",
            "removal_policy": "RETAIN_TARGET"
          },
          {
            "id": "govhub_selected_second",
            "edition_name": "second_feed",
            "source_ids": ["source_id"],
            "projection": {"title": "title"},
            "process": {"title": "title"},
            "destination": {
              "plugin": "entity:node",
              "default_bundle": "page",
              "overwrite_properties": ["title"]
            },
            "existing_target_policy": "REVIEWED_FIELD_UPDATE",
            "removal_policy": "RETAIN_TARGET"
          }
        ],
        "files": [],
        "routes": []
      }
    }
  ]
}
~~~

This structure demonstrates the actual case format. Select the real target,
timestamps, source paths, fields and complete mapping before binding it. Original
source IDs are strings in this example. Explicit decimal integer encoding and
composite keys are supported by the original parser.

For JSON:API input, select format JSON_API, records_pointer /data and each
original request URL:

~~~json
{
  "files": [
    {"file": "page_one", "request_url": "https://selected-source.example/api/items?page=1"},
    {"file": "page_two", "request_url": "https://selected-source.example/api/items?page=2"}
  ]
}
~~~

The original parser validates the actual native next-link chain. A partial page
set remains an actionable source issue.

Include full selected media in stage.files and reference its alias from the
native mapping:

~~~json
{
  "files": [
    {
      "file_name": "selected_document",
      "relative_path": "documents/original-document.pdf",
      "media_type": "application/pdf",
      "license": "The selected original document's license or transfer instruction",
      "source_url": "https://selected-source.example/original-document.pdf"
    }
  ]
}
~~~

Within the migration that owns each original source record, select the same
retained file through its ordered original key:

~~~json
{
  "file_bindings": [
    {"source_ids": ["ORIGINAL_DOCUMENT_KEY"], "file_name": "selected_document"}
  ]
}
~~~

The caller resolves the alias and the original compiler binds only the projected
native row to the retained bytes. The supplied feed does not need a private
application file ID. Include the same file in the mapping's top-level files
selection. Native file_copy receives the verified _govhub_source_path prepared by
the installed source plugin.

A stage may declare content_row_limit as a nonnegative integer. Zero is the
normal complete import; a positive value yields after that many native rows and
the original operation is resumed by its saved ID. Exact native rollback keys
may be declared as content_selection or selected through the execute command's
private selection file.

Keep full relationship and translation mappings in the same native definition.
Use installed Drupal process plugins and the original source-ID order. A required
migration_lookup should use no_stub true followed by skip_on_empty with method
row when the target's own field is optional; no_stub alone can return null. The
receiving workflow verifies those files after complete backup and independent
reopen; the native adapter retains actual entity and full file responses.

See [the full operator workflow](../../RECEIVING_WORKFLOW.md) for preparation,
review, native backup capture, corrected execution, same-operation recovery,
browser receiving and successor handover.
