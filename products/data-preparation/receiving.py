#!/usr/bin/env python3
"""MIT. Operate the retained PREP12 project through the complete managed product."""
from __future__ import annotations
import argparse
import contextlib
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import signal
import time
import zipfile
import uuid

PACKAGE_SHA = '38b52c9837c81177d691127e07587894de7ae52bd6ef74013b02a18578814577'
PROJECT_SHA = '8fbdb47b26da8c5742f573a28dd603635a661e99122807a41c04276871d03779'
PACKAGE_ROOT = 'Starforge_Data_Preparation_2026-10-12/'
PRODUCT = Path('stellar/scf-starforge-20261009/sf30-seller-sdk/data-preparation')
ARCHIVE_SCHEMA = 'stellar-forge.data-preparation.v1.archive'

def digest(data):
    return hashlib.sha256(data).hexdigest()

def write(path, data):
    """Publish a complete new file without exposing an interrupted partial write."""
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary = path.with_name('.'+path.name+'-'+uuid.uuid4().hex+'.partial')
    try:
        with temporary.open('xb') as stream:
            os.chmod(temporary, 0o600)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temporary, path, follow_symlinks=False)
        parent = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    finally:
        temporary.unlink(missing_ok=True)

def retain_file(path, data):
    """Reuse only the exact original file; never replace a received case."""
    if path.exists():
        if not path.is_file() or path.is_symlink() or path.read_bytes() != data:
            raise ValueError('Retained operation file changed: '+str(path))
    else:
        write(path, data)

def private_parent(path):
    if not path.is_absolute() or path.resolve() != path:
        raise ValueError('Use a canonical absolute directory')
    info = path.stat()
    if not path.is_dir() or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
        raise ValueError('Use an owned private parent directory with mode 0700')

def verify_project(path):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        for entry in archive.infolist():
            member = Path(entry.filename)
            if member.is_absolute() or '..' in member.parts or stat.S_ISLNK(entry.external_attr >> 16):
                raise ValueError('Unsafe project member')
        if len(set(names)) != len(names):
            raise ValueError('Duplicate original project member')
        manifest = json.loads(archive.read('manifest.json'))
        if manifest.get('schema') != ARCHIVE_SCHEMA or set(names) != {'manifest.json', *manifest['members']}:
            raise ValueError('The complete original project member map changed')
        for name, expected in manifest['members'].items():
            data = archive.read(name)
            if len(data) != expected['bytes'] or digest(data) != expected['sha256']:
                raise ValueError('Original project member changed: '+name)
        return manifest

def resources():
    result={}
    for name in ("memory.current","memory.max","memory.events","pids.current","pids.max"):
        try:result[name]=(Path("/sys/fs/cgroup")/name).read_text().strip()
        except OSError:pass
    return result
def group_members(outer_group,outer_session):
    members=[]
    for entry in Path("/proc").iterdir():
        if not entry.name.isdecimal():continue
        try:
            data=(entry/"stat").read_text().rsplit(")",1)[1].split()
            if int(data[2])==outer_group and int(data[3])==outer_session and data[0]!="Z":members.append(int(entry.name))
        except (OSError,ValueError,IndexError):pass
    return members
def retire_group(inner_group,identity):
    if identity is None:
        return {"ownedProcessGroup":inner_group,"namespaceRecorded":False,
                "activeBeforeDrain":None,"activeAfterDrain":None}
    outer_group=identity["outerGroup"];outer_session=identity["outerSession"]
    active=group_members(outer_group,outer_session)
    if active:
        try:os.killpg(inner_group,signal.SIGTERM)
        except ProcessLookupError:pass
        until=time.monotonic()+10
        while group_members(outer_group,outer_session) and time.monotonic()<until:time.sleep(.1)
        if group_members(outer_group,outer_session):
            try:os.killpg(inner_group,signal.SIGKILL)
            except ProcessLookupError:pass
            until=time.monotonic()+5
            while group_members(outer_group,outer_session) and time.monotonic()<until:time.sleep(.1)
    return {"ownedProcessGroup":inner_group,"namespaceRecorded":True,"namespace":identity,
            "activeBeforeDrain":active,"activeAfterDrain":group_members(outer_group,outer_session)}
def child_identity(path,pid):
    try:value=json.loads(path.read_text())
    except FileNotFoundError:return None
    if value.get("innerPid")!=pid or not all(isinstance(value.get(key),int) and value[key]>0 for key in ("outerPid","outerGroup","outerSession")):
        raise ValueError("The original child process identity changed")
    if value["outerPid"]!=value["outerGroup"] or value["outerGroup"]!=value["outerSession"]:
        raise ValueError("The original child did not start its own process session")
    return value

def retire_unrecorded_group(child):
    """Drain only the original inner group when its namespace report was interrupted."""
    def exists():
        child.poll()
        try:
            os.killpg(child.pid, 0)
            return True
        except ProcessLookupError:
            return False
    existed = exists()
    for requested, seconds in [(signal.SIGTERM, 5), (signal.SIGKILL, 5)]:
        if not exists():
            break
        with contextlib.suppress(ProcessLookupError):
            os.killpg(child.pid, requested)
        until = time.monotonic()+seconds
        while exists() and time.monotonic() < until:
            time.sleep(.1)
    return {'ownedProcessGroup': child.pid, 'namespaceRecorded': False,
        'innerGroupPresentBeforeDrain': existed, 'innerGroupPresentAfterDrain': exists(),
        'activeBeforeDrain': None, 'activeAfterDrain': None}

def retained_records(current, original):
    for collection in ('sources', 'recipes', 'runs', 'reviews'):
        for record in original['workspace'][collection]:
            found = next((item for item in current[collection] if item['id'] == record['id']
                and (collection != 'recipes' or item['revision'] == record['revision'])), None)
            if found != record:
                raise ValueError('The delivered project changed an original '+collection+' record')

def verify_pipeline_project(path, original, pipeline, *, customer=False):
    with zipfile.ZipFile(path) as archive:
        if sorted(archive.namelist()) != ['manifest.json', 'pipelines.json', 'preparation.zip']:
            raise ValueError('Keep the complete original pipeline project together')
        manifest = json.loads(archive.read('manifest.json'))
        if manifest.get('schema') != 'stellar-forge.preparation-pipelines.v1.archive':
            raise ValueError('Unexpected original pipeline archive schema')
        if set(manifest.get('members', {})) != {'pipelines.json', 'preparation.zip'}:
            raise ValueError('The pipeline project member inventory changed')
        for name, expected in manifest['members'].items():
            data = archive.read(name)
            if len(data) != expected['bytes'] or digest(data) != expected['sha256']:
                raise ValueError('A complete original pipeline member changed: '+name)
        native = verify_project(io.BytesIO(archive.read('preparation.zip')))
        retained_records(native['workspace'], original)
        snapshot = json.loads(archive.read('pipelines.json'))
        wanted = {pipeline['executionId']}
        revisions = {1}
        if customer:
            wanted.add(pipeline['customerExecutionId'])
            revisions.add(2)
        actual = {item['id'] for item in snapshot['executions'] if item['status'] == 'COMPLETE'}
        if not wanted.issubset(actual):
            raise ValueError('The complete pipeline execution history was not delivered')
        actual_revisions = {item['revision'] for item in snapshot['definitions'] if item['id'] == pipeline['pipelineId']}
        if actual_revisions != revisions:
            raise ValueError('The original and independently edited pipeline editions changed')
        return {'path': str(path), 'bytes': Path(path).stat().st_size,
            'sha256': digest(Path(path).read_bytes()), 'nativeRuns': len(native['workspace']['runs']),
            'pipelineEditions': len(snapshot['definitions']), 'executions': len(snapshot['executions'])}

def verify_customer_output(directory, attempt, original, source, environment, node, source_manifest):
    received = json.loads((attempt/'receiving-result.json').read_text())
    for name, selected in received['archives'].items():
        manifest = verify_project(Path(selected))
        expected = received['customerCounts'] if name == 'customerProject' else received['preparationEditionCounts']
        if len(manifest['workspace']['runs']) != expected['runs']:
            raise ValueError('The complete preparation project omitted a retained result')
        retained_records(manifest['workspace'], original)
    pipeline = received['pipeline']
    projects = [verify_pipeline_project(Path(path), original, pipeline, customer=name == 'customerProject')
        for name, path in pipeline['archives'].items()]
    for target in [directory/'operator', directory/'customer', Path(pipeline['receivedDirectory'])]:
        if not target.is_relative_to(directory):
            raise ValueError('The received pipeline left its original operation')
        for name, expected in original['members'].items():
            data = (target/name).read_bytes()
            if len(data) != expected['bytes'] or digest(data) != expected['sha256']:
                raise ValueError('The original file history changed in '+str(target)+': '+name)
    descriptions = {}
    merchant_archives = {
        'preparation': Path(received['merchantArchive']),
        'pipeline': Path(next(item['localPath'] for item in pipeline['deliveries'] if item['kind'] == 'pipeline-merchant'))}
    for label, selected in merchant_archives.items():
        merchant = attempt/('merchant-dataset-'+label)
        merchant.mkdir(mode=0o700)
        with zipfile.ZipFile(selected) as archive:
            if set(archive.namelist()) != {'dataset.csv', 'dataset.json', 'mapping.json', 'README.md'}:
                raise ValueError('Keep the complete original merchant dataset together')
            for name in archive.namelist():
                write(merchant/name, archive.read(name))
        inspected = subprocess.run([
            node, str(source/PRODUCT.parent/'dataset-cli.mjs'),
            '--dataset', str(merchant/'dataset.json')
        ], env=environment, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30, check=True)
        description = json.loads(inspected.stdout)
        if description['rowCount'] != 6:
            raise ValueError('Original merchant loading did not receive the whole prepared result')
        descriptions[label] = description
    result_delivery = next(item for item in pipeline['deliveries'] if item['kind'] == 'pipeline-result')
    outputs_delivery = next(item for item in pipeline['deliveries'] if item['kind'] == 'pipeline-results')
    with zipfile.ZipFile(outputs_delivery['localPath']) as archive:
        expected_names = {'outputs.json', 'report.html', 'prepare/result.csv', 'prepare/result.jsonl', 'prepare/schema.json'}
        if set(archive.namelist()) != expected_names:
            raise ValueError('The complete selected stage output delivery changed')
        if digest(archive.read('prepare/result.jsonl')) != result_delivery['sha256']:
            raise ValueError('The delivered selected output differs from its complete original result')
        if json.loads(archive.read('outputs.json'))['outputs']['prepare']['rows'] != 6:
            raise ValueError('The selected stage output omitted original rows')
    received.update({
        'sourceCommit': source_manifest['sourceCommit'],
        'sourceRepository': 'woahwhattheheck/tjlabs-stellar-merchant-workspace',
        'merchantDatasets': descriptions,
        'verifiedOriginalFiles': len(original['members']),
        'verifiedCompleteProjectArchives': len(received['archives'])+len(projects),
        'pipelineProjectArchives': projects,
        'sourceFiles': len(source_manifest['files']),
        'sourceManifestSha256': digest(json.dumps(source_manifest, sort_keys=True).encode())})
    return received, descriptions['pipeline']

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', required=True, type=Path)
    parser.add_argument('--source-commit', required=True, help='Immutable source commit in receiving-source.json')
    parser.add_argument('--package', required=True, type=Path,
        help='Unchanged original Starforge_Data_Preparation_2026-10-12.zip')
    parser.add_argument('--directory', required=True, type=Path, help='Private directory for the complete original operation')
    parser.add_argument('--continue', dest='continue_original', action='store_true',
        help='Continue the same retained PREP12 operation and its committed recipe/result identities')
    parser.add_argument('--timeout-seconds', type=int, default=600,
        help='Maximum lifetime of this complete receiving invocation before preserving its closed checkpoint')
    parser.add_argument('--node', default='node')
    parser.add_argument('--playwright-module', required=True)
    parser.add_argument('--chromium', required=True)
    parser.add_argument('--save-helper', type=Path,
        help='Current library_upload.py beside its four original sibling helpers')
    args = parser.parse_args()
    private_parent(args.directory.parent)
    source_root = args.source_root.resolve()
    manifest_path = Path(__file__).with_name('receiving-source.json')
    source_manifest = json.loads(manifest_path.read_text())
    if source_manifest.get('schema') != 'stellar-forge.data-preparation-managed-receiving-source.v1':
        raise ValueError('Use the complete source manifest beside this receiver')
    if source_manifest['sourceCommit'] != args.source_commit:
        raise ValueError('Select the exact immutable source commit in receiving-source.json')
    package_bytes = args.package.resolve().read_bytes()
    if len(package_bytes) != 1143288 or digest(package_bytes) != PACKAGE_SHA:
        raise ValueError('Use the exact retained original PREP12 package')
    with zipfile.ZipFile(io.BytesIO(package_bytes)) as outer:
        project_bytes = outer.read(PACKAGE_ROOT+'demonstration/project.zip')
    if len(project_bytes) != 671360 or digest(project_bytes) != PROJECT_SHA:
        raise ValueError('The retained original project bytes changed')
    directory = args.directory
    if args.continue_original:
        private_parent(directory)
    else:
        directory.mkdir(mode=0o700)
    if args.timeout_seconds < 60:
        raise ValueError('Allow the whole receiving operation at least 60 seconds')
    lock = os.open(directory/'managed-receiving.lock', os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    attempts = directory/'receiving-attempts'
    attempts.mkdir(mode=0o700, exist_ok=True)
    private_parent(attempts)
    attempt = attempts/uuid.uuid4().hex
    attempt.mkdir(mode=0o700)
    source = attempt/'source'
    source.mkdir(mode=0o700)
    for name, expected in source_manifest['files'].items():
        relative = Path(name)
        if relative.is_absolute() or '..' in relative.parts:
            raise ValueError('Unsafe selected source path')
        data = (source_root/relative).read_bytes()
        if len(data) != expected['bytes'] or digest(data) != expected['sha256']:
            raise ValueError('Selected original source changed: '+name)
        if hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest() != expected['blob']:
            raise ValueError('Selected original Git object changed: '+name)
        write(source/relative, data)
    write(attempt/'receiving-source.json', manifest_path.read_bytes())
    driver = Path(__file__).with_suffix('.mjs').read_bytes()
    selected_driver = source_manifest['receivingDriver']
    if len(driver) != selected_driver['bytes'] or digest(driver) != selected_driver['sha256']:
        raise ValueError('Use the complete original receiving driver beside its manifest')
    write(attempt/'receiving.mjs', driver)
    write(attempt/'receiving.py', Path(__file__).read_bytes())
    write(attempt/'RECEIVING.md', Path(__file__).with_name('RECEIVING.md').read_bytes())
    (directory/'inputs').mkdir(mode=0o700, exist_ok=True)
    private_parent(directory/'inputs')
    (attempt/'downloads').mkdir(mode=0o700)
    retain_file(directory/'original-package.zip', package_bytes)
    project_path = directory/'original-project.zip'
    retain_file(project_path, project_bytes)
    original = verify_project(project_path)
    if sum(item['rows'] for item in original['workspace']['sources']) != 120012:
        raise ValueError('The original input project is incomplete')
    with zipfile.ZipFile(project_path) as project:
        orders = next(item for item in original['workspace']['sources'] if item['alias'] == 'orders')
        retain_file(directory/'inputs/orders.csv', project.read('originals/'+orders['sha256']))
    retain_file(directory/'original-manifest.json', json.dumps(original, ensure_ascii=False).encode())
    options = {
        'packageSha256': PACKAGE_SHA, 'projectSha256': PROJECT_SHA,
        'sourceCommit': source_manifest['sourceCommit'],
        'playwrightModule': args.playwright_module, 'chromiumExecutable': args.chromium,
        'attemptDirectory': str(attempt), 'continueOriginal': args.continue_original,
    }
    write(attempt/'receiving-options.json', json.dumps(options).encode())
    environment = dict(os.environ)
    environment['STARFORGE_PYTHON'] = sys.executable
    environment['TMPDIR'] = str(attempt)
    write(attempt/'native-entry.mjs', (
        "import {readFileSync,readlinkSync,writeFileSync} from 'node:fs';\n"
        "import {join} from 'node:path';\nimport {pathToFileURL} from 'node:url';\n"
        "const options=JSON.parse(readFileSync(process.argv[4],'utf8')),attempt=options.attemptDirectory;\n"
        "const raw=readFileSync('/proc/self/stat','utf8');\n"
        "const fields=raw.slice(raw.lastIndexOf(')')+2).trim().split(/\\s+/);\n"
        "const identity={innerPid:process.pid,outerPid:Number(readlinkSync('/proc/self')),\n"
        " outerGroup:Number(fields[2]),outerSession:Number(fields[3])};\n"
        "writeFileSync(join(attempt,'native-process-identity.json'),JSON.stringify(identity)+'\\n',{flag:'wx',mode:0o600});\n"
        "console.log(JSON.stringify({stage:'PREPARATION_NATIVE_NAMESPACE',...identity}));\n"
        "await import(pathToFileURL(join(attempt,'receiving.mjs')).href);\n").encode())
    identity_path = attempt/'native-process-identity.json'
    before = resources()
    print(json.dumps({'stage': 'EXACT_ORIGINAL_PREPARATION_RECEIVED',
        'sourceCommit': source_manifest['sourceCommit'], 'sourceFiles': len(source_manifest['files']),
        'sourceBytes': sum(item['bytes'] for item in source_manifest['files'].values()),
        'originalInputRows': 120012, 'originalPackageSha256': PACKAGE_SHA,
        'directory': str(directory), 'attempt': str(attempt), 'continuingOriginal': args.continue_original}), flush=True)
    stopping = {'signal': None, 'native': False}
    previous_handlers = {number: signal.getsignal(number) for number in (signal.SIGINT, signal.SIGTERM)}
    def request_stop(number, _frame):
        if stopping['signal'] is None:
            stopping['signal'] = number
        if stopping['native']:
            stopping['native'] = False
            raise KeyboardInterrupt('Receiving stop requested by signal '+str(number))
    for number in previous_handlers:
        signal.signal(number, request_stop)
    try:
        started = time.monotonic()
        child = None
        process_result = {'before': before, 'timedOut': False}
        error = None
        try:
            stopping['native'] = True
            if stopping['signal'] is not None:
                raise KeyboardInterrupt('Receiving stop requested before native startup')
            child = subprocess.Popen([
                args.node, str(attempt/'native-entry.mjs'), str(source), str(directory),
                str(attempt/'receiving-options.json')
            ], env=environment, start_new_session=True)
            try:
                returncode = child.wait(timeout=args.timeout_seconds)
            except subprocess.TimeoutExpired:
                process_result['timedOut'] = True
                with contextlib.suppress(ProcessLookupError):
                    os.killpg(child.pid, signal.SIGTERM)
                try:
                    returncode = child.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    with contextlib.suppress(ProcessLookupError):
                        os.killpg(child.pid, signal.SIGKILL)
                    returncode = child.wait()
            process_result.update({'pid': child.pid, 'returncode': returncode,
                'signal': -returncode if returncode < 0 else None})
        except (Exception, KeyboardInterrupt) as failure:
            error = {'type': type(failure).__name__, 'message': str(failure)}
            process_result['returncode'] = child.poll() if child else None
        finally:
            stopping['native'] = False
            process_result['requestedSignal'] = stopping['signal']
            if child:
                identity = None
                try:
                    identity = child_identity(identity_path, child.pid)
                except Exception as failure:
                    process_result['identityError'] = {'type': type(failure).__name__, 'message': str(failure)}
                    error = error or process_result['identityError']
                try:
                    if identity is None:
                        process_result.update(retire_unrecorded_group(child))
                    else:
                        process_result.update(retire_group(child.pid, identity))
                except Exception as failure:
                    process_result['drainError'] = {'type': type(failure).__name__, 'message': str(failure)}
                    process_result['namespaceRecorded'] = False
                    error = error or process_result['drainError']
                    try:
                        process_result.update(retire_unrecorded_group(child))
                    except Exception as cleanup_failure:
                        process_result['fallbackDrainError'] = {
                            'type': type(cleanup_failure).__name__, 'message': str(cleanup_failure)}
                if child.poll() is None:
                    try:
                        child.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        child.kill()
                        child.wait()
            if child:
                process_result.update({'pid': child.pid, 'returncode': child.poll(),
                    'signal': -child.returncode if child.returncode is not None and child.returncode < 0 else None})
            process_result['seconds'] = round(time.monotonic()-started, 3)
            process_result['after'] = resources()
            write(attempt/'native-process.json', (json.dumps(process_result, indent=2)+'\n').encode())
            print(json.dumps({'stage': 'MANAGED_RECEIVING_PROCESS_EXIT', **process_result}), flush=True)
        result_path = attempt/'receiving-result.json'
        saved_result = None
        if result_path.is_file():
            try:
                saved_result = json.loads(result_path.read_text())
            except Exception as failure:
                process_result['resultReadError'] = {'type': type(failure).__name__, 'message': str(failure)}
                error = error or process_result['resultReadError']
        completed = (process_result.get('returncode') == 0 and isinstance(saved_result, dict)
            and process_result.get('timedOut') is False and error is None
            and process_result.get('namespaceRecorded') is True and not process_result.get('activeAfterDrain'))
        description = None
        received = {'schema': 'stellar-forge.data-preparation-managed-receiving-checkpoint.v1',
            'sourceCommit': source_manifest['sourceCommit'], 'originalPackageSha256': PACKAGE_SHA,
            'originalProjectSha256': PROJECT_SHA, 'originalInputRows': 120012}
        if completed:
            try:
                received, description = verify_customer_output(
                    directory, attempt, original, source, environment, args.node, source_manifest)
            except Exception as failure:
                completed = False
                error = {'type': type(failure).__name__, 'message': str(failure)}
                if saved_result is not None:
                    received['completedPhases'] = saved_result
        elif saved_result is not None:
            received['completedPhases'] = saved_result
        received.update({'completed': completed, 'nativeProcess': process_result, 'error': error,
            'sourceFiles': len(source_manifest['files']), 'receivingDriverSha256': digest(driver)})
        title = 'Starforge_Data_Preparation_Pipelines_2026-10-12'
        report = attempt/(title+('_Receiving.json' if completed else '_Checkpoint.json'))
        write(report, (json.dumps(received, indent=2, ensure_ascii=False)+'\n').encode())
        guide = (
            '# Data preparation and pipelines: complete customer operation\n\n'
            'This complete operation retains the original 120,012-row PREP12 project, its source files, '
            'SQL editions and review histories, the managed preparation work, and the independently edited '
            'pipeline customer project. Read this invocation’s receiving JSON for its actual completed stages, '
            'complete file identities and process outcome.\n\n'
            '## Open the prepared work\n\n'
            'The receiving JSON gives each full project archive path and its identity. Paths under the original '
            'operation directory correspond to the same relative path in this ZIP. The pipeline project '
            'contains preparation.zip and pipelines.json together. Receive it into a new private directory:\n\n'
            '    python3 SOURCE/stellar/scf-starforge-20261009/sf30-seller-sdk/data-preparation/pipelines/cli.py '
            '--workspace /ABSOLUTE/PRIVATE/customer receive FULL_PIPELINE_PROJECT.zip\n'
            '    node SOURCE/stellar/scf-starforge-20261009/sf30-seller-sdk/data-preparation/managed.mjs '
            '--workspace /ABSOLUTE/PRIVATE/customer --port 0\n\n'
            'Open the private link printed by that listener. Its source preparation and pipeline editor use '
            'the same saved state through Applications, the typed clients and all 40 merchant tools. '
            'The independent customer pipeline retains edition 1, adds edition 2 with the original open-order '
            'parameters, and keeps both complete executions and their native result histories.\n\n'
            '## Continue this exact operation\n\n'
            'Each receiving-attempts/ directory contains its exact selected source, receiver, options, '
            'actual process outcome, complete downloads and browser views. To resume after interruption, '
            'run the current receiver against the original operation directory with --continue. '
            'managed-receiving-progress.json retains the operation ID and saved recipe, result, pipeline '
            'and export identities. The unchanged original-package.zip and original-project.zip remain '
            'beside the closed operator/ and customer/ directories. The operator also retains its '
            'independently received pipeline customer tree. Keep these complete directories together.\n\n'
            'The included RECEIVING.md gives the exact invocation. receiving-source.json binds every full '
            'selected source file and the JavaScript receiving driver. files.json covers every file and '
            'empty directory in this delivery. Private listener connection files are removed when their '
            'own Applications process stops; reopen the work to obtain a new private connection.\n\n'
            '## Maintained product\n\n'
            'https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/tree/'
            +source_manifest['sourceCommit']+'/products/data-preparation\n'
        )
        write(attempt/'START_HERE.md', guide.encode())
        output = attempt/(title+('_Customer.zip' if completed else '_Checkpoint.zip'))
        selected = []
        def select(path):
            if not path.exists():
                return
            selected.append(path)
            if path.is_dir():
                selected.extend(sorted(path.rglob('*')))
        for name in ['original-package.zip', 'original-project.zip', 'original-manifest.json',
                     'managed-receiving-progress.json']:
            select(directory/name)
        for folder in ['operator', 'customer', 'inputs', 'downloads']:
            select(directory/folder)
        for previous in sorted(attempts.iterdir()):
            if not previous.is_dir() or previous.is_symlink():
                raise ValueError('Use the original private receiving-attempt directories')
            selected.append(previous)
            for name in ['source', 'downloads', 'browser', 'merchant-dataset-preparation', 'merchant-dataset-pipeline']:
                select(previous/name)
            for name in ['START_HERE.md', 'RECEIVING.md', 'receiving.py', 'receiving.mjs', 'receiving-source.json',
                         'receiving-options.json', 'native-entry.mjs', 'native-process-identity.json',
                         'native-process.json', 'receiving-result.json',
                         title+'_Receiving.json', title+'_Checkpoint.json']:
                select(previous/name)
        selected = sorted(set(selected))
        members = {}
        directories = []
        with zipfile.ZipFile(output, 'x', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for path in selected:
                info = path.lstat()
                name = str(path.relative_to(directory))
                if stat.S_ISLNK(info.st_mode):
                    raise ValueError('The original closed customer operation contains a linked file')
                if stat.S_ISDIR(info.st_mode):
                    name += '/'
                    entry = zipfile.ZipInfo(name)
                    entry.create_system = 3
                    entry.external_attr = ((stat.S_IFDIR | 0o700) << 16) | 0x10
                    archive.writestr(entry, b'')
                    directories.append(name)
                elif stat.S_ISREG(info.st_mode):
                    data = path.read_bytes()
                    members[name] = {'bytes': len(data), 'sha256': digest(data)}
                    entry = zipfile.ZipInfo(name)
                    entry.create_system = 3
                    entry.external_attr = (stat.S_IFREG | 0o600) << 16
                    entry.compress_type = zipfile.ZIP_DEFLATED
                    archive.writestr(entry, data)
                else:
                    raise ValueError('The original closed customer operation contains a non-regular entry')
            archive.writestr('files.json', json.dumps({
                'schema': 'stellar-forge.data-preparation-managed-customer-files.v1',
                'members': members, 'directories': directories}, indent=2)+'\n')
        output.chmod(0o600)
        final = {'completed': completed, 'directory': str(directory), 'report': str(report),
            'attempt': str(attempt), 'archive': str(output), 'archiveBytes': output.stat().st_size,
            'archiveSha256': digest(output.read_bytes()), 'files': len(members),
            'originalInputRows': 120012, 'managedCounts': received.get('managedCounts'),
            'customerCounts': received.get('customerCounts'),
            'merchantRows': description['rowCount'] if description else None}
        print(json.dumps({'stage': 'COMPLETE_MANAGED_CUSTOMER_DELIVERY' if completed else 'ORIGINAL_MANAGED_CHECKPOINT',
            **final}), flush=True)
        if args.save_helper:
            helpers = args.save_helper.resolve().parent
            for name in ['library_upload.py', 'library_hosted_apps.py', 'library_file_transfer.py',
                         'native_library_delivery.py', 'native_library_requests.py']:
                if not (helpers/name).is_file():
                    raise ValueError('Keep the five current delivery helpers together: '+name)
            request = {'uploads': [
                {'local_path': str(report), 'purpose': 'create_library_file', 'library_artifact_type': 'other'},
                {'local_path': str(output), 'purpose': 'create_library_file', 'library_artifact_type': 'other'}]}
            request_path = attempt/'library-save-request.json'
            saved_path = attempt/'library-save-result.json'
            receipt_path = attempt/'library-save-receipts.jsonl'
            provider_requests = attempt/'library-provider-requests'
            write(request_path, (json.dumps(request)+'\n').encode())
            worker = '\n'.join([
                'import sys',
                'from pathlib import Path',
                'helpers=Path(sys.argv[1]).resolve()',
                'sys.path.insert(0,str(helpers))',
                'from native_library_delivery import _worker',
                'sys.exit(_worker(helpers,Path(sys.argv[2]),Path(sys.argv[3]),Path(sys.argv[4]),',
                '    Path(sys.argv[5]),Path(sys.argv[6]),upload_mode="returned-put"))',
                '',
            ])
            saved = subprocess.run([sys.executable, '-c', worker, str(helpers), str(request_path),
                str(saved_path), str(receipt_path), str(attempt), str(provider_requests)],
                text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=300)
            write(attempt/'library-save-stdout.txt', saved.stdout.encode())
            write(attempt/'library-save-stderr.txt', saved.stderr.encode())
            for stream in [saved.stdout, saved.stderr]:
                for line in stream.splitlines():
                    if line.startswith('__OPENAI_LIBRARY_FILE_WRITE_RECEIPT_V1__='):
                        print(line, file=sys.stderr, flush=True)
            if saved_path.is_file():
                print(saved_path.read_text(), end='', flush=True)
            if saved.returncode:
                raise RuntimeError('The complete closed customer files remain in their receiving directory; saving did not finish')
        return 0 if completed else 1
    finally:
        for number, handler in previous_handlers.items():
            signal.signal(number, handler)

if __name__ == '__main__':
    sys.exit(main())
