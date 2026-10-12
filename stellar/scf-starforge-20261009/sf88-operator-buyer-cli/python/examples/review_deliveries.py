#!/usr/bin/env python3
"""One complete Python customer review journey over the original native engine.

Inputs are authored local examples, not customer purchases. The actual comparison,
review/return writers, file receiver and restart behavior are production code.
A fresh private output directory retains the complete operated result and examples.
"""
from __future__ import annotations
import argparse
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import threading

from stellar_forge_buyer.review_library import ResourceLibrary, ReviewError, ReviewTransferError


def sha(value):
    return hashlib.sha256(value).hexdigest()


def check(condition, detail):
    if not condition:
        raise RuntimeError(detail)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--checkout', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--rows', type=int, default=100000)
    args = parser.parse_args()
    checkout, root = args.checkout.resolve(), args.out.absolute()
    if root.exists() or root.is_symlink():
        raise RuntimeError('Select a new private output directory; existing examples are preserved.')
    if not 2 <= args.rows <= 1000000:
        raise RuntimeError('rows must be between 2 and 1000000')
    root.mkdir(mode=0o700, parents=True)
    started = time.monotonic()
    source = root / 'sender'
    files, output = source / 'files', root / 'delivered'
    files.mkdir(mode=0o700, parents=True)
    source.chmod(0o700)
    output.mkdir(mode=0o700)
    jobs, original = [], {}
    def add(name, body, content_type):
        raw = body.encode('utf8')
        target = files / name
        target.write_bytes(raw)
        target.chmod(0o600)
        original[name] = {'bytes': len(raw), 'sha256': sha(raw)}
        jobs.append({'schema': 'stellar-forge.sf88.buyer-inbox.v1',
            'id': sha(name.encode()), 'state': 'COMPLETE',
            'configSha256': sha((name+'-config').encode()),
            'createdAt': '2026-10-12T00:00:00.000Z',
            'operation': {'intentId': name, 'method': 'GET', 'url': 'https://fixture.invalid/editions'},
            'outcome': {'intentId': name, 'mode': 'ORIGINAL_OPERATOR_APPROVED_BUYER_ATTEMPT',
                'status': 'COMPLETE', 'httpStatus': 200,
                'responseFile': {'status': 'SAVED', 'path': str(target), 'bytes': len(raw),
                                 'sha256': sha(raw), 'contentType': content_type}}})
    add('before.json', '{"amount":9007199254740993,"unit":"kg","quality":true,"notes":"old"}', 'application/json')
    add('after.json', '{"amount":9007199254740995,"unit":"g","quality":false,"notes":"<script>literal</script>"}', 'application/json')
    add('before.csv', 'id,amount,note\n'+''.join(f'{i},9007199254740993,original row {i}\n' for i in range(args.rows)), 'text/csv')
    add('after.csv', 'note,amount,id\n'+''.join(f'original row {i},{9007199254740995 if i==args.rows-1 else 9007199254740993},{i}\n' for i in reversed(range(args.rows))), 'text/csv')
    snapshot = source / 'snapshot.json'
    snapshot.write_text(json.dumps(jobs), encoding='utf8')
    snapshot.chmod(0o600)
    summary = {'schema': 'stellar-forge.sf88.python-review-journey.v1',
               'inputKind': 'AUTHORED_LOCAL_EXAMPLES', 'originalFiles': original,
               'rowsPerCsv': args.rows, 'checks': [], 'sourceCheckout': str(checkout)}
    def passed(name):
        summary['checks'].append(name)
        print(name, file=sys.stderr, flush=True)
    handles = []
    def opened(state, *, receiver=False, **kw):
        cls = ResourceLibrary.receiver if receiver else ResourceLibrary
        library = cls(checkout=checkout, state=state, **kw)
        handles.append(library)
        return library
    try:
        maker = opened(source / 'library', kind='snapshot', source=snapshot, roots=[files])
        summary['node'] = maker.runtime['node']
        scan = maker.scan()
        resources = {r['name']: r for r in maker.iter_resources(page_size=2)}
        check(scan['resourceCount']==4 and len(resources)==4, 'complete original resource scan')
        before = resources['before.json']
        annotation = dict(expected_revision=0,operation_id='review-example-annotation',note='Source selected for independent review.',tags=['example'],starred=True)
        annotated = maker.annotate(before['id'], **annotation)
        check(maker.annotate(before['id'], **annotation)==annotated, 'annotation replay')
        before = maker.resource(before['id'])
        members = [{'id': before['id'], 'sha256': before['sha256'], 'annotationRevision': before['annotation']['revision']}]
        collection = maker.save_collection(collection_id='python-example', name='Independent review', members=members,
            expected_revision=0, operation_id='review-example-collection')
        check(maker.collection('python-example')['revision']==1, 'saved original collection')
        check(maker.collection_history('python-example')['total']==1, 'collection history')
        maker.export_resource_review(output/'resources.json')
        passed('native source, paged resources, annotation replay and collection')
        csv_start=time.monotonic()
        csv=maker.compare(resources['before.csv']['id'],resources['after.csv']['id'],
            operation_id='python-csv-review',format='csv',key_columns=['id'])
        check(csv.observed['state']=='COMPLETE', repr(csv.observed))
        csv_changes=list(csv.iter_changes(page_size=1))
        check(len(csv_changes)==1, 'all-row keyed comparison should contain exactly one change')
        summary['csvComparison']={'id':csv.id,'elapsedSeconds':round(time.monotonic()-csv_start,3), 'changes':csv_changes}
        csv.export(output/'csv-review.json')
        passed('complete keyed CSV comparison with reversed row and column order')
        comparison=maker.compare(resources['before.json']['id'],resources['after.json']['id'],operation_id='python-json-review')
        check(comparison.observed['state']=='COMPLETE', repr(comparison.observed))
        changes={row['path']:row for row in comparison.iter_changes(page_size=2)}
        check(len(changes)==4 and changes['/amount']['after']['literal']=='9007199254740995','original exact number preserved')
        target=changes['/amount']['id']
        comparison.decide(target=target,expected_revision=0,operation_id='baseline-review',status='FOLLOW_UP',actor='Initial reviewer',note='Confirm the exact quantity.')
        base=comparison.export(output/'base-review.json')
        comparison_id=comparison.id
        check(maker.verify_review(base.path)['changes']==4,'native handover verifier')
        passed('exact-number comparison, paged changes and original report verification')
        stop_transfer=threading.Event()
        def pause(progress):
            if progress.committed_bytes>=131072:
                stop_transfer.set()
        try:
            maker.download_resource(resources['before.csv']['id'],output/'before.csv',chunk_bytes=65536,progress=pause,cancel_event=stop_transfer)
            raise RuntimeError('transfer interruption was not exercised')
        except ReviewTransferError as error:
            check(error.progress.committed_bytes==131072,'persisted exact transfer cursor')
            summary['interruptedTransferBytes']=error.progress.committed_bytes
        maker.close()
        maker=opened(source/'library')
        received=maker.download_resource(resources['before.csv']['id'],output/'before.csv',chunk_bytes=65536)
        check(received.resumed_from==131072 and received.sha256==original['before.csv']['sha256'],'same-file continuation')
        check(sha(received.path.read_bytes())==received.sha256,'complete native resource file')
        again=maker.download_resource(resources['before.csv']['id'],output/'before.csv')
        check(again.sha256==received.sha256, 'completed file receiving replay')
        summary['resourceTransfer']=asdict(received)
        # Retaining a Node owner makes asynchronous comparison a real operation.
        interrupted=maker.compare(resources['before.csv']['id'],resources['after.csv']['id'],
            operation_id='python-worker-recovery',format='csv',key_columns=['id'],max_changes=64,wait=False)
        worker_id=interrupted.id
        maker._transport.process.kill();maker._transport.process.wait();maker.close()
        maker=opened(source/'library')
        interrupted=maker.comparison(worker_id)
        check(interrupted.observed['state']=='INTERRUPTED',repr(interrupted.observed))
        resumed=interrupted.resume(operation_id='python-worker-resume')
        check(resumed['state']=='COMPLETE' and resumed['id']==worker_id,'same native worker recovery')
        cancelled=maker.compare(resources['before.csv']['id'],resources['after.csv']['id'],
            operation_id='python-worker-cancel',format='csv',key_columns=['id'],max_changes=65,wait=False)
        cancelled.cancel();cancelled.wait()
        check(cancelled.inspect()['state']=='CANCELLED','native worker cancellation')
        check(cancelled.resume(operation_id='python-cancelled-resume')['state']=='COMPLETE','native cancelled worker recovery')
        summary['workerRecovery']={'interruptedComparisonId':worker_id,'cancelledComparisonId':cancelled.id}
        maker.close()
        shutil.rmtree(source)
        passed('interrupted original-file receiving, killed/cancelled worker recovery and source removal')
        local=opened(root/'local',receiver=True)
        remote=opened(root/'remote',receiver=True)
        lc=local.import_review(base.path,operation_id='receive-base',expected_sha256=base.sha256)
        rc=remote.import_review(base.path,operation_id='receive-base',expected_sha256=base.sha256)
        check(lc.id==comparison_id and rc.id==comparison_id,'original comparison identity')
        rc.decide(target=changes['/unit']['id'],expected_revision=0,operation_id='remote-unit',status='ACCEPT',actor='Receiving reviewer',note='Unit change reviewed.')
        compatible=rc.export(output/'compatible-review.json')
        updated=local.import_review(compatible.path,operation_id='compatible-return')
        check(updated.observed['receiving']['application']['appendedDecisions']==1,'compatible reviewer history')
        older=local.import_review(base.path,operation_id='older-return')
        check(older.observed['receiving']['application']['appendedDecisions']==0,'older history retained')
        lc.decide(target=target,expected_revision=1,operation_id='local-amount',status='REJECT',actor='Original reviewer',note='Keep original quantity until reconciled.')
        rc.decide(target=target,expected_revision=1,operation_id='remote-amount',status='ACCEPT',actor='Receiving reviewer',note='Exact value 9007199254740995 is correct.')
        rc.decide(target=changes['/quality']['id'],expected_revision=0,operation_id='remote-quality',status='FOLLOW_UP',actor='Receiving reviewer',note='Inspect quality independently.')
        incoming=rc.export(output/'incoming-review.json')
        before_history=lc.history()
        ret=local.stage_return(incoming.path,operation_id='stage-return',expected_sha256=incoming.sha256)
        plan=ret.inspect()
        check(plan['counts']['conflicts']==1 and plan['counts']['appendableDecisions']==1,repr(plan))
        check(lc.history()==before_history,'staging must not partially append compatible decisions')
        check(len(list(ret.iter_targets(page_size=1)))>1,'complete target iteration')
        passed('compatible, older and divergent reviewer receiving with atomic staging')
        first_choice=dict(target=target,plan_sha256=plan['planSha256'],expected_revision=0,
            operation_id='durable-choice',choice='TAKE_INCOMING',actor='Resolving reviewer',note='The incoming quantity matches the reviewed edition.')
        saved_choice=ret.choose(**first_choice)
        # Stop only the Node process owned by this client after its committed reply.
        local._transport.process.kill()
        local._transport.process.wait()
        local.close()
        local=opened(root/'local')
        lc=local.comparison(comparison_id)
        ret=local.review_return(ret.id)
        check(ret.choose(**first_choice)==saved_choice,'durable original choice after killed native owner')
        lc.decide(target=changes['/notes']['id'],expected_revision=0,operation_id='concurrent-notes',status='FOLLOW_UP',actor='Original reviewer',note='Retain later notes review.')
        try:
            ret.apply(plan_sha256=plan['planSha256'],operation_id='stale-apply')
            raise RuntimeError('stale plan applied')
        except ReviewError as error:
            check(error.code=='REVIEW_RETURN_PLAN_CHANGED',error.code)
        plan=ret.inspect()
        ret.choose(**{**first_choice,'plan_sha256':plan['planSha256'],'expected_revision':1,'operation_id':'updated-choice'})
        applied=ret.apply(plan_sha256=plan['planSha256'],operation_id='apply-once')
        check(ret.apply(plan_sha256=plan['planSha256'],operation_id='apply-once')==applied,'lost-response application replay')
        check(applied['appendedDecisions']==2 and applied['resolvedTargets']==1,'resolved and appended histories')
        amount_history=lc.history(target=target)
        check(len(amount_history)==3 and amount_history[-1]['status']=='ACCEPT','local history retained, incoming decision applied')
        check(ret.decision_history(target=target,side='incoming')['total']==2,'whole original incoming history')
        check(ret.choice_history(target=target)['total']==2,'whole resolution-choice history')
        original_return=ret.export_original(output/'original-return.json')
        check(original_return.sha256==incoming.sha256,'original received review exported byte-for-byte')
        for fmt in ('json','csv','html'):
            report=lc.export(output/f'accepted-review.{fmt}',format=fmt)
            check(report.bytes>0 and sha(report.path.read_bytes())==report.sha256,'complete report '+fmt)
        accepted=output/'accepted-review.json'
        passed('durable choices, stale-plan rejection, original journal reconciliation and apply replay')
        recipient=opened(root/'recipient',receiver=True)
        accepted_case=recipient.import_review(accepted,operation_id='accepted-receive')
        repeated=recipient.import_review(incoming.path,operation_id='already-resolved-return')
        check(repeated.observed['receiving']['application']['appendedDecisions']==0,'portable resolution replay')
        check(repeated.observed['receiving']['counts']['alreadyResolved']==1,'portable original resolution provenance')
        accepted_case.decide(target='*',expected_revision=0,operation_id='recipient-case-review',status='FOLLOW_UP',actor='Independent operator',note='Received complete review and retained original source file.')
        accepted_case.export(output/'recipient-review.json')
        recipient.close()
        recipient=opened(root/'recipient')
        check(recipient.comparison(comparison_id).history(target='*')[-1]['note'].startswith('Received complete'),'editable independent reopen')
        passed('source-independent receiving, retained reconciliation and editable reopening')
        # Both other user-selectable resolution modes use the original native writer.
        for choice,status in [('KEEP_LOCAL','REJECT'),('CUSTOM','FOLLOW_UP')]:
            left=opened(root/choice.lower(),receiver=True)
            right=opened(root/(choice.lower()+'-remote'),receiver=True)
            left_case=left.import_review(base.path,operation_id='base')
            right_case=right.import_review(base.path,operation_id='base')
            left_case.decide(target=target,expected_revision=1,operation_id='left',status='REJECT',actor='Local reviewer',note='Local branch.')
            right_case.decide(target=target,expected_revision=1,operation_id='right',status='ACCEPT',actor='Remote reviewer',note='Remote branch.')
            path=right_case.export(output/(choice.lower()+'-incoming.json')).path
            choice_return=left.stage_return(path,operation_id='return')
            plan=choice_return.inspect()
            choice_return.choose(target=target,plan_sha256=plan['planSha256'],expected_revision=0,operation_id='choose',choice=choice,
                actor='Resolving reviewer',note='Retain the selected reviewed outcome.',status='FOLLOW_UP' if choice=='CUSTOM' else None)
            choice_return.apply(plan_sha256=plan['planSha256'],operation_id='apply')
            check(left_case.history(target=target)[-1]['status']==status,choice)
            left_case.export(output/(choice.lower()+'-review.json'))
            left.close();right.close()
        passed('KEEP_LOCAL, TAKE_INCOMING and CUSTOM resolutions on original native engine')
        local.close()
        command=[sys.executable,'-m','stellar_forge_buyer.review_cli','--checkout',str(checkout),'--state',str(root/'local'),'return','show',ret.id]
        cli=subprocess.run(command,capture_output=True,text=True,timeout=30)
        check(cli.returncode==0,cli.stderr)
        check(json.loads(cli.stdout)['state']=='APPLIED','fresh-process CLI return')
        summary.update(status='PASS',comparisonId=comparison_id,returnId=ret.id,application=applied,
            freshProcessCli=json.loads(cli.stdout),elapsedSeconds=round(time.monotonic()-started,3),
            completedAt=datetime.now(timezone.utc).isoformat(),outputDirectory=str(root))
        passed('fresh-process command-line receiving of the same applied return')
    finally:
        for handle in reversed(handles):
            handle.close()
    (root/'journey.json').write_text(json.dumps(summary,indent=2,default=str)+'\n',encoding='utf8')
    (root/'journey.json').chmod(0o600)
    print(json.dumps(summary,indent=2,default=str))
    return 0


if __name__=='__main__':
    raise SystemExit(main())
