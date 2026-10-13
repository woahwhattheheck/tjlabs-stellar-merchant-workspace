"""MIT. Operate the complete original PIPE12 customer project in data-pipelines.

The input is an existing complete project, not a generated replacement. The
programme adopts every retained original, edits and executes two new editions,
receives unchanged native results explicitly, and independently reopens the
complete maintained project and customer handover.
"""
from __future__ import annotations
import argparse
import copy
import json
import time
import zipfile
from pathlib import Path

from engine import PipelineWorkspace, canonical
from delivery import receive_project, export_project, deliver_results, report
from preparation import digest


def run(original: Path, output: Path):
    start = time.monotonic()
    output.mkdir(parents=True, exist_ok=False)
    with zipfile.ZipFile(original) as archive:
        manifest = json.loads(archive.read('manifest.json'))
    # The original native archives, plans, results and review decisions are
    # reconciled by both receivers before the maintained SQLite journal commits.
    intake = receive_project(original, output/'workspace')
    workspace = PipelineWorkspace(output/'workspace')
    with workspace.connection() as db:
        snapshot = workspace.snapshot(db)
    assert len(snapshot['origins']) == 1
    origin = snapshot['origins'][0]
    assert origin['archiveSha256'] == digest(original)
    assert snapshot['definitions'] and snapshot['executions']
    originals = {r['id']: r for r in workspace.native.records('runs')}
    sources = {s['id']: s for s in workspace.native.records('sources')}
    recipes = {r['id']+':'+str(r['revision']): r for r in workspace.native.records('recipes')}
    reviews = workspace.native.records('reviews')
    mapped = {e['id']: e for e in snapshot['executions']}
    preserved = 0
    for old in origin['runs']:
        new = mapped['e_'+old['id'][2:]]
        assert new['status'] == old['status']
        for sid, stage in old['stages'].items():
            if stage['status']=='COMPLETE':
                assert new['stages'][sid]['nativeRun'] == stage['nativeRunId']
                assert workspace.stage_result(new['id'], sid)['files']['result.jsonl']['sha256'] == stage['resultSha256']
                preserved += 1
    # Continue the exact retained seven-stage customer project, changing only
    # its explicit multiplier. The original editions remain unchanged.
    candidates = [e for e in mapped.values() if e['status']=='COMPLETE' and 'priced' in e['stages']]
    if not candidates:
        raise AssertionError('The supplied original project has no completed priced customer workflow')
    previous = max(candidates, key=lambda e:(e['revision'],e['createdAt']))
    latest = workspace.definition(previous['pipelineId'])
    document = {k:copy.deepcopy(latest[k]) for k in ('label','description','inputs','stages','outputs')}
    priced = next(s for s in document['stages'] if s['id']=='priced')
    # Discover and preserve the original parameter name; do not replace SQL.
    if len(priced['parameters']) != 1:
        raise AssertionError('Expected the original single multiplier parameter')
    parameter = next(iter(priced['parameters']))
    priced['parameters'][parameter] = '1.15'
    first_plan = workspace.save(document,pipeline_id=latest['id'],expected_revision=latest['revision'])
    first = workspace.enqueue(first_plan['id'],'composition-first',revision=first_plan['revision'],reuse_execution=previous['id'])
    first = workspace.execute(first['id'])
    assert first['status']=='COMPLETE',first
    # A different exact preparation source is allowed to read the original
    # retained result but computes new work rather than silently reusing it.
    current_hash = digest(Path(__import__('preparation').__file__))
    assert first['nativeEngineSha256']==current_hash
    priced['parameters'][parameter] = '1.20'
    second_plan = workspace.save(document,pipeline_id=latest['id'],expected_revision=first_plan['revision'])
    second = workspace.enqueue(second_plan['id'],'composition-second',revision=second_plan['revision'],reuse_execution=first['id'])
    repeated = workspace.enqueue(second_plan['id'],'composition-second',revision=second_plan['revision'],reuse_execution=first['id'])
    assert repeated['id']==second['id']
    second = workspace.execute(second['id'])
    assert second['status']=='COMPLETE',second
    reused = [sid for sid,state in second['stages'].items() if state.get('reuseFrom')]
    assert set(reused)=={'closed','empty','enriched','regional','counts'},reused
    assert all(second['stages'][sid]['nativeRun']==first['stages'][sid]['nativeRun'] for sid in reused)
    assert second['stages']['priced']['nativeRun']!=first['stages']['priced']['nativeRun']
    assert second['stages']['delivery']['nativeRun']!=first['stages']['delivery']['nativeRun']
    assert second['stages']['empty']['rows']==0
    assert workspace.stage_result(second['id'],'empty')['columns']
    # Retain an actual review against the selected original native result.
    workspace.review(second['id'],'delivery','accept','Customer operator','Complete received pipeline continuation',expected_revision=0)
    customer = deliver_results(workspace,second['id'],output/'customer.zip')
    complete = export_project(workspace,output/'project.zip')
    report_file = report(workspace,second['id'],output/'report.html')
    receiving = receive_project(output/'project.zip',output/'recipient')
    recipient = PipelineWorkspace(output/'recipient')
    assert canonical(recipient.execution(second['id']))==canonical(second)
    with recipient.connection() as db:
        after = recipient.snapshot(db)
    assert canonical(after['origins'])==canonical(snapshot['origins'])
    for rid, native in originals.items():
        assert canonical(recipient.native.get('runs',rid))==canonical(native)
    for sid, source in sources.items():
        assert canonical(recipient.native.get('sources',sid))==canonical(source)
    for original_recipe in recipes.values():
        assert canonical(recipient.native.get('recipes',original_recipe['id'],original_recipe['revision']))==canonical(original_recipe)
    assert all(r in recipient.native.records('reviews') for r in reviews)
    # Independently edit a new edition and explicitly receive every unchanged
    # stage; the sender's plan history must remain at its prior revision.
    document['description'] += '\nRecipient continued this original project independently.'
    independent = recipient.save(document,pipeline_id=latest['id'],expected_revision=second_plan['revision'])
    resumed = recipient.enqueue(independent['id'],'recipient-continuation',reuse_execution=second['id'])
    resumed = recipient.execute(resumed['id'])
    assert resumed['status']=='COMPLETE',resumed
    assert all(s.get('reuseFrom') for s in resumed['stages'].values())
    assert workspace.definition(latest['id'])['revision']==second_plan['revision']
    result = {'originalArchive':str(original),'originalSha256':digest(original),
        'intake':intake,'originalPlans':len(origin['plans']),'originalExecutions':len(origin['runs']),
        'preservedCompleteStages':preserved,'preservedNativeRuns':len(originals),'preservedNativeSources':len(sources),
        'preservedNativeRecipes':len(recipes),'preservedOriginalReviews':len(reviews),
        'firstExecution':first['id'],'secondExecution':second['id'],'explicitReusedStages':reused,
        'customer':customer,'project':complete,'report':report_file,'receiving':receiving,
        'recipientExecution':resumed['id'],'recipientRevision':independent['revision'],
        'seconds':round(time.monotonic()-start,3)}
    (output/'RESULT.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('original',type=Path)
    parser.add_argument('output',type=Path)
    args=parser.parse_args();run(args.original.resolve(),args.output.resolve())
