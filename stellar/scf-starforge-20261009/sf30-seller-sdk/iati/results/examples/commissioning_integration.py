"""Examples for the existing IATI Results application.

All arguments are actual caller selections. This file creates no workspace,
journal, provider request, example customer record or default approval.
"""
from copy import deepcopy

from results.commissioning import (
    load_commissioning_bytes,
    new_commissioning_document,
    preview_commissioning,
    prepare_results_request,
    compare_commissioning,
)


def begin_programme(results, original_definition, selected_programme):
    """Return a draft pinned by the actual original Results preview."""
    return new_commissioning_document(
        results, deepcopy(original_definition), deepcopy(selected_programme)
    )


def inspect_selected_input(results, original_document_bytes, original_evidence_bytes):
    """Return the full review of the exact retained input and evidence.

    The caller's existing file store owns these complete immutable bytes.
    Retain the complete result and its sha256 for the actual staff decision.
    """
    document = load_commissioning_bytes(original_document_bytes)
    return preview_commissioning(
        results, document, evidence_files=original_evidence_bytes
    )


def prepare_reviewed_native_request(
    results, original_document_bytes, original_evidence_bytes, *,
    reviewed_preview_sha256, original_request_id,
    selected_project_id=None, selected_revision=None
):
    """Prepare an unchanged Results.save payload for an unissued selection.

    The application must persist the complete returned payload in its existing
    action journal before calling results.save. If a prior save was issued,
    replay that original retained payload first instead of calling this helper.
    """
    document = load_commissioning_bytes(original_document_bytes)
    return prepare_results_request(
        results, document, evidence_files=original_evidence_bytes,
        expected_preview_sha256=reviewed_preview_sha256,
        request_id=original_request_id,
        project_id=selected_project_id, expected_revision=selected_revision
    )


def compare_retained_reviews(original_preview, following_preview):
    """Keep every declared source/mapping/evidence difference for selection."""
    return compare_commissioning(original_preview, following_preview)
