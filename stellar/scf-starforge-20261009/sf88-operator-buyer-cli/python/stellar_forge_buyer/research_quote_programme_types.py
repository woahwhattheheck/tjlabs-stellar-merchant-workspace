"""Typed original programme, file and receiving records.

These declarations describe the installed Python bridge. Large step inputs,
CASE_RECORD packets and native operation bodies remain complete FileDelivery
sources instead of being duplicated into the control reply.
"""
from __future__ import annotations

from typing import Any, Literal, TypeAlias, TypedDict

from .research_quote_types import (
    QuoteObject, QuoteKind, QuoteStatus, QuoteCommand, QuoteCaseAction,
    QuotePricingAction, QuoteCaseSelection, QuoteBriefSelection,
    QuoteResponseSelection, QuotePublicationSelection, QuoteReportSelection,
    QuoteApplySelection, QuoteCaseTransferRequest, QuoteCaseTransferSource,
    QuoteOperation, QuoteNativeResponse, QuoteSourceWorkspace,
)

QuoteProgrammeCommand: TypeAlias = QuoteCommand
QuoteProgrammeCaseMode: TypeAlias = Literal["CREATE", "EXISTING"]
QuoteProgrammeStepStatus: TypeAlias = Literal["PENDING", "COMPLETE"]
QuoteProgrammeReceivingStatus: TypeAlias = Literal["PREPARING", "REVIEWED", "COMPLETE"]


class QuoteProgrammeInput(TypedDict):
    schema: Literal["sf88-research-quotation-programme/v1"]
    id: str
    name: str
    dossierId: str
    revision: int
    projectId: str
    caseId: str
    caseMode: QuoteProgrammeCaseMode


class QuoteProgrammeFile(TypedDict):
    name: str
    bytes: int
    sha256: str


class QuoteProgrammeLocalFile(QuoteProgrammeFile):
    path: str


class QuoteProgrammeInputFile(TypedDict):
    """Descriptor of a complete original retained step input."""
    path: str
    bytes: int
    sha256: str


class QuoteProgrammeHeader(TypedDict):
    schema: Literal["sf88-research-quotation-programme-retained/v1"]
    input: QuoteProgrammeInput
    inputSha256: str
    workspaceId: str
    casesWorkspaceId: str
    source: QuoteObject
    sourceSha256: str
    inputFile: QuoteProgrammeFile
    createdAt: str


class QuoteProgrammeCaseSelection(TypedDict):
    command: Literal["create-case"]
    input: QuoteCaseSelection


class QuoteProgrammeBriefSelection(TypedDict):
    command: Literal["prepare"]
    input: QuoteBriefSelection


class QuoteProgrammeApplySelection(TypedDict):
    command: Literal["apply", "enroll-publication", "apply-case-transfer"]
    input: QuoteApplySelection


class QuoteProgrammeTransferSelection(TypedDict):
    command: Literal["prepare-case-transfer"]
    # The native request is compact; inputFile carries the complete raw packet.
    input: QuoteCaseTransferRequest


class QuoteProgrammeResponseSelection(TypedDict):
    command: Literal["prepare-response"]
    input: QuoteResponseSelection


class QuoteProgrammePublicationSelection(TypedDict):
    command: Literal["prepare-publication"]
    input: QuotePublicationSelection


class QuoteProgrammeReportSelection(TypedDict):
    command: Literal["prepare-report"]
    input: QuoteReportSelection


class QuoteProgrammeNativeCaseSelection(TypedDict):
    command: Literal["native-case"]
    caseId: str
    action: QuoteCaseAction
    input: QuoteObject


class QuoteProgrammePricingSelection(TypedDict):
    command: Literal["pricing"]
    profile: str
    action: QuotePricingAction
    input: QuoteObject


QuoteProgrammeSelection: TypeAlias = (
    QuoteProgrammeCaseSelection | QuoteProgrammeBriefSelection |
    QuoteProgrammeApplySelection | QuoteProgrammeTransferSelection |
    QuoteProgrammeResponseSelection | QuoteProgrammePublicationSelection |
    QuoteProgrammeReportSelection | QuoteProgrammeNativeCaseSelection |
    QuoteProgrammePricingSelection
)


class QuoteProgrammeStepRecord(TypedDict):
    schema: Literal["sf88-research-quotation-programme-step/v1"]
    programmeId: str
    programmeSha256: str
    workspaceId: str
    stepId: str
    selection: QuoteProgrammeSelection
    selectionSha256: str
    source: QuoteObject
    sourceSha256: str
    replayOf: str | None
    inputFile: QuoteProgrammeFile
    createdAt: str


class QuoteProgrammeNext(TypedDict):
    command: Literal["apply", "enroll-publication", "apply-case-transfer"]
    input: QuoteApplySelection


class QuoteProgrammeStepSummary(TypedDict):
    stepId: str
    command: QuoteProgrammeCommand
    action: str | None
    profile: str | None
    selectionSha256: str
    sourceSha256: str
    replayOf: str | None
    createdAt: str
    status: QuoteProgrammeStepStatus
    nativeState: str | None
    requestId: str | None
    kind: QuoteKind | None
    resultSha256: str | None
    inputFile: QuoteProgrammeFile
    next: QuoteProgrammeNext | None


class QuoteProgrammeAttempt(TypedDict):
    name: str
    value: QuoteObject


class QuoteProgrammeNativeResult(TypedDict):
    schema: Literal["sf88-research-quote-operator-result/v1"]
    workspaceId: str
    requestSha256: str
    attemptId: str
    result: QuoteOperation | QuoteNativeResponse
    resultSha256: str
    completedAt: str


class QuoteProgrammeNativeRun(TypedDict):
    schema: Literal["sf88-research-quote-operator-inspected/v1"]
    directory: str
    request: QuoteObject
    selection: None
    original: QuoteObject | None
    attempts: list[QuoteProgrammeAttempt]
    result: QuoteProgrammeNativeResult | None


class QuoteProgrammeStep(TypedDict):
    schema: Literal["sf88-research-quotation-programme-step/v1"]
    directory: str
    workspaceId: str
    record: QuoteProgrammeStepRecord
    inputFile: QuoteProgrammeInputFile
    native: QuoteProgrammeNativeRun | None
    summary: QuoteProgrammeStepSummary


class QuoteProgrammeNativeState(TypedDict):
    schema: Literal["sf88-research-quotation-programme/v1"]
    directory: str
    programme: QuoteProgrammeHeader
    steps: list[QuoteProgrammeStepSummary]
    snapshot: str


class QuoteProgrammeState(QuoteProgrammeNativeState):
    workspaceId: str


class QuoteProgrammeCreated(TypedDict):
    schema: Literal["sf88-research-quotation-programme/v1"]
    directory: str
    workspaceId: str
    programme: QuoteProgrammeHeader
    reused: bool


class QuoteProgrammeHandoverInput(TypedDict):
    schema: Literal["sf88-research-quotation-handover-request/v1"]
    requestId: str
    programmeDirectory: str
    caseRevision: str
    deliveryId: str
    revision: int
    sourceWorkspace: QuoteSourceWorkspace | None
    # None freezes all completed original steps on the first capture.
    stepIds: list[str] | None


class QuoteProgrammeHandoverOperation(TypedDict):
    id: str
    kind: QuoteKind
    status: QuoteStatus
    requestSha256: str
    operationSha256: str
    publicationId: str | None
    name: str


class QuoteProgrammePublicationFile(QuoteProgrammeFile):
    part: Literal["publication", "handoff", "archive"]


class QuoteProgrammePublication(TypedDict):
    id: str
    name: str
    files: list[QuoteProgrammePublicationFile]


class QuoteProgrammeCustomerSelection(TypedDict):
    name: str
    manifestSha256: str
    manifestBytes: int
    selection: QuoteObject


class QuoteProgrammeHandoverSelection(TypedDict):
    programmeId: str
    programmeSha256: str
    workspaceId: str
    casesWorkspaceId: str
    caseId: str
    caseRevision: str
    dossierId: str
    projectId: str
    deliveryId: str
    revision: int
    stepIds: list[str]
    operations: list[QuoteProgrammeHandoverOperation]
    publications: list[QuoteProgrammePublication]
    caseRecord: QuoteProgrammeFile
    customer: QuoteProgrammeCustomerSelection


class QuoteProgrammeHandoverManifest(TypedDict):
    schema: Literal["sf88-research-quotation-handover/v1"]
    request: QuoteProgrammeHandoverInput
    requestSha256: str
    selection: QuoteProgrammeHandoverSelection
    createdAt: str
    files: list[QuoteProgrammeFile]


class QuoteProgrammeCaseInspection(TypedDict):
    schema: Literal["sf88-research-case-transfer/v1"]
    source: QuoteCaseTransferSource
    sha256: str


class QuoteProgrammeHandoverOperationFile(QuoteProgrammeHandoverOperation):
    """The complete operation is read through Handover.operation_export(id)."""
    directory: str
    files: list[QuoteObject]
    operationFile: QuoteProgrammeLocalFile


class _QuoteProgrammeHandoverRequired(TypedDict):
    schema: Literal["sf88-research-quotation-handover-inspected/v1"]
    directory: str
    workspaceId: str
    manifestSha256: str
    manifestBytes: int
    manifest: QuoteProgrammeHandoverManifest
    selection: QuoteProgrammeHandoverSelection
    files: list[QuoteProgrammeLocalFile]
    # This nested native state has no additional Python workspaceId wrapper.
    programme: QuoteProgrammeNativeState
    caseRecordFile: QuoteProgrammeLocalFile
    caseInspection: QuoteProgrammeCaseInspection
    customer: QuoteObject
    operations: list[QuoteProgrammeHandoverOperationFile]


class QuoteProgrammeHandover(_QuoteProgrammeHandoverRequired, total=False):
    operationDirectory: str
    reused: bool


class QuoteProgrammeVerifiedHandover(TypedDict):
    """Offline full manifest/member verification; no live host is consulted."""
    directory: str
    manifestSha256: str
    manifestBytes: int
    selection: QuoteProgrammeHandoverSelection
    files: list[QuoteProgrammeFile]


class QuoteProgrammeReceivingInput(TypedDict):
    schema: Literal["sf88-research-quotation-programme-receiving/v1"]
    requestId: str
    expectedWorkspaceId: str
    expectedCasesWorkspaceId: str
    expectedRevision: str | None
    sourceActor: str | None


class QuoteProgrammeReceivingRequest(TypedDict):
    schema: Literal["sf88-research-quotation-programme-receiving-request/v1"]
    input: QuoteProgrammeReceivingInput
    requestSha256: str
    source: QuoteProgrammeHandoverSelection
    sourceSha256: str
    manifestSha256: str
    inputFile: QuoteProgrammeFile
    createdAt: str


class QuoteProgrammeCaseTransferReview(TypedDict):
    id: str
    reviewSha256: str
    operation: QuoteOperation


class QuoteProgrammeReceivingReview(TypedDict):
    schema: Literal["sf88-research-quotation-programme-receiving-review/v1"]
    requestSha256: str
    manifestSha256: str
    source: QuoteProgrammeHandoverSelection
    workspaceId: str
    casesWorkspaceId: str
    caseTransfer: QuoteProgrammeCaseTransferReview
    customer: QuoteProgrammeCustomerSelection
    sourceActor: str | None
    createdAt: str
    reviewSha256: str


class QuoteProgrammeDestination(TypedDict):
    workspaceId: str
    casesWorkspaceId: str
    caseId: str
    caseRevision: str
    dossierId: str
    projectId: str
    deliveryId: str
    revision: int


class QuoteProgrammeReceivedRecord(TypedDict):
    schema: Literal["sf88-research-quotation-programme-received/v1"]
    requestSha256: str
    manifestSha256: str
    reviewSha256: str
    workspaceId: str
    casesWorkspaceId: str
    source: QuoteProgrammeHandoverSelection
    destination: QuoteProgrammeDestination
    case: QuoteObject
    caseTransfer: QuoteOperation
    customer: QuoteObject
    completedAt: str


class QuoteProgrammeReceived(QuoteProgrammeReceivedRecord):
    directory: str
    sourceDirectory: str
    reused: bool


class QuoteProgrammeReceivingSource(TypedDict):
    directory: str
    manifestSha256: str
    manifestBytes: int
    selection: QuoteProgrammeHandoverSelection
    files: list[QuoteProgrammeLocalFile]


class _QuoteProgrammeReceivingRequired(TypedDict):
    schema: Literal["sf88-research-quotation-programme-receiving/v1"]
    directory: str
    workspaceId: str
    status: QuoteProgrammeReceivingStatus
    request: QuoteProgrammeReceivingRequest
    review: QuoteProgrammeReceivingReview | None
    result: QuoteProgrammeReceivedRecord | None
    source: QuoteProgrammeReceivingSource


class QuoteProgrammeReceivingState(_QuoteProgrammeReceivingRequired, total=False):
    reused: bool


QuoteProgrammeResult: TypeAlias = (
    QuoteProgrammeCreated | QuoteProgrammeState | QuoteProgrammeStep |
    QuoteProgrammeHandover | QuoteProgrammeReceivingState | QuoteProgrammeReceived
)


class QuoteProgrammeSavedCall(TypedDict, total=False):
    """Original Python call journal, including an interrupted original attempt."""
    request: dict[str, Any]
    attempts: int
    completed: bool
    result: QuoteProgrammeResult
    attempt: dict[str, Any]
