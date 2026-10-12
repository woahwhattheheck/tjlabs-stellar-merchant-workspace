#!/usr/bin/env python3
"""MIT. One complete local customer journey using documented example inputs."""
from __future__ import annotations
import argparse
import csv
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from preparation import Workspace,dumps,PreparationError,digest
from transfer import export_workspace,receive_workspace,merchant_delivery,result_report


def require(condition,message):
    if not condition: raise RuntimeError(message)


def run(destination:Path,rows:int):
    if destination.exists(): raise RuntimeError('Choose a new exercise directory')
    destination.mkdir(parents=True)
    inputs=destination/'inputs';inputs.mkdir()
    accounts=[('A001','Central Supply','Midwest'),('A002','Harbor Services','East'),('A003','Mesa Engineering','West'),('A004','Rivière Design','East'),('A005','North District','Midwest'),('A006','Ridge Operations','West')]
    with (inputs/'accounts.jsonl').open('w') as out:
        for code,label,region in accounts: out.write(dumps({'account':code,'customer':label,'region':region,'reference':None if code=='A003' else '' if code=='A004' else 'Current'})+'\n')
    with (inputs/'orders.csv').open('w',newline='') as out:
        writer=csv.writer(out);writer.writerow(['order_id','account','amount','status'])
        for n in range(rows): writer.writerow([str(9007199254740993+n),accounts[n%6][0],f'{n%19+1}.{n%100:02d}','closed' if n%7 else 'open'])
    with (inputs/'credits.csv').open('w',newline='') as out:
        writer=csv.writer(out);writer.writerow(['account','credit']);writer.writerows((a[0],f'{i+1}.05') for i,a in enumerate(accounts))
    started=time.monotonic()
    ws=Workspace(destination/'workspace',create=True,label='Customer revenue preparation · demonstration')
    sources=[ws.import_file(inputs/'orders.csv','orders',label='October order ledger'),
             ws.import_file(inputs/'accounts.jsonl','accounts','jsonl',label='Customer directory'),
             ws.import_file(inputs/'credits.csv','credits',label='Approved customer credits')]
    sql='''WITH revenue AS (
  SELECT account, decimal_sum(amount) AS gross, count(*) AS order_count
  FROM orders WHERE status = :status GROUP BY account
)
SELECT a.customer, a.region, a.reference,
       r.order_count, r.gross,
       COALESCE(c.credit, '0.00') AS credits,
       decimal_sub(r.gross, COALESCE(c.credit, '0.00')) AS net
FROM revenue r
JOIN accounts a ON a.account = r.account
LEFT JOIN credits c ON c.account = r.account
ORDER BY a.region, a.customer'''
    recipe=ws.save_recipe('Closed orders by customer',sql,{s['alias']:s['id'] for s in sources},{'status':'closed'},note='Aggregate closed orders by customer, retain the customer region, and subtract each approved credit once. Demonstration inputs.')
    first=ws.execute(ws.enqueue(recipe['id'])['id']);require(first['status']=='COMPLETE',dumps(first))
    require(first['rows']==6,'Expected all six customer groups')
    page=ws.result_page(first['id'])
    require(any(row[2] is None for row in page['rows']) and any(row[2]=='' for row in page['rows']),'Null and empty semantics lost')
    import decimal
    expected={a[1]:decimal.Decimal(0) for a in accounts}
    for n in range(rows):
        if n%7: expected[accounts[n%6][1]]+=decimal.Decimal(f'{n%19+1}.{n%100:02d}')
    for index,account in enumerate(accounts): expected[account[1]]-=decimal.Decimal(f'{index+1}.05')
    require(all(decimal.Decimal(row[-1])==expected[row[0]] for row in page['rows']),'Exact aggregate totals differ')
    ws.review(first['id'],'accept','Example operator','Customer grouping and approved credit allocation reviewed for this example.')
    revised=ws.save_recipe('Open orders by customer',sql,{s['alias']:s['id'] for s in sources},{'status':'open'},id=recipe['id'],expected_revision=1,note='Separate open-order view. The original closed-order result remains unchanged.')
    second=ws.execute(ws.enqueue(revised['id'])['id']);require(second['status']=='COMPLETE','Second recipe edition failed')
    require(ws.get('runs',first['id'])['recipe']['parameters']['status']=='closed','Earlier run mutated')
    try: ws.save_recipe('Conflict',sql,{sources[0]['alias']:sources[0]['id']},{},id=recipe['id'],expected_revision=1)
    except PreparationError: pass
    else: raise RuntimeError('Concurrent recipe overwrite was accepted')
    # Keep operational checks separate from the customer demonstration workspace.
    customer_ws=ws
    ws=Workspace(destination/'operation-checks',create=True,label='Preparation operation checks')
    check_source=ws.import_file(inputs/'credits.csv','orders',label='Operation input')
    check_bindings={'orders':check_source['id']}
    # Operation cancellation interrupts the real SQLite virtual machine.
    endless=ws.save_recipe('Long query cancellation','WITH RECURSIVE x(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM x) SELECT sum(n) AS total FROM x',check_bindings)
    queued=ws.enqueue(endless['id']);worker=threading.Thread(target=ws.execute,args=(queued['id'],));worker.start()
    deadline=time.monotonic()+10
    while ws.get('runs',queued['id'])['status']!='RUNNING' and time.monotonic()<deadline: time.sleep(.01)
    ws.cancel(queued['id']);worker.join(10);require(not worker.is_alive(),'Cancellation did not stop native query')
    require(ws.get('runs',queued['id'])['status']=='CANCELLED','Cancellation state absent')
    # Read-only authorizer rejects control-table reads and write statements.
    for forbidden in ['SELECT * FROM sources','DELETE FROM orders','PRAGMA database_list',"SELECT load_extension('x')"]:
        bad=ws.save_recipe('Unavailable query',forbidden,check_bindings)
        rejected=ws.execute(ws.enqueue(bad['id'])['id']);require(rejected['status']=='FAILED','Unauthorized SQL was accepted: '+forbidden)
    # Actual process death, then reopening and re-running the same original recipe.
    child=subprocess.Popen([sys.executable,str(Path(__file__).with_name('cli.py')),'--workspace',str(ws.root),'run',endless['id']],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    deadline=time.monotonic()+10;interrupted=None
    while time.monotonic()<deadline:
        candidates=[r for r in ws.records('runs') if r['status']=='RUNNING']
        if candidates: interrupted=candidates[-1];break
        time.sleep(.01)
    require(interrupted is not None,'Native process never started');child.kill();child.communicate(timeout=10)
    restored=Workspace(ws.root);recovery=restored.recover();require(interrupted['id'] in recovery['recovered'],'Killed operation was not recoverable')
    same=restored.rerun(interrupted['id']);require(same['recipe']==interrupted['recipe'],'Rerun changed original inputs')
    restored.cancel(same['id']);restored.execute(same['id'])
    ws=customer_ws
    archive=export_workspace(ws,destination/'project.zip')
    receiving=receive_workspace(destination/'project.zip',destination/'received')
    received=Workspace(destination/'received')
    require(received.result_page(first['id'])==page,'Independent receiving changed result')
    newer=received.save_recipe('Received editable project',sql,{s['alias']:s['id'] for s in sources},{'status':'closed'})
    require(received.execute(received.enqueue(newer['id'])['id'])['status']=='COMPLETE','Received project is not editable')
    merchant=merchant_delivery(ws,first['id'],destination/'merchant')
    result_report(ws,first['id'],destination/'preparation-report.html')
    # Run the ORIGINAL dataset handler from this source checkout, not a substitute.
    native=str(Path(__file__).resolve().parent.parent/'dataset-cli.mjs')
    result=subprocess.run(['node',native,'--dataset',merchant['configuration']],capture_output=True,text=True)
    require(result.returncode==0,result.stderr);description=json.loads(result.stdout)
    require(description['rowCount']==6,'Native dataset handler changed row count')
    summary={'schema':'stellar-forge.data-preparation.exercise.v1','inputRows':rows+12,'sourceEditions':len(sources),
             'customerRows':6,'seconds':round(time.monotonic()-started,3),'workspace':str(ws.root),'received':receiving,
             'firstRun':first['id'],'recipe':recipe['id'],'originalDataset':description,'archive':archive,
             'completed':['exact three-source join','saved recipe editions','null and empty text','review history','native query cancellation',
                          'actual process-death recovery','read-only SQL','complete archive export','independent editable receive','original SF30 dataset handler']}
    (destination/'RESULT.json').write_text(dumps(summary)+'\n')
    print(dumps(summary));return summary


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--directory',required=True,type=Path);parser.add_argument('--rows',type=int,default=120000)
    args=parser.parse_args()
    if args.rows<42: parser.error('--rows must be at least 42')
    run(args.directory,args.rows)
