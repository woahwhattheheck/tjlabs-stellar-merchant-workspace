#!/usr/bin/env python3
"""MIT. Joined native application exercise; creates only its requested new directory."""
from pathlib import Path
import sys,json,hashlib,tempfile,shutil,sqlite3,time,os
ROOT=Path(__file__).parent
SRC=ROOT
sys.path.insert(0,str(SRC))
from dbt_core import Project,parse_json,literal
from dbt_store import ProjectError
from dbt_portable import export_project,receive_project
from operations import invoke

def checkerror(code, f):
    try:f()
    except ProjectError as e:assert e.code==code,(code,e.code,str(e))
    else:raise AssertionError(code)

def main():
    import argparse
    parser=argparse.ArgumentParser(description='One joined native artifact/result/transfer operation using authored local contract inputs')
    parser.add_argument('--work', required=True, type=Path, help='New output directory; existing directories are never deleted')
    args=parser.parse_args()
    tmp=args.work.absolute();tmp.mkdir(parents=True,exist_ok=False)
    def meta(kind,v,inv):return dict(dbt_schema_version=f'https://schemas.getdbt.com/dbt/{kind}/v{v}.json',dbt_version='1.11.0',generated_at='2026-10-12T13:00:00Z',invocation_id=inv,project_name='local_acceptance')
    def body(name,value):
        path=tmp/name;path.write_text(json.dumps(value,ensure_ascii=False));return path
    def node(uid,typ,name,dep=[],sql='select 1'):
        return dict(unique_id=uid,resource_type=typ,name=name,package_name='local_acceptance',database='local',schema='main',alias=name,relation_name=f'"local"."main"."{name}"',raw_code=sql,compiled_code=sql,description='<script>window.bad=true</script> & reviewed',columns={'total':{'name':'total','description':'Exact original total','data_type':'DECIMAL(38,9)'}},depends_on={'nodes':dep,'macros':[]})
    ids=['source.local.input','model.local.stage','model.local.report','test.local.check','model.local.removed','macro.local.clean']
    resources={u:node(u,u.split('.')[0],u.split('.')[-1]) for u in ids}
    resources[ids[1]]['depends_on']['nodes']=[ids[0]]
    resources[ids[2]]['depends_on']['nodes']=[ids[1]]
    resources[ids[2]]['depends_on']['macros']=[ids[5]]
    resources[ids[3]]['depends_on']['nodes']=[ids[2]]
    resources[ids[5]]['macro_sql']='{% macro clean() %}select 1{% endmacro %}'
    mf={'metadata':meta('manifest',12,'build-a'),'nodes':{u:v for u,v in resources.items() if not u.startswith(('source.','macro.'))},'sources':{ids[0]:resources[ids[0]]},'macros':{ids[5]:resources[ids[5]]},'parent_map':None,'child_map':None,'disabled':None}
    p=Project(tmp/'original',create=True,title='Local dbt project acceptance')
    m=p.import_file(body('manifest-a.json',mf))
    catalog={'metadata':meta('catalog',1,'docs-a'),'nodes':{ids[2]:{'unique_id':None,'metadata':{'name':'report','schema':'main','database':'local','type':'BASE TABLE','comment':None},'columns':{'total':{'name':'total','index':1,'type':'DECIMAL(38,9)','comment':None}},'stats':{'count':{'value':9007199254740993}}}},'sources':{}}
    cat=p.import_file(body('catalog.json',catalog))
    runs={'metadata':meta('run-results',6,'run-a'),'results':[dict(unique_id=ids[1],status='success',execution_time=0.123,adapter_response={'rows_affected':9007199254740993}),dict(unique_id=ids[3],status='fail',failures=2),dict(unique_id='model.other.missing',status='skipped')]}
    run=p.import_file(body('run_results.json',runs))
    fresh={'metadata':meta('freshness',0,'fresh-a'),'results':[dict(unique_id=ids[0],status='Warn',resource_type='source',max_loaded_at='2026-10-12T12:00:00Z'),dict(unique_id=ids[2],status='Error',resource_type='model')]}
    fr=p.import_file(body('freshness.json',fresh))
    e1=p.create_edition(title='Baseline',manifest=m['id'],catalog=cat['id'],runs=[run['id']],freshness=[fr['id']],request_id='edition-one')
    mf2=json.loads(json.dumps(mf));del mf2['nodes'][ids[4]];mf2['nodes'][ids[1]]['raw_code']='select total * 2 from input';mf2['nodes'][ids[1]]['compiled_code']='select total * 2 from main.input';mf2['metadata']['invocation_id']='build-b'
    m2=p.import_file(body('manifest-b.json',mf2))
    e2=p.create_edition(title='Candidate',manifest=m2['id'],catalog=cat['id'],runs=[run['id']],freshness=[fr['id']],request_id='edition-two')
    assert p.create_edition(title='Candidate',manifest=m2['id'],catalog=cat['id'],runs=[run['id']],freshness=[fr['id']],request_id='edition-two')['id']==e2['id']
    assert '9007199254740993' in p.node(e1['id'],ids[1])['outcomes'][0]['source_json']
    assert p.node(e1['id'],ids[4])['outcomes']==[]
    diff=p.compare(e1['id'],e2['id']);assert ids[3] in diff['affected'] and ids[4] in diff['affected']
    rev=dict(name='Delivery',edition=e2['id'],baseline=e1['id'],selection=diff['affected'],decisions={ids[1]:{'status':'correction-proposed','note':'Review SQL with warehouse owner','proposed_code':'select total from input'}},reviewer='Local operator',note='Native local acceptance fixtures',request_id='review-one')
    r=p.save_review(**rev);assert p.save_review(**rev)==r
    checkerror('REVIEW_CONFLICT',lambda:p.save_review(**{**rev,'request_id':'conflict'}))
    db=sqlite3.connect(tmp/'local-result.sqlite');db.execute('create table totals(id integer,total text)');db.executemany('insert into totals values(?,?)',[(1,'9007199254740993'),(2,'0.123456789123456789')]);db.commit()
    result=tmp/'result.csv';result.write_text('id,total\n'+''.join(f'{a},{b}\n' for a,b in db.execute('select id,total from totals order by id')));db.close()
    sql=tmp/'query.sql';sql.write_text('select id,total from totals order by id')
    provenance=body('provenance.json',{'schema':'local.sqlite.query-result.v1','engine':sqlite3.sqlite_version,'rows':2})
    binding=p.bind_result(edition=e2['id'],uid=ids[2],file=str(result),query_file=str(sql),provenance_file=str(provenance),source_kind='local-sqlite-acceptance',original_request_id='native-sqlite-result',expected_sha=hashlib.sha256(result.read_bytes()).hexdigest(),request_id='bind-one')
    for fmt in ['json','csv','html']:
        data,mime=p.report(e2['id'],r['id'],fmt);(tmp/f'review.{fmt}').write_bytes(data);assert len(data)>500
    assert b'<script>window.bad=true</script>' not in (tmp/'review.html').read_bytes()
    export=export_project(p,str(tmp/'project.zip'))
    original_status=p.status();shutil.rmtree(p.root)
    received=receive_project(export['path'],str(tmp/'received'),export['sha256'])
    reopened=Project(tmp/'received');assert reopened.status()['counts']==original_status['counts'];assert reopened.review(r['id'])==r;assert reopened.node(e2['id'],ids[2])['results'][0]['id']==binding['id']
    nextrev=reopened.save_review(**{**rev,'request_id':'review-two','expected_revision':1,'note':'Edited after the original source directory was removed'})
    assert nextrev['revision']==2
    assert receive_project(export['path'],str(tmp/'received'),export['sha256'])['recovered']
    output={'state':'complete','fixture':'authored local contract + native SQLite result','counts':reopened.status()['counts'],'edition':e2['id'],'baseline':e1['id'],'review':nextrev['id'],'sha256':export['sha256'],'bytes':export['bytes'],'project':str(reopened.root)}
    (tmp/'result.json').write_text(json.dumps(output,indent=2));print(json.dumps(output,indent=2))
if __name__=='__main__':main()
