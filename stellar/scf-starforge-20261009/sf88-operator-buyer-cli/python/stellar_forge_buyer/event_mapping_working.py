"""Complete read-only Event mapping source package for its original private operator."""
from pathlib import Path

from .errors import StateError

SCHEMA = "stellar-forge.event-mapping-source-pair.v1"
MAXIMUM = 192 * 1024 * 1024


def source_package(manager, programme, input_id, mapping, expected):
    from .event_programmes import need, raw, LIMITS
    from .event_feed_analysis import regular, sha

    need(isinstance(expected, dict) and set(expected) == {
        "comparison_sha256", "programme_revision", "baseline_operation_id", "receiver"
    }, "MAPPING_SOURCE_SELECTION_REQUIRED")
    comparison = manager._compare_mapping(programme, input_id, mapping)
    need(all(comparison[key] == expected[key] for key in expected),
         "MAPPING_SOURCE_COMPARISON_CHANGED")
    core = manager._core(programme)
    baseline = core.programme()
    accepted = baseline["accepted"]
    need(accepted is not None and baseline["revision"] == comparison["programme_revision"]
         and accepted["operation_id"] == comparison["baseline_operation_id"],
         "MAPPING_SOURCE_BASELINE_CHANGED")
    previous_paths = core.source_paths(accepted)
    previous = {kind: (Path(path).name, regular(path, LIMITS[kind]))
                for kind, path in zip(("ndjson", "manifest"), previous_paths)}
    current_bytes = manager._originals(input_id)
    with manager.database._connection(readonly=True) as db:
        received = manager._input(db, input_id)
    current = {kind: (received["files"][kind]["name"], content)
               for kind, content in current_bytes.items()}
    files = {}
    for side, selected in (("previous", previous), ("current", current)):
        files[side] = {}
        for kind, (label, content) in selected.items():
            identity = {"bytes": len(content), "sha256": sha(content)}
            need(identity == comparison[side]["original_files"][kind],
                 "MAPPING_SOURCE_ORIGINAL_CHANGED")
            try:
                text = content.decode("utf-8", errors="strict")
            except UnicodeDecodeError:
                raise StateError("EVENT_PROGRAMME_MAPPING_SOURCE_UTF8_REQUIRED") from None
            files[side][kind] = {"name": label, **identity, "text": text}
    source_cli = manager.source_cli.resolve(strict=True)
    source_core = source_cli.with_name("analysis-source.mjs")
    need({"cli_sha256": sha(regular(source_cli)),
          "core_sha256": sha(regular(source_core))} == comparison["receiver"],
         "MAPPING_SOURCE_RECEIVER_CHANGED")
    need(core.programme()["revision"] == baseline["revision"],
         "MAPPING_SOURCE_BASELINE_CHANGED")
    result = {"schema": SCHEMA, "comparison": comparison, "files": files}
    need(len(raw(result).encode("utf-8")) <= MAXIMUM, "MAPPING_SOURCE_COMPLETE_PACKAGE_TOO_LARGE")
    return result
