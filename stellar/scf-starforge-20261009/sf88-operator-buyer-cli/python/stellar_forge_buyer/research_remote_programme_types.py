"""Types for the installed, file-backed remote Research programme SDK.

These annotations describe the original engine's records. They do not create a
second journal, validate a replacement protocol or turn a retained read into a
fresh host observation. Python 3.10+; all imports are standard library except the
existing FileDelivery class.
"""
from __future__ import annotations

from os import PathLike
from threading import Event
from typing import Any, BinaryIO, Dict, List, Literal, Mapping, Optional, Protocol, TypedDict, Union

from .result import FileDelivery

JSONValue = Union[None, bool, int, float, str, List["JSONValue"], Dict[str, "JSONValue"]]
JSONObject = Dict[str, JSONValue]
PathSelection = Union[str, PathLike[str]]
RemoteCommand = Literal[
    "info", "jobs", "job", "resume", "state", "step", "submit", "receiving",
    "bundle", "files", "file_info", "retain", "retained", "read", "release",
    "archive", "upload", "upload_source", "transfer", "transfer_status", "export",
]
ProgrammeJobKind = Literal[
    "CREATE", "SUBMIT", "APPLY", "REPLAY", "EXPORT", "IMPORT", "ARCHIVE",
    "RECEIVE_REVIEW", "RECEIVE",
]
ProgrammeJobStatus = Literal["READY", "RUNNING", "RETRY_REQUIRED", "COMPLETE"]
ProgrammeFileKind = Literal["JOB", "BUNDLE", "ARCHIVE"]


class RemoteWorkspaceSelection(TypedDict):
    id: str
    connectionFile: str
    workspaceId: str


class RemoteSourceSelection(TypedDict):
    id: str
    kind: Literal["programme-input", "programme-archive"]
    file: str
    sha256: str


class RemoteOperatorConfiguration(TypedDict):
    schema: Literal["stellar-forge.research-programme-operator.v1"]
    directory: str
    workspaces: List[RemoteWorkspaceSelection]
    sources: List[RemoteSourceSelection]


class RemoteFileDescriptor(TypedDict):
    """One complete immutable file; SHA256 covers every byte."""
    path: str
    bytes: int
    sha256: str


class RemoteArgumentSelection(RemoteFileDescriptor):
    source: Optional[str]


class RemoteConfigurationSelection(TypedDict):
    schema: Literal["stellar-forge.research-remote-python.v1"]
    source: str
    file: str
    bytes: int
    sha256: str


class RemoteConfigurationView(RemoteConfigurationSelection):
    configuration: RemoteOperatorConfiguration


class RemoteCallRequest(TypedDict):
    schema: Literal["stellar-forge.research-remote-python.v1"]
    callId: str
    workspace: str
    workspaceId: str
    command: RemoteCommand
    arguments: RemoteArgumentSelection
    configurationSha256: str
    file: Optional[str]
    replayOf: Optional[str]


class RemoteAttemptRequired(TypedDict):
    returncode: Optional[int]
    runtimeError: Optional[str]
    processStarted: bool
    outcomeUnknown: bool
    native: Optional[JSONObject]
    finishedAt: str


class RemoteAttempt(RemoteAttemptRequired, total=False):
    interrupted: bool


class RemoteCompletion(TypedDict):
    schema: Literal["stellar-forge.research-remote-python.v1"]
    requestSha256: str
    workspaceId: str
    file: RemoteFileDescriptor
    exportedFile: Optional[RemoteFileDescriptor]
    completedAt: str


class RemoteResultRequired(TypedDict):
    request: RemoteCallRequest
    result: RemoteCompletion


class RemoteResultRecord(RemoteResultRequired, total=False):
    """Attempt can report a later output/cleanup failure despite a saved reply."""
    attempt: RemoteAttempt


class RemoteCallSummary(TypedDict):
    callId: str
    workspace: str
    workspaceId: str
    command: RemoteCommand
    replayOf: Optional[str]
    completed: bool


class RemoteCallPage(TypedDict):
    items: List[RemoteCallSummary]
    total: int
    nextOffset: Optional[int]


class RemoteJobArguments(TypedDict):
    id: str


class RemotePageArguments(TypedDict, total=False):
    offset: int
    limit: int
    snapshot: str


class RemoteJobsArguments(RemotePageArguments, total=False):
    kind: ProgrammeJobKind


class RemoteStateArguments(RemotePageArguments):
    programmeId: str


class RemoteStepArguments(TypedDict):
    programmeId: str
    stepId: str


class RemoteBundleArguments(TypedDict):
    id: str


class RemotePinnedBundleArguments(RemoteBundleArguments, total=False):
    manifestSha256: str


class RemoteBundleFilesArguments(RemotePageArguments):
    id: str


class RemoteFileIdentityRequired(TypedDict):
    kind: ProgrammeFileKind
    id: str


class RemoteFileIdentity(RemoteFileIdentityRequired, total=False):
    # Required for JOB/BUNDLE; absent for ARCHIVE.
    name: str


class RemoteFileSelection(RemoteFileIdentity):
    bytes: int
    sha256: str


class RemoteReaderArguments(TypedDict):
    exportId: str


class RemoteReadArguments(RemoteReaderArguments, total=False):
    readId: str
    offset: int
    limit: int


class RemoteReleaseArguments(TypedDict):
    readId: str


class RemoteUploadSourceArguments(TypedDict):
    operationId: str
    uploadId: str
    source: str
    bytes: int
    sha256: str


class RemoteTransferArguments(TypedDict):
    operationId: str
    archiveId: str
    bytes: int
    sha256: str
    manifestSha256: str
    destination: str
    destinationWorkspaceId: str
    uploadId: str


class RemoteTransferStatusArguments(TypedDict):
    operationId: str


class ProgrammeJobRequired(TypedDict):
    id: str
    kind: ProgrammeJobKind


class ProgrammeJobInput(ProgrammeJobRequired, total=False):
    """The native discriminated job. Its unchanged original validator is final.

    CREATE needs value. SUBMIT needs programmeId/stepId/command/value, with
    action/profile only for their native commands. APPLY adds sourceStepId and
    reviewSha256; REPLAY keeps the original request in a distinct step.
    EXPORT needs programmeId/value. IMPORT needs uploadId; ARCHIVE needs
    bundleId/manifestSha256. RECEIVE_REVIEW needs bundleId/manifestSha256/value;
    RECEIVE needs receivingId/reviewSha256.
    """
    value: JSONObject
    programmeId: str
    stepId: str
    sourceStepId: str
    command: str
    action: str
    profile: str
    reviewSha256: str
    bundleId: str
    uploadId: str
    receivingId: str
    manifestSha256: str


class RemoteSubmitRequired(TypedDict):
    id: str


class RemoteSubmitArguments(RemoteSubmitRequired, total=False):
    """Exactly one of source or input; input.id must equal id.

    A declared programme-input source retains its complete original bytes and
    uses the large native CASE_RECORD limit. Python routing JSON stays bounded.
    """
    source: str
    input: ProgrammeJobInput


class ProgrammeJobError(TypedDict):
    code: str
    message: str
    outcomeUnknown: bool


class ProgrammeDescriptorRequired(TypedDict):
    name: str
    bytes: int
    sha256: str


class ProgrammeDescriptor(ProgrammeDescriptorRequired, total=False):
    path: str
    maximum: int
    manifestSha256: str


class ProgrammeJobViewRequired(TypedDict):
    schema: str
    workspaceId: str
    id: str
    request: JSONObject
    requestSha256: str
    createdAt: str
    status: ProgrammeJobStatus
    error: Optional[JSONObject]
    attempts: int
    summary: Optional[JSONObject]
    resultFile: Optional[ProgrammeDescriptor]
    inputFile: ProgrammeDescriptor


class ProgrammeJobView(ProgrammeJobViewRequired, total=False):
    result: JSONObject


class RemoteResultProtocol(Protocol):
    @property
    def record(self) -> RemoteResultRecord: ...
    @property
    def file(self) -> FileDelivery: ...
    @property
    def exported_file(self) -> Optional[FileDelivery]: ...
    @property
    def workspace_id(self) -> str: ...
    def json(self, *, limit: int = 16 * 1024 * 1024) -> JSONValue: ...
    def verify(self) -> RemoteResultRecord: ...


class RemoteProgrammesProtocol(Protocol):
    """Borrow this facade or use ResearchRemoteProgrammes as its context owner."""
    def invoke(
        self, workspace: str, command: RemoteCommand, arguments: Optional[JSONObject] = None,
        *, input_file: Optional[PathSelection] = None,
        expected_input_sha256: Optional[str] = None,
        file: Optional[PathSelection] = None, call_id: str, resume: bool = False,
        cancel_event: Optional[Event] = None,
    ) -> RemoteResultProtocol: ...
    def saved(self, call_id: str) -> RemoteResultProtocol: ...
    def recover(self, call_id: str, *, cancel_event: Optional[Event] = None) -> RemoteResultProtocol: ...
    def replay(
        self, source_call_id: str, *, call_id: str,
        cancel_event: Optional[Event] = None, resume: bool = False,
    ) -> RemoteResultProtocol: ...
    def calls(self, *, offset: int = 0, limit: int = 100) -> RemoteCallPage: ...
    def configuration(self) -> RemoteConfigurationView: ...
    def close(self) -> None: ...
