"""One complete customer receiving and portable handover exercise."""
from __future__ import annotations
import base64, copy, datetime, hashlib, importlib.metadata, inspect, json, os
from pathlib import Path
import shutil, socket, subprocess, sys, threading, time, traceback, urllib.parse, urllib.request, uuid

ROOT=Path(sys.argv[1]); OUT=Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True)
sys.path.insert(0,str(ROOT))
from revecs_events.workspace import Workspace
from revecs_events.model import WorkspaceError, decode, digest, encode, error_details, project, now
from revecs_events.client import PaidReceiver, drain, ASSET, NETWORK
from revecs_events.delivery import export_workspace, restore_workspace, verify_archive
from revecs_events.operator import Operator
report={"schema":"revecs.events.native.v1","started":now(),"complete":False,"stages":[]}
def record(name,**value):
    row={"stage":name,"at":now(),**value};report["stages"].append(row)
    (OUT/"native-result.json").write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps(row,separators=(",",":")),flush=True)
def check(condition, message):
    if not condition:raise AssertionError(message)
def dump(path,value):path.write_text(json.dumps(value,indent=2)+"\n")
opened=[]
try:
    sample_body=(ROOT/"examples/provider-events-sample.json").read_bytes()
    meta_body=(ROOT/"examples/provider-meta.json").read_bytes()
    sample=decode(sample_body)
    public=Workspace(OUT/"provider-preview",create=True,preview=True,name="Biotech event preview")
    received=public.preview(sample_body,source_url="https://api.biotechcatalystsentinel.com/v1/events/sample")
    public.retain_public(url="https://api.biotechcatalystsentinel.com/v1/meta",body=meta_body,purpose="provider-meta",
                         headers={"Content-Type":"application/json"})
    public.set_watchlist(["XPRTN","XEXTD","XDUPE"])
    snapshot=public.snapshot(include_timelines=True)
    check(snapshot["events"]==6,"All six original provider events must be retained")
    cards={row["id"]:row for row in snapshot["catalysts"]}
    check(cards["990001"]["status"]=="Awaiting resubmission","The current CRL must survive a recovered stale filing")
    check(cards["990001"]["date"]=="2026-06-12","Stale recovery must not replace the served date")
    check(cards["990002"]["date"]=="2026-11-16" and cards["990002"]["vendor_repairs"]==1,"The provider correction must apply")
    check("XPRTN" in cards["990001"]["tickers"] and "XDUPE" in cards["990001"]["tickers"],"Co-filer and merged exposure must stay discoverable")
    check(cards["990003"]["withdrawn"] and cards["990003"]["merged_into"]=="990001","Merged record must point to its survivor")
    check(snapshot["fda_extensions"]==1 and snapshot["vendor_repairs"]==1,"FDA extensions and vendor repairs must remain separate")
    raw=[r for r in snapshot["responses"] if r["purpose"]=="public-preview"][0]
    check(public.body(raw["id"])==sample_body,"The entire provider sample must survive receiving")
    original_config=public.configuration
    public=Workspace(public.root);check(public.configuration==original_config,"Reopening must preserve workspace identity")
    replay=public.replay();check(replay["events"]==6,"Local replay must reconstruct all events")
    archive=export_workspace(public,OUT/"provider-preview.zip")
    moved=restore_workspace(OUT/"provider-preview.zip",OUT/"moved-provider-preview")
    reopened=Workspace(moved["workspace"])
    check(reopened.snapshot(include_timelines=True)["catalysts"]==public.snapshot(include_timelines=True)["catalysts"],"Moving must preserve the complete current state")
    check(reopened.body(raw["id"])==sample_body,"Moving must preserve the full original body")
    # A new public sample import deliberately begins a new complete edition.
    public.preview(sample_body,source_url="https://api.biotechcatalystsentinel.com/v1/events/sample",operation_key="preview-second-edition")
    check(len(public.editions())==2 and public.snapshot()["events"]==6,"A later sample must receive a fresh complete edition")
    check(public.snapshot(edition_id=public.editions()[1]["id"])["events"]==6,"The prior preview edition must remain available")
    record("complete_original_public_sample_and_portable_reopen",events=6,body_bytes=len(sample_body),
           body_sha256=digest(sample_body),meta_bytes=len(meta_body),archive=archive,replay=replay,
           cofilers=cards["990001"]["tickers"])

    operator=Operator(public).start();opened.append(operator)
    moved_operator=Operator(reopened).start();opened.append(moved_operator)
    dump(OUT/"browser-input.json",{"preview_url":operator.url,"moved_url":moved_operator.url,
        "offline_path":str(OUT/"moved-provider-preview/index.html"),"output":str(OUT),
        "original_sample_sha256":digest(sample_body)})
    node=os.environ.get("CODEX_PRIMARY_RUNTIME_NODE","/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node")
    browser=subprocess.run([node,str(ROOT/"native/browser.mjs"),str(OUT/"browser-input.json")],
                           capture_output=True,text=True,timeout=180)
    (OUT/"browser-stdout.log").write_text(browser.stdout);(OUT/"browser-stderr.log").write_text(browser.stderr)
    browser_result=json.loads((OUT/"browser-result.json").read_text()) if (OUT/"browser-result.json").exists() else {}
    check(browser.returncode==0 and browser_result.get("complete"),"Browser receiving and offline handover failed: "+browser.stderr[-800:])
    browser_archive=OUT/"browser-workspace.zip"
    if browser_archive.is_file():
        browser_check=verify_archive(browser_archive)
        check(browser_check["manifest"]["database"]["responses"]>=2,"Browser handover must retain every original response")
    record("original_preview_operator_desktop_phone_and_offline_handover",**browser_result)
    for item in opened:item.close()
    opened.clear()

    from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
    from eth_account import Account
    from eth_account.messages import encode_typed_data
    from x402.mechanisms.evm.signers import EthAccountSigner
    # This account belongs only to this local SDK/HTTP exercise and is never a customer payer.
    account=Account.from_key("0x"+"11"*32)
    recipient=Account.from_key("0x"+"22"*32).address
    original_signer=EthAccountSigner(account)
    signing_calls=[]
    class ObservedSigner:
        def __getattr__(self,key):return getattr(original_signer,key)
        def sign_typed_data(self,*args,**kwargs):
            bound=inspect.signature(original_signer.sign_typed_data).bind(*args,**kwargs)
            signature=original_signer.sign_typed_data(*args,**kwargs)
            captured=copy.deepcopy(dict(bound.arguments))
            domain=captured["domain"]
            domain_type=type(domain).__module__+"."+type(domain).__qualname__
            if not isinstance(domain,dict):
                captured["domain"]={"name":domain.name,"version":domain.version,
                    "chainId":domain.chain_id,"verifyingContract":domain.verifying_contract}
            captured["types"]={name:[{"name":f.name,"type":f.type} if not isinstance(f,dict) else f
                for f in fields] for name,fields in captured["types"].items()}
            captured["message"]={k:("0x"+v.hex() if isinstance(v,bytes) else v)
                for k,v in captured["message"].items()}
            signing_calls.append({"arguments":captured,"original_domain_type":domain_type,
                                  "signature":signature.hex() if isinstance(signature,bytes) else str(signature)})
            return signature
    signer=ObservedSigner()
    original_events=copy.deepcopy(sample["data"])
    # Complete examples extend the published vocabulary for restart, restoration,
    # same-date restatement, resumed review and an unfamiliar applied event.
    extended=copy.deepcopy(original_events)
    template=copy.deepcopy(original_events[0])
    def event(ident,kind,**fields):
        row=copy.deepcopy(template)
        row.update(event_id=ident,event_type=kind,source_quote="Local documented-contract receiving exercise.",
                   applied=False,date_changed=False,prior_date=None,new_date=None,accession=None,source_url=None,
                   detected_at="2026-10-12T21:00:00+00:00",filed_at=None,outcome=None,merged_into=None)
        row.update(fields);return row
    extended.append(event(990110,"new_date_assigned",new_date="2026-06-12",applied=True,date_changed=False))
    extended.append(event(990121,"new_date_assigned",new_date="2027-01-11",applied=True,date_changed=True))
    extended.append(event(990144,"future_provider_event",new_date="2027-02-15",applied=True,date_changed=True))
    restored=event(990190,"restored",catalyst_id=990003,drug_name="DUPLICATE RECORD",company="Duplicate company",ticker="XDUPE",tickers=["XDUPE"])
    extended.append(restored)
    latest=event(2**53+17,"new_date_assigned",catalyst_id=990003,drug_name="RESTORED CANDIDATE",company="Restored company",
                 ticker="XDUPE",tickers=["XDUPE"],new_date="2027-03-12",applied=True,date_changed=True)
    extended.append(latest)
    # The provider's authoritative fresh history can re-parent an old event while retaining its event ID.
    full_reconciled=copy.deepcopy(extended)
    server_state={"rows":original_events,"calls":[],"paid":[],"drop_next":False,"amount":50000,
                  "rejected":[],"nonces":set(),"public_meta":meta_body}
    class Handler(BaseHTTPRequestHandler):
        protocol_version="HTTP/1.1"
        def log_message(self,*_):pass
        def send_body(self,status,body,headers=None):
            self.send_response(status);self.send_header("Content-Type","application/json")
            self.send_header("Content-Length",str(len(body)))
            for k,v in (headers or {}).items():self.send_header(k,v)
            self.end_headers();self.wfile.write(body);self.wfile.flush()
        def do_GET(self):
            parsed=urllib.parse.urlsplit(self.path)
            if parsed.path=="/v1/meta":self.send_body(200,server_state["public_meta"]);return
            params=urllib.parse.parse_qs(parsed.query)
            check(parsed.path=="/v1/events","The SDK must request the original event route")
            since=int(params["since"][0]);limit=int(params["limit"][0])
            url="http://127.0.0.1:"+str(self.server.server_port)+self.path
            payment=self.headers.get("PAYMENT-SIGNATURE")
            server_state["calls"].append({"since":str(since),"limit":limit,"signed":bool(payment),"url":url})
            requirement={"scheme":"exact","network":NETWORK,"asset":ASSET,"amount":str(server_state["amount"]),
                         "payTo":recipient,"maxTimeoutSeconds":120,"extra":{"name":"USD Coin","version":"2"}}
            challenge={"x402Version":2,"resource":{"url":url,"description":"Complete event page","mimeType":"application/json"},
                       "accepts":[requirement]}
            if not payment:
                self.send_body(402,encode(challenge).encode(),{"PAYMENT-REQUIRED":base64.b64encode(encode(challenge).encode()).decode()})
                return
            try:
                payload=json.loads(base64.b64decode(payment))
                auth=payload["payload"]["authorization"]
                check(payload["accepted"]["network"]==NETWORK and payload["accepted"]["asset"].lower()==ASSET.lower(),"Original payload network/asset")
                check(auth["from"].lower()==account.address.lower() and auth["to"].lower()==recipient.lower(),"Original payer and payee")
                check(int(auth["value"])==server_state["amount"],"Original authorized amount")
                nonce=auth["nonce"];check(nonce not in server_state["nonces"],"A consumed payment authorization cannot be reused")
                server_state["nonces"].add(nonce)
                sign=signing_calls[-1]["arguments"]
                # Retain and verify the original signer's actual typed data without changing its scheme.
                domain=sign.get("domain");types=sign.get("types");message=sign.get("message")
                check(domain is not None and types is not None and message is not None,"Original signer typed-data call")
                typed=encode_typed_data(domain_data=domain,message_types=types,message_data=message)
                recovered=Account.recover_message(typed,signature=payload["payload"]["signature"])
                check(recovered.lower()==account.address.lower(),"The actual original SDK signature must recover the local payer")
                server_state["paid"].append({"since":str(since),"nonce":nonce,"amount":auth["value"],"recovered":recovered})
                eligible=[r for r in server_state["rows"] if r["event_id"]>since]
                selected=eligible[:limit]
                page={"data":selected,"meta":{"total":len(selected),"limit":limit,"next_since":selected[-1]["event_id"] if selected else since,"has_more":len(eligible)>limit}}
                body=encode(page).encode()
                settlement={"success":True,"transaction":"0x"+hashlib.sha256(nonce.encode()).hexdigest(),
                            "network":NETWORK,"payer":account.address}
                headers={"PAYMENT-RESPONSE":base64.b64encode(encode(settlement).encode()).decode()}
                if server_state["drop_next"]:
                    server_state["drop_next"]=False
                    self.send_response(200);self.send_header("Content-Type","application/json")
                    self.send_header("Content-Length",str(len(body)+300))
                    self.send_header("PAYMENT-RESPONSE",headers["PAYMENT-RESPONSE"]);self.end_headers()
                    partial=body[:max(1,len(body)//2)]
                    self.wfile.write(partial);self.wfile.flush()
                    self.connection.shutdown(socket.SHUT_RDWR);self.connection.close()
                    return
                self.send_body(200,body,headers)
            except Exception as error:
                server_state["rejected"].append(error_details(error))
                try:self.send_body(400,encode({"error":str(error)}).encode())
                except OSError:pass
    server=ThreadingHTTPServer(("127.0.0.1",0),Handler)
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    class Provider:
        def close(self):server.shutdown();server.server_close();thread.join(5)
    opened.append(Provider())
    origin="http://127.0.0.1:"+str(server.server_port)
    customer=Workspace(OUT/"sdk-customer",create=True,name="Customer receiving exercise",base=origin,limit=2,allow_loopback=True)
    with PaidReceiver(customer,signer=signer) as receiver:
        first=drain(customer,receiver,operation_key="original-sdk-first-two-pages",max_pages=2,max_amount=100000)
        check(first["run"]["state"]=="page_limit" and first["pages"]==2,"Two authorized complete pages")
        checkpoint=customer.editions()[0]["cursor"]
        check(checkpoint==990104,"The complete cursor must reach exactly the fourth event")
        before=len(server_state["calls"])
        repeat=drain(customer,receiver,operation_key="original-sdk-first-two-pages",max_pages=2,max_amount=100000)
        check(repeat["reused"] and len(server_state["calls"])==before,"Stable operation key must not send another request")
        server_state["drop_next"]=True
        try:drain(customer,receiver,operation_key="interrupted-paid-response",max_pages=1,max_amount=50000)
        except Exception:pass
        else:raise AssertionError("The local connection interruption must be observed")
        check(customer.editions()[0]["cursor"]==checkpoint,"The partial paid response cannot advance the cursor")
        partials=[r for r in customer.snapshot()["responses"] if r["status"]==200 and not r["complete"]]
        check(len(partials)==1,"The interrupted original response must remain available")
        check(partials[0]["length"]>0,"The actual received short prefix must be retained before the EOF length error")
        retry=drain(customer,receiver,operation_key="fresh-authorized-continuation",max_pages=3,max_amount=150000)
        check(retry["run"]["state"]=="caught_up" and customer.snapshot()["events"]==6,"Fresh authorized retry must finish the original history")
        check(server_state["paid"][-1]["nonce"]!=server_state["paid"][-2]["nonce"],"The retry needs a fresh original authorization")
        server_state["rows"]=extended[:7]
        drain(customer,receiver,operation_key="same-date-restatement",max_pages=1,max_amount=50000)
        check(next(c for c in customer.snapshot()["catalysts"] if c["id"]=="990001")["status"]=="Awaiting resubmission",
              "A same-date restatement cannot erase the CRL")
        server_state["rows"]=extended
        drain(customer,receiver,operation_key="restoration-and-forward-unknown",max_pages=5,max_amount=250000)
        view=customer.snapshot(include_timelines=True);states={c["id"]:c for c in view["catalysts"]}
        check(states["990001"]["date"]=="2027-02-15" and states["990001"]["status"]=="Upcoming","A new review and applied future type")
        check(not states["990003"]["withdrawn"] and states["990003"]["date"]=="2027-03-12","Restored catalyst becomes active")
        check(view["fda_extensions"]==1 and view["vendor_repairs"]==1,"Unknown event and vendor correction are not FDA extensions")
        check(view["editions"][0]["needs_reconcile"]==1,"Restoration must request complete re-receiving")
        check(any(e["event_id"]==str(2**53+17) for e in view["timelines"]["990003"]),"Large stable event ID must survive without JS rounding")
        current_id=view["selected_edition"]
        server_state["rows"]=full_reconciled
        beginning=drain(customer,receiver,operation_key="new-complete-edition-first-page",max_pages=1,max_amount=50000,refresh=True)
        check(customer.snapshot()["selected_edition"]==current_id,"Incomplete new history cannot replace the current edition")
        completed=drain(customer,receiver,operation_key="new-complete-edition-continuation",max_pages=10,max_amount=500000)
        check(completed["run"]["state"]=="caught_up" and customer.snapshot()["selected_edition"]!=current_id,"Complete new history must become current")
        check(customer.snapshot()["editions"][0]["needs_reconcile"]==0,"Complete authoritative drain resolves reconciliation")
        check(customer.snapshot(edition_id=current_id)["events"]==len(extended),"The original edition remains present")
        before_signatures=len(signing_calls);before_cursor=customer.editions()[0]["cursor"]
        server_state["amount"]=50001
        try:drain(customer,receiver,operation_key="challenge-over-page-allowance",max_pages=1,max_amount=100000,max_page_amount=50000)
        except Exception:pass
        else:raise AssertionError("An over-limit original challenge must be declined")
        check(len(signing_calls)==before_signatures and customer.editions()[0]["cursor"]==before_cursor,
              "A declined challenge must not sign or advance the cursor")
        server_state["amount"]=50000
    check(not server_state["rejected"],"Every accepted local payment must pass actual signature validation")
    check(importlib.metadata.version("x402")=="2.25.0","The published exact SDK is required")
    dump(OUT/"sdk-signing-requests.json",{"signer_calls":signing_calls,"http":server_state["calls"],"paid":server_state["paid"]})
    native_modules={}
    for module_name in ("x402","x402.http.clients.requests","x402.mechanisms.evm.signers","requests","eth_account"):
        module=__import__(module_name,fromlist=["__name__"])
        file=Path(inspect.getfile(module))
        native_modules[module_name]={"path":str(file),"bytes":file.stat().st_size,"sha256":digest(file.read_bytes())}
    record("original_published_sdk_signing_cursor_restart_and_full_reconciliation",sdk="2.25.0",
           original_modules=native_modules,provider_requests=len(server_state["calls"]),
           signed_requests=len(server_state["paid"]),unique_nonces=len(server_state["nonces"]),
           events=customer.snapshot()["events"],editions=len(customer.editions()),
           partial_response_bytes=partials[0]["length"])
    # Simulate an SDK error after the successful original body has been retained.
    server_state["rows"]=copy.deepcopy(extended)+[event(2**53+25,"corrected",catalyst_id=990002,
        drug_name="EXTENDIVIR",new_date="2027-03-29",applied=True,date_changed=True)]
    class PostBodyFailure(PaidReceiver):
        def fetch(self,attempt):
            super().fetch(attempt)
            raise RuntimeError("Documented native post-body SDK failure")
    with PostBodyFailure(customer,signer=signer) as receiver:
        try:drain(customer,receiver,operation_key="complete-response-then-sdk-error",max_pages=1,max_amount=50000)
        except RuntimeError:pass
        else:raise AssertionError("The original post-body error must remain visible")
    with customer._db() as db:
        saved=db.execute("SELECT * FROM attempts WHERE run='complete-response-then-sdk-error'").fetchone()
    check(saved["state"]=="received","The valid complete page must remain eligible for local apply")
    before=len(server_state["calls"])
    with customer.receiving():customer.recover_received()
    check(len(server_state["calls"])==before,"A failed SDK call's saved complete page must recover without a second payment")
    # Simulate an exit after an actual SDK response is durably received but before page application.
    server_state["rows"]=copy.deepcopy(server_state["rows"])+[event(2**53+31,"corrected",catalyst_id=990002,
        drug_name="EXTENDIVIR",new_date="2027-04-02",applied=True,date_changed=True)]
    with customer.receiving():
        run,_=customer.start_run("saved-success-before-application",max_pages=1,max_amount=50000,max_page_amount=50000)
        attempt=customer.prepare_attempt(run["id"])
        with PaidReceiver(customer,signer=signer) as receiver:response=receiver.fetch(attempt)
    before=len(server_state["calls"])
    after_exit=Workspace(customer.root)
    with after_exit.receiving():recovered=after_exit.recover_received()
    check(recovered==[attempt["id"]] and len(server_state["calls"])==before,"Complete crash-recovered response must apply without HTTP")
    after_exit.replay()
    case=export_workspace(after_exit,OUT/"complete-sdk-customer.zip")
    restored_case=restore_workspace(OUT/"complete-sdk-customer.zip",OUT/"received-sdk-customer")
    relocated=Workspace(restored_case["workspace"])
    check(relocated.verify()==after_exit.verify(),"The entire SDK receiving database must verify after moving")
    for original in after_exit.snapshot()["responses"]:
        check(relocated.body(original["id"])==after_exit.body(original["id"]),"Every complete/partial response must move exactly")
    cli=subprocess.run([sys.executable,"-B","-m","revecs_events","status",str(relocated.root),"--timelines"],
                       cwd=ROOT,capture_output=True,text=True)
    (OUT/"cli-status.json").write_text(cli.stdout);(OUT/"cli-status.stderr").write_text(cli.stderr)
    check(cli.returncode==0 and json.loads(cli.stdout)["events"]==len(server_state["rows"]),"Independent CLI must reopen complete moved state")
    record("saved_success_recovery_and_every_member_receiving",recovered_response=response,
           new_provider_requests=len(server_state["calls"])-before,archive=case,
           responses=after_exit.verify()["responses"],response_bytes=after_exit.verify()["body_bytes"],
           moved_events=relocated.snapshot()["events"])
    report["complete"]=True
except Exception as error:
    report["error"]=error_details(error)
    print(json.dumps({"event":"native_error","error":str(error)},separators=(",",":")),flush=True)
finally:
    if "server_state" in globals():
        dump(OUT/"sdk-native-server-history.json",{
            "http":server_state["calls"],"paid":server_state["paid"],
            "rejected":server_state["rejected"],"nonces":sorted(server_state["nonces"]),
            "signing_calls":signing_calls})
    for item in reversed(opened):
        try:item.close()
        except Exception as error:report.setdefault("cleanup_errors",[]).append(error_details(error));report["complete"]=False
    report["finished"]=now()
    dump(OUT/"native-result.json",report)
    print(json.dumps({"event":"native_complete","complete":report["complete"],"stages":len(report["stages"]),
                      "result":str(OUT/"native-result.json")},separators=(",",":")),flush=True)
raise SystemExit(0 if report["complete"] else 1)
