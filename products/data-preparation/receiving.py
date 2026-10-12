#!/usr/bin/env python3
"""MIT. Operate the retained PREP12 project through the complete managed product."""
from __future__ import annotations
import argparse
import contextlib
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

PACKAGE_SHA = '38b52c9837c81177d691127e07587894de7ae52bd6ef74013b02a18578814577'
PROJECT_SHA = '8fbdb47b26da8c5742f573a28dd603635a661e99122807a41c04276871d03779'
PACKAGE_ROOT = 'Starforge_Data_Preparation_2026-10-12/'
PRODUCT = Path('stellar/scf-starforge-20261009/sf30-seller-sdk/data-preparation')
ARCHIVE_SCHEMA = 'stellar-forge.data-preparation.v1.archive'

def digest(data):
    return hashlib.sha256(data).hexdigest()

def write(path, data):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with path.open('xb') as stream:
        os.chmod(path, 0o600)
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())

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

def verify_customer_output(directory, original, source, environment, node, source_manifest):
    result_path = directory/'receiving-result.json'
    received = json.loads(result_path.read_text())
    for name in ['browser-project.zip', 'project.zip', 'sdk-project.zip', 'customer-edited-project.zip']:
        manifest = verify_project(directory/'downloads'/name)
        expected_runs = 4 if name == 'customer-edited-project.zip' else 3
        if len(manifest['workspace']['runs']) != expected_runs:
            raise ValueError('The complete customer project omitted a retained result')
    for target in ['operator', 'customer']:
        for name, expected in original['members'].items():
            data = (directory/target/name).read_bytes()
            if len(data) != expected['bytes'] or digest(data) != expected['sha256']:
                raise ValueError('The original file history changed in '+target+': '+name)
    merchant = directory/'merchant-dataset'
    merchant.mkdir(mode=0o700)
    with zipfile.ZipFile(directory/'downloads/merchant.zip') as archive:
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
    received['sourceCommit'] = source_manifest['sourceCommit']
    received['sourceRepository'] = 'woahwhattheheck/tjlabs-stellar-merchant-workspace'
    received['merchantDataset'] = description
    received['verifiedOriginalFiles'] = len(original['members'])
    received['verifiedCompleteProjectArchives'] = 4
    received['sourceFiles'] = len(source_manifest['files'])
    received['sourceManifestSha256'] = digest(json.dumps(source_manifest, sort_keys=True).encode())
    return received, description

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', required=True, type=Path)
    parser.add_argument('--source-commit', required=True, help='Immutable source commit in receiving-source.json')
    parser.add_argument('--package', required=True, type=Path,
        help='Unchanged original Starforge_Data_Preparation_2026-10-12.zip')
    parser.add_argument('--directory', required=True, type=Path, help='New private receiving directory')
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
    directory.mkdir(mode=0o700)
    source = directory/'source'
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
    write(directory/'receiving-source.json', manifest_path.read_bytes())
    driver = Path(__file__).with_suffix('.mjs').read_bytes()
    selected_driver = source_manifest['receivingDriver']
    if len(driver) != selected_driver['bytes'] or digest(driver) != selected_driver['sha256']:
        raise ValueError('Use the complete original receiving driver beside its manifest')
    write(directory/'journey.mjs', driver)
    for child in ['inputs', 'downloads']:
        (directory/child).mkdir(mode=0o700)
    write(directory/'original-package.zip', package_bytes)
    project_path = directory/'original-project.zip'
    write(project_path, project_bytes)
    original = verify_project(project_path)
    if sum(item['rows'] for item in original['workspace']['sources']) != 120012:
        raise ValueError('The original input project is incomplete')
    with zipfile.ZipFile(project_path) as project:
        orders = next(item for item in original['workspace']['sources'] if item['alias'] == 'orders')
        write(directory/'inputs/orders.csv', project.read('originals/'+orders['sha256']))
    write(directory/'original-manifest.json', json.dumps(original, ensure_ascii=False).encode())
    options = {
        'packageSha256': PACKAGE_SHA, 'projectSha256': PROJECT_SHA,
        'sourceCommit': source_manifest['sourceCommit'],
        'playwrightModule': args.playwright_module, 'chromiumExecutable': args.chromium,
    }
    write(directory/'receiving-options.json', json.dumps(options).encode())
    environment = dict(os.environ)
    environment['STARFORGE_PYTHON'] = sys.executable
    environment['TMPDIR'] = str(directory)
    write(directory/'native-entry.mjs', "import {readFileSync,readlinkSync,writeFileSync} from 'node:fs';\nimport {join} from 'node:path';\nimport {pathToFileURL} from 'node:url';\nconst root=process.argv[3],raw=readFileSync('/proc/self/stat','utf8');\nconst fields=raw.slice(raw.lastIndexOf(')')+2).trim().split(/\\s+/);\nconst identity={innerPid:process.pid,outerPid:Number(readlinkSync('/proc/self')),\n outerGroup:Number(fields[2]),outerSession:Number(fields[3])};\nwriteFileSync(join(root,'native-process-identity.json'),JSON.stringify(identity)+'\\n',{flag:'wx',mode:0o600});\nconsole.log(JSON.stringify({stage:'PREPARATION_NATIVE_NAMESPACE',...identity}));\nawait import(pathToFileURL(join(root,'journey.mjs')).href);\n".encode())
    identity_path = directory/'native-process-identity.json'
    before = resources()
    print(json.dumps({'stage': 'EXACT_ORIGINAL_PREPARATION_RECEIVED',
        'sourceCommit': source_manifest['sourceCommit'], 'sourceFiles': len(source_manifest['files']),
        'sourceBytes': sum(item['bytes'] for item in source_manifest['files'].values()),
        'originalInputRows': 120012, 'originalPackageSha256': PACKAGE_SHA,
        'directory': str(directory)}), flush=True)
    started = time.monotonic()
    child = None
    process_result = {'before': before, 'timedOut': False}
    error = None
    try:
        child = subprocess.Popen([
            args.node, str(directory/'native-entry.mjs'), str(source), str(directory),
            str(directory/'receiving-options.json')
        ], env=environment, start_new_session=True)
        try:
            returncode = child.wait(timeout=240)
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
    except Exception as failure:
        error = {'type': type(failure).__name__, 'message': str(failure)}
        process_result['returncode'] = None
    finally:
        if child:
            process_result.update(retire_group(child.pid, child_identity(identity_path, child.pid)))
            if child.poll() is None:
                try:
                    child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()
        process_result['seconds'] = round(time.monotonic()-started, 3)
        process_result['after'] = resources()
        write(directory/'native-process.json', (json.dumps(process_result, indent=2)+'\n').encode())
        print(json.dumps({'stage': 'MANAGED_RECEIVING_PROCESS_EXIT', **process_result}), flush=True)
    result_path = directory/'receiving-result.json'
    completed = (process_result.get('returncode') == 0 and result_path.is_file()
        and process_result.get('namespaceRecorded') is True and not process_result.get('activeAfterDrain'))
    description = None
    received = {'schema': 'stellar-forge.data-preparation-managed-receiving-checkpoint.v1',
        'sourceCommit': source_manifest['sourceCommit'], 'originalPackageSha256': PACKAGE_SHA,
        'originalProjectSha256': PROJECT_SHA, 'originalInputRows': 120012}
    if completed:
        try:
            received, description = verify_customer_output(
                directory, original, source, environment, args.node, source_manifest)
        except Exception as failure:
            completed = False
            error = {'type': type(failure).__name__, 'message': str(failure)}
            if result_path.is_file():
                received['completedPhases'] = json.loads(result_path.read_text())
    elif result_path.is_file():
        received['completedPhases'] = json.loads(result_path.read_text())
    received.update({'completed': completed, 'nativeProcess': process_result, 'error': error,
        'sourceFiles': len(source_manifest['files']), 'receivingDriverSha256': digest(driver)})
    title = 'Starforge_Data_Preparation_Managed_2026-10-12'
    report = directory/(title+('_Receiving.json' if completed else '_Checkpoint.json'))
    write(report, (json.dumps(received, indent=2, ensure_ascii=False)+'\n').encode())
    guide = (
        '# Data preparation: complete managed customer operation\n\n'
        'This delivery retains the exact original 120,012-row PREP12 project and the closed managed operator '
        'and customer workspaces produced by this operation. Read the included receiving JSON for completed '
        'phases, original identifiers, complete file hashes and the actual process outcome.\n\n'
        '## Open a complete project\n\n'
        'Set PREPARATION_SOURCE_ROOT to the READY data-preparation-workspace installation. Use the complete '
        'downloads/customer-edited-project.zip when the independent edit completed; downloads/project.zip '
        'contains the preceding managed edition. Receive into a new private directory:\n\n'
        '    python3 "$PREPARATION_SOURCE_ROOT/stellar/scf-starforge-20261009/sf30-seller-sdk/data-preparation/cli.py" '
        '--workspace /ABSOLUTE/PRIVATE/new-customer receive downloads/customer-edited-project.zip\n'
        '    node "$PREPARATION_SOURCE_ROOT/stellar/scf-starforge-20261009/sf30-seller-sdk/data-preparation/managed.mjs" '
        '--workspace /ABSOLUTE/PRIVATE/new-customer --port 0\n\n'
        'Open the private link printed by the actual listener. Applications, the original Inputs, Recipes, '
        'Results and Handover browser, the typed client and 21 merchant tools share the native saved state.\n\n'
        '## Closed work and original inputs\n\n'
        'operator/ and customer/ contain each complete closed native workspace when created, including '
        'original source bytes, SQLite state, result editions and empty native directories. Keep each tree '
        'together. The original native recover command can inspect an interrupted run before its selected '
        'rerun. Complete downloads and merchant-dataset/ remain independently usable.\n\n'
        'original-package.zip is the exact unchanged original case archive; original-project.zip is its '
        'retained inner project. files.json binds every delivered file and directory. receiving-source.json '
        'identifies all 35 complete native source leaves and the receiving driver by their exact hashes.\n\n'
        '## Maintained product\n\n'
        'https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/tree/'
        +source_manifest['sourceCommit']+'/products/data-preparation\n\n'
        'Use selection data-preparation-workspace and its operating guide for the installed Applications, '
        'merchant configuration and complete customer commands. This selected source includes the original '
        'owners’ current COUNT(*) selected-view correction.\n'
    )
    write(directory/'START_HERE.md', guide.encode())
    output = directory/(title+('_Customer.zip' if completed else '_Checkpoint.zip'))
    selected = [directory/name for name in ['START_HERE.md', 'original-package.zip',
        'original-project.zip', 'original-manifest.json', 'receiving-source.json', 'native-process.json']]
    selected.append(report)
    for path in [result_path, identity_path]:
        if path.is_file():
            selected.append(path)
    for folder in ['operator', 'customer', 'downloads', 'merchant-dataset']:
        path = directory/folder
        if path.is_dir():
            selected.append(path)
            selected.extend(sorted(path.rglob('*')))
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
        'archive': str(output), 'archiveBytes': output.stat().st_size,
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
        request_path = directory/'library-save-request.json'
        saved_path = directory/'library-save-result.json'
        receipt_path = directory/'library-save-receipts.jsonl'
        provider_requests = directory/'library-provider-requests'
        write(request_path, (json.dumps(request)+'\n').encode())
        worker = """import sys
from pathlib import Path
helpers=Path(sys.argv[1]).resolve()
sys.path.insert(0,str(helpers))
from native_library_delivery import _worker
sys.exit(_worker(helpers,Path(sys.argv[2]),Path(sys.argv[3]),Path(sys.argv[4]),
    Path(sys.argv[5]),Path(sys.argv[6]),upload_mode="returned-put"))
"""
        saved = subprocess.run([sys.executable, '-c', worker, str(helpers), str(request_path),
            str(saved_path), str(receipt_path), str(directory), str(provider_requests)],
            text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=300)
        write(directory/'library-save-stdout.txt', saved.stdout.encode())
        write(directory/'library-save-stderr.txt', saved.stderr.encode())
        for stream in [saved.stdout, saved.stderr]:
            for line in stream.splitlines():
                if line.startswith('__OPENAI_LIBRARY_FILE_WRITE_RECEIPT_V1__='):
                    print(line, file=sys.stderr, flush=True)
        if saved_path.is_file():
            print(saved_path.read_text(), end='', flush=True)
        if saved.returncode:
            raise RuntimeError('The complete closed customer files remain in their receiving directory; saving did not finish')
    return 0 if completed else 1

if __name__ == '__main__':
    sys.exit(main())
