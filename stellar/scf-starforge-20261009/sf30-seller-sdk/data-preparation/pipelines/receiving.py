"""MIT. Complete create-only project receiving through the original operator.

Every received project has an independent native Workspace and executor. Its
original archive identity is retained before admission; replaying a lost upload
response returns that same project rather than importing a second copy.
"""
from __future__ import annotations
import fcntl
import hashlib
import re
from pathlib import Path

from engine import PipelineWorkspace
from preparation import PreparationError, atomic_json, parse_json, digest, now
from delivery import receive_project

ID = re.compile(r'^r_[a-f0-9]{64}$')


def receiving_root(workspace):
    root = workspace.root / 'received-pipeline-projects'
    root.mkdir(mode=0o700, exist_ok=True)
    return root


def received_project(workspace, identifier):
    if not isinstance(identifier, str) or not ID.fullmatch(identifier):
        raise PreparationError('Unknown received project')
    root = receiving_root(workspace) / identifier
    try:
        selection = parse_json((root / 'selection.json').read_text(encoding='utf-8'))
        receipt = parse_json((root / 'receipt.json').read_text(encoding='utf-8'))
    except FileNotFoundError as exc:
        raise PreparationError('That project has not completed receiving; retry its original upload') from exc
    if receipt['id'] != identifier or receipt['archiveSha256'] != selection['archiveSha256']:
        raise PreparationError('The retained project selection differs')
    if not (root / 'workspace').is_dir():
        raise PreparationError('The received project directory is missing')
    return {**receipt, 'path': str((root / 'workspace').resolve())}


def received_projects(workspace):
    root = receiving_root(workspace)
    return [received_project(workspace, p.name) for p in sorted(root.iterdir())
            if ID.fullmatch(p.name) and (p / 'receipt.json').is_file()]


def receive_project_request(workspace, archive, request_key):
    if not isinstance(request_key, str) or not request_key.strip() or len(request_key) > 200:
        raise PreparationError('Supply a stable receiving request key of 1–200 characters')
    archive = Path(archive)
    original = digest(archive)
    identifier = 'r_' + hashlib.sha256(request_key.encode('utf-8')).hexdigest()
    root = receiving_root(workspace) / identifier
    root.mkdir(mode=0o700, exist_ok=True)
    with (root / 'receiving.lock').open('a+b') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        selection_path = root / 'selection.json'
        if selection_path.exists():
            selection = parse_json(selection_path.read_text(encoding='utf-8'))
            if selection['archiveSha256'] != original or selection['bytes'] != archive.stat().st_size:
                raise PreparationError('That receiving request key already belongs to a different complete archive')
        else:
            selection = {'id': identifier, 'archiveSha256': original,
                         'bytes': archive.stat().st_size, 'createdAt': now()}
            atomic_json(selection_path, selection)
        destination = root / 'workspace'
        if not destination.exists():
            receive_project(archive, destination)
        # Also covers process death after native receiving but before the receipt.
        if not (root / 'receipt.json').exists():
            received = PipelineWorkspace(destination)
            native = received.native
            record = {**selection, 'label': native.info['label'],
                      'pipelines': received.list('pipelines')['total'],
                      'executions': received.list('executions')['total'],
                      'sources': len(native.records('sources')),
                      'nativeRuns': len(native.records('runs'))}
            atomic_json(root / 'receipt.json', record)
        if digest(archive) != original:
            raise PreparationError('The selected complete archive changed during receiving')
        return received_project(workspace, identifier)
