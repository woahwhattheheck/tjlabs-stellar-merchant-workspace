#!/usr/bin/env python3
"""Operate one actual independent customer handover through the original HTTP service.

Requires the original complete review runtime. Uses a new output directory, serves
only loopback, retains full portable outputs, and closes every owned process.
"""
import argparse,json,os,sys,urllib.request,urllib.error,socket
from pathlib import Path
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--checkout',required=True,type=Path)
parser.add_argument('--input',required=True,type=Path)
parser.add_argument('--out',required=True,type=Path)
args=parser.parse_args()
P=args.checkout.resolve(strict=True)
if not args.out.is_absolute() or args.out.exists():parser.error('--out must be a new absolute directory')
if not args.input.is_absolute():parser.error('--input must be absolute')
sys.path.insert(0,str(P/'stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python'))
from stellar_forge_buyer.review_library import ResourceLibrary
from stellar_forge_buyer.review_browser import ReviewBrowser
from stellar_forge_buyer._review_transport import ReviewError
out=args.out
packet=args.input
result={}
with ResourceLibrary.receiver(checkout=P,state=out/'receiver') as library:
 case=library.import_review(packet,operation_id='browser-first-receive')
 # The imported original history remains the source of expected revisions.
 library.select_comparison(case.id)
 pid=library.pid
 browser=library.browser(page='comparisons',operation_id='first-browser')
 assert library.pid==pid
 assert browser.observed['state']=='RUNNING'
 assert '#' not in repr(browser) and 'url' not in browser.metadata()
 from urllib.parse import urlsplit
 parsed=urlsplit(browser.url);origin=browser.metadata()['origin'];token=parsed.fragment
 def api(path,method='GET',body=None,authenticated=True):
  headers={} if not authenticated else {'Authorization':'Bearer '+token}
  raw=None if body is None else json.dumps(body).encode()
  if body is not None:headers['Content-Type']='application/json'
  with urllib.request.urlopen(urllib.request.Request(origin+path,data=raw,headers=headers,method=method),timeout=10) as response:
   return response.status,response.read(),dict(response.headers)
 try:api('/api/status',authenticated=False);raise AssertionError('unauth accepted')
 except urllib.error.HTTPError as error:assert error.code==401
 status=json.loads(api('/api/status')[1]);assert {'/','/comparisons','/comparison-returns'} <= set(status['pages'])
 assets=['/','/app.js','/style.css','/comparisons','/comparison.js','/comparison.css','/comparison-returns','/comparison-returns.js','/comparison-returns.css']
 result['assets']={}
 for path in assets:
  code,raw,headers=api(path,authenticated=False)
  assert code==200 and raw
  result['assets'][path]={'bytes':len(raw),'type':headers['Content-Type']}
 cases=json.loads(api('/api/comparisons?offset=0&limit=20')[1]);assert cases['items'][0]['id']==case.id
 history=case.history(target='*')
 revision=max([r['revision'] for r in history] or [0])
 change={'target':'*','expectedRevision':revision,'operationId':'browser-edit-whole-case','status':'FOLLOW_UP','actor':'Receiving operator','note':'Received and edited through the original local review service.'}
 response=json.loads(api('/api/comparisons/'+case.id+'/decision','PATCH',change)[1])
 assert case.history(target='*')[-1]['note']==change['note']
 replay=json.loads(api('/api/comparisons/'+case.id+'/decision','PATCH',change)[1]);assert replay==response
 result['browserEditReplay']=True
 result['sameProcess']=pid
 # Real HTML/JSON/CSV downloads prepared by the native browser route.
 result['reports']={}
 import hashlib
 for format in ['json','csv','html']:
  descriptor=json.loads(api('/api/comparisons/'+case.id+'/download','POST',{'format':format})[1])
  path=descriptor['url'];path=path.removeprefix(origin)
  code,raw,_=api(path,authenticated=False)
  destination=out/('customer-review.'+format);destination.write_bytes(raw)
  result['reports'][format]={'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
 assert ReviewBrowser.start(library,page='comparisons',operation_id='first-browser').session_id==browser.session_id
 # Stop/restart keeps the library and comparison intact, rotates session credential.
 old=browser;first_url=old.url;first_id=old.session_id
 library.invoke('browser.stop',{'sessionId':first_id})
 assert library.browser_status()['state']=='STOPPED'
 successor=library.browser(operation_id='second-browser')
 assert successor.session_id!=first_id and successor.url!=first_url
 try:old.close();raise AssertionError('stale handle accepted')
 except ReviewError as e:assert e.code=='REVIEW_BROWSER_STALE_SESSION'
 assert successor.observed['state']=='RUNNING' and library.pid==pid
 result['staleHandleProtected']=True
 port=successor.metadata()['port']
 # Library close owns listener shutdown even if browser handle remains open.
 result['comparisonId']=case.id
with socket.socket() as sock:
 assert sock.connect_ex(('127.0.0.1',port))!=0
result['listenerClosedWithOwner']=True
with ResourceLibrary.receiver(checkout=P,state=out/'independent') as other:
 restored=other.import_review(out/'customer-review.json',operation_id='independent-receiving')
 assert restored.id==result['comparisonId']
 assert restored.history(target='*')[-1]['note']==change['note']
 result['independentlyEditable']=True
(out/'result.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
