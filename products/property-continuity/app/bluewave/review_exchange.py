"""Assigned discrepancy review through the original property-continuity decision engine.
Complete original source and reviewer bytes stay in the existing Workspace blob store.
"""
import base64,copy,re,uuid
from .common import canonical,digest,sha,loads,require,identifier,text,sha_id,MAX_BLOB
from . import domain as D

ISSUE="bluewave.discrepancy-review-issue.v1"
RETURN="bluewave.discrepancy-review-return.v1"
COLLECTION="reviewExchanges"
KINDS=("review.issue","review.receive","review.adopt")
LIMITS={"findings":1000,"editions":1000,"documentBytes":MAX_BLOB,"fileBytes":MAX_BLOB,"draftEditorBytes":4*1024*1024,"responseBytes":MAX_BLOB}
NAMESPACE=uuid.UUID("8cbef1b8-781d-4a27-9320-4db9b6aa2360")
def _keys(value,keys,label):D._keys(value,keys,label)
def _copy(value):return copy.deepcopy(value)
def _b64(raw):return base64.b64encode(raw).decode("ascii")
def _unb64(value,maximum=MAX_BLOB):
    require(isinstance(value,str) and len(value)<=4*((maximum+2)//3),"FILE_LIMIT","Complete Base64 document exceeds its allowance.")
    try:raw=base64.b64decode(value,validate=True)
    except (ValueError,TypeError):D.fail("BASE64","Use complete canonical Base64 bytes.")
    require(len(raw)<=maximum and _b64(raw)==value,"BASE64","Use complete canonical Base64 within the documented capacity.")
    return raw
def _file_name(value):
    text(value,"Original filename",240)
    require(value not in (".","..") and "/" not in value and "\\" not in value and all(ord(c)>=32 for c in value),"FILENAME","Use a plain original basename.")
def _descriptor(value,read_blob,cache=None):
    _keys(value,("sha256","bytes","mediaType","name"),"Review file descriptor")
    _file_name(value["name"]);text(value["mediaType"],"Original media type",160)
    require("\r" not in value["mediaType"] and "\n" not in value["mediaType"],"MEDIA","Media type contains a line break.")
    return D._descriptor(value,read_blob,cache if cache is not None else {})
def _descriptor_for(raw,name,media):
    return {"sha256":sha(raw),"bytes":len(raw),"mediaType":media,"name":name}
def _enclosed(raw,name,media):
    return {**_descriptor_for(raw,name,media),"base64":_b64(raw)}
def _enclosed_files(items):
    require(isinstance(items,list),"FILES","Retain the complete review file inventory.")
    found={}
    for item in items:
        _keys(item,("sha256","bytes","mediaType","name","base64"),"Complete original review file")
        descriptor={k:v for k,v in item.items() if k!="base64"}
        raw=_unb64(item["base64"])
        _descriptor(descriptor,lambda key:raw)
        require(item["sha256"] not in found,"FILE_DUPLICATE","A review file identity is repeated.")
        found[item["sha256"]]=(descriptor,raw)
    require(sum(len(x[1]) for x in found.values())<=D.LIMITS["aggregateBlobBytes"],"FILE_LIMIT","Complete review files exceed the original aggregate capacity.")
    return found
def _read_document(raw):
    require(isinstance(raw,bytes) and len(raw)<=MAX_BLOB,"FILE_LIMIT","Full review document exceeds 64 MiB.")
    try:decoded=raw.decode("utf-8")
    except UnicodeError:D.fail("ENCODING","Review JSON/HTML must be complete UTF-8.")
    if decoded.lstrip().startswith("{"):return loads(raw)
    from html.parser import HTMLParser
    class Payload(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=False);self.active=False;self.values=[];self.parts=[]
        def handle_starttag(self,tag,attrs):
            if tag.lower()!="script":return
            names=[k.lower() for k,v in attrs]
            if any(k.lower()=="id" and v=="property-review-data" for k,v in attrs):
                require(names.count("id")==1 and names.count("type")==1,"REVIEW_HTML","Review payload attributes repeat.")
                values={k.lower():v for k,v in attrs}
                require(values.get("type")=="application/json" and "src"not in values,"REVIEW_HTML","Review data must be one inert application/json script.")
                require(not self.active,"REVIEW_HTML","Review payload is nested.")
                self.active=True;self.parts=[]
        def handle_data(self,data):
            if self.active:self.parts.append(data)
        def handle_endtag(self,tag):
            if tag.lower()=="script" and self.active:
                self.values.append("".join(self.parts));self.active=False
    parser=Payload()
    try:parser.feed(decoded);parser.close()
    except ValueError:D.fail("REVIEW_HTML","Cannot read the complete inert review payload.")
    require(not parser.active and len(parser.values)==1,"REVIEW_HTML","Expected one complete inert property-review-data script.")
    return loads(parser.values[0].encode("utf-8"))

def _event(state,item_id,kind=None):
    identifier(item_id)
    item=next((x for x in state.get(COLLECTION,[]) if x["id"]==item_id),None)
    require(item is not None and (kind is None or item["kind"]==kind),"REVIEW_NOT_FOUND","Select an original retained review record.")
    return item
def _latest(state,reconciliation_id,finding_id):
    return next((x for x in reversed(state["decisions"]) if x["body"]["reconciliationId"]==reconciliation_id and x["body"]["findingId"]==finding_id),None)
def _decision_value(event):
    return None if event is None else {k:_copy(event["body"][k]) for k in ("disposition","reason","evidence")}
def _same(a,b):return canonical(a)==canonical(b)
def _actor(value,strict=True):
    _keys(value,("id","name"),"Review actor")
    for key,maximum in (("id",128),("name",160)):
        if strict:text(value[key],"Reviewer "+key,maximum)
        else:require(isinstance(value[key],str) and len(value[key])<=maximum and "\x00" not in value[key],"ACTOR","Unfinished actor text exceeds its bound.")
def _prepare_command(command):
    _keys(command,("requestId","kind","actor","at","body"),"Original issue preparation")
    identifier(command["requestId"]);require(command["kind"]=="review.issue","COMMAND","Use review.issue preparation.")
    _actor(command["actor"]);D._time(command["at"])
    b=command["body"]
    _keys(b,("id","reconciliationId","findingIds","reviewer","note"),"Assigned review selection")
    identifier(b["id"]);identifier(b["reconciliationId"]);_actor(b["reviewer"]);D._note(b["note"])
    D._list(b["findingIds"],"Assigned original findings",LIMITS["findings"],1)
    require(len(set(b["findingIds"]))==len(b["findingIds"]),"FINDING","Selected findings repeat.")
    for key in b["findingIds"]:sha_id(key)
    return b
def _build_issue(state,command,read_blob):
    b=_prepare_command(command)
    record=D._find(state,"reconciliations",b["reconciliationId"])
    require(D._time(command["at"])>=D._time(D._all(state)[-1]["createdAt"] if D._all(state) else state["createdAt"]),"COMMAND_TIME","Issue time precedes original history.")
    report=D.report(state,record["id"],read_blob)
    by_id={x["id"]:x for x in report["findings"]}
    require(all(x in by_id for x in b["findingIds"]),"FINDING","An assigned original finding is absent.")
    cache={};file_map={}
    def add(descriptor):
        raw=D._descriptor(descriptor,read_blob,cache)
        # Source descriptors remain exact in the source wrappers. Outgoing filenames
        # use a portable basename while the original name remains in those wrappers.
        name=descriptor["name"].replace("\\","/").split("/")[-1]
        if name in ("",".","..") or len(name)>240 or any(ord(c)<32 for c in name):name="original-"+descriptor["sha256"]+".bin"
        media=descriptor["mediaType"]
        require("\r"not in media and "\n"not in media,"MEDIA","Original source media type cannot be embedded as a header.")
        file_map.setdefault(descriptor["sha256"],{**_descriptor_for(raw,name,media),"base64":_b64(raw)})
    source_ids=sorted({pair[k] for pair in record["body"]["pairs"] for k in ("sourceId","targetId")})
    mapping_ids=sorted({pair["mappingId"] for pair in record["body"]["pairs"]})
    sources=[_copy(D._find(state,"sourceEditions",key)) for key in source_ids]
    mappings=[_copy(D._find(state,"mappings",key)) for key in mapping_ids]
    approvals=[]
    for key in mapping_ids:
        current=[x for x in state["approvals"] if x["body"]["mappingId"]==key]
        require(bool(current),"MAPPING_APPROVAL","Original mapping review is absent.")
        approvals.append(_copy(current[-1]))
    for source in sources:add(source["body"]["blob"])
    for descriptor in record["body"]["load"]["evidence"]:add(descriptor)
    for approval in approvals:
        for descriptor in approval["body"]["evidence"]:add(descriptor)
    items=[]
    for key in b["findingIds"]:
        finding=by_id[key];prior=_latest(state,record["id"],key)
        if prior:
            for descriptor in prior["body"]["evidence"]:add(descriptor)
        pair=finding.get("pair")
        pairs={pair} if type(pair)is int else {x.get("pair") for x in (finding.get("first",{}),finding.get("second",{})) if type(x.get("pair"))is int}
        if not pairs:pairs={x["index"] for x in report["pairs"]}
        rows=[_copy(row) for row in report["rows"] if row["pair"] in pairs]
        items.append({"findingId":key,"finding":_copy(finding),"rows":rows,"baselineDecision":_copy(prior)})
    report_raw=canonical(report)
    file_map.setdefault(sha(report_raw),_enclosed(report_raw,"Original_Independent_Reconciliation.json","application/json"))
    result={"schema":ISSUE,"id":b["id"],"workspace":{"id":state["id"],"title":state["title"],"stateSha256":digest(state)},"request":_copy(command),"reconciliation":_copy(record),"report":{k:_copy(report[k]) for k in ("cutoff","counts","blocking","pairs","numberTokens")},"reviewer":_copy(b["reviewer"]),"items":items,"sources":sources,"mappings":mappings,"approvals":approvals,"files":[file_map[key] for key in sorted(file_map)]}
    result["report"]["sha256"]=sha(report_raw)
    require(len(canonical(result))<=MAX_BLOB,"REVIEW_CAPACITY","The complete assigned source/population/evidence document exceeds 64 MiB; select a smaller complete review cohort without truncating sources.")
    return result
def prepare_issue(state,command,read_blob):
    D.validate_state(state,read_blob)
    issued=_build_issue(state,command,read_blob);raw=canonical(issued)
    return {"document":issued,"issued":_descriptor_for(raw,"Property_Discrepancy_Review.json","application/json"),"raw":raw}
def initial_return(issued_raw):
    issue=loads(issued_raw)
    require(issue.get("schema")==ISSUE,"REVIEW_SCHEMA","Expected complete issued review JSON.")
    return {"schema":RETURN,"issued":{"sha256":sha(issued_raw),"bytes":len(issued_raw),"base64":_b64(issued_raw)},"workingCopyId":str(uuid.uuid5(NAMESPACE,sha(issued_raw))),"editions":[],"draft":{"basedOn":None,"actor":_copy(issue["reviewer"]),"at":"","items":[{"findingId":x["findingId"],"disposition":None,"reason":"","evidence":[]} for x in issue["items"]],"note":""},"files":[]}
def _typed_items(items,issue,files,strict):
    D._list(items,"Complete assigned finding decisions",LIMITS["findings"],1)
    expected={x["findingId"]:x for x in issue["items"]};seen=set()
    require(len(items)==len(expected),"REVIEW_POPULATION","Every assigned finding must be retained exactly once.")
    for item in items:
        _keys(item,("findingId","disposition","reason","evidence"),"Reviewer finding decision")
        key=item["findingId"];require(key in expected and key not in seen,"REVIEW_POPULATION","Unexpected/repeated assigned finding.");seen.add(key)
        require(item["disposition"] in (None,"REQUIRE_CORRECTION","ACCEPT_EXCEPTION"),"DECISION","Unknown reviewer disposition.")
        require(isinstance(item["reason"],str) and len(item["reason"])<=8000 and "\x00"not in item["reason"],"REASON","Reviewer reason exceeds its bound.")
        D._list(item["evidence"],"Complete selected evidence",64)
        require(len(item["evidence"])==len(set(item["evidence"])) and all(x in files for x in item["evidence"]),"EVIDENCE","Reviewer evidence is repeated or missing its complete original bytes.")
        if item["disposition"]=="ACCEPT_EXCEPTION":require(expected[key]["finding"]["severity"]=="REVIEW","FINDING","Blocking findings cannot be waived.")
        if strict:
            if item["disposition"] is None:require(item["reason"]=="" and not item["evidence"],"DECISION","An undecided saved item must not claim a reason/evidence decision.")
            else:text(item["reason"],"Named decision reason",8000);require(bool(item["evidence"]),"EVIDENCE","Saved discrepancy decisions require original evidence.")
def _parse_return(state,descriptor,read_blob,cache=None):
    cache={} if cache is None else cache
    raw=_descriptor(descriptor,read_blob,cache)
    document_key=("review-document",sha(raw))
    if document_key not in cache:cache[document_key]=_read_document(raw)
    value=cache[document_key]
    _keys(value,("schema","issued","workingCopyId","editions","draft","files"),"Complete reviewer return")
    require(value["schema"]==RETURN,"REVIEW_SCHEMA","Unknown review-return schema.");identifier(value["workingCopyId"])
    _keys(value["issued"],("sha256","bytes","base64"),"Complete original issue")
    issued_raw=_unb64(value["issued"]["base64"])
    require(value["issued"]["sha256"]==sha(issued_raw) and value["issued"]["bytes"]==len(issued_raw),"ISSUE_IDENTITY","Original issue bytes differ.")
    issue=loads(issued_raw);require(issue.get("schema")==ISSUE,"REVIEW_SCHEMA","Unknown issued document.")
    original=_event(state,issue["id"],"review.issue")
    require(original["body"]["issued"]["sha256"]==sha(issued_raw) and _descriptor(original["body"]["issued"],read_blob,cache)==issued_raw,"ISSUE_IDENTITY","Return belongs to another original issue.")
    issued_files=_enclosed_files(issue["files"]);returned_files=_enclosed_files(value["files"])
    files=dict(issued_files)
    for key,item in returned_files.items():
        if key in files:require(files[key][1]==item[1],"FILE_IDENTITY","Original file identity differs.")
        else:files[key]=item
    require(sum(len(x[1]) for x in files.values())<=D.LIMITS["aggregateBlobBytes"],"FILE_LIMIT","Complete review evidence exceeds aggregate capacity.")
    D._list(value["editions"],"Named reviewer editions",LIMITS["editions"])
    prior=None;seen=set();last_time=D._time(issue["request"]["at"])
    for edition in value["editions"]:
        _keys(edition,("id","parentId","name","actor","at","items","note","sha256"),"Named reviewer edition")
        identifier(edition["id"]);require(edition["id"] not in seen and edition["parentId"]==prior,"EDITION_CHAIN","Named editions must preserve their exact original consecutive parent chain.")
        text(edition["name"],"Edition name",240);_actor(edition["actor"])
        require(edition["actor"]==issue["reviewer"],"REVIEWER","Named edition attribution must match the assigned reviewer.")
        at=D._time(edition["at"]);require(at>=last_time,"EDITION_TIME","Named review time precedes issue or prior edition.")
        D._note(edition["note"]);_typed_items(edition["items"],issue,files,True)
        require(edition["sha256"]==digest({k:v for k,v in edition.items() if k!="sha256"}),"EDITION_IDENTITY","Named reviewer edition changed.")
        prior=edition["id"];seen.add(prior);last_time=at
    draft=value["draft"]
    require(isinstance(draft,dict) and set(draft) in ({"basedOn","actor","at","items","note"},{"basedOn","actor","at","items","note","editor"}),"DRAFT","Unknown unfinished draft shape.")
    require(draft["basedOn"] is None or draft["basedOn"] in seen,"DRAFT","Draft base edition is unavailable.")
    _actor(draft["actor"],False);require(isinstance(draft["at"],str) and len(draft["at"])<=160,"DRAFT","Unfinished time must remain bounded text.")
    D._note(draft["note"]);_typed_items(draft["items"],issue,files,False)
    if "editor"in draft:require(len(canonical(draft["editor"]))<=LIMITS["draftEditorBytes"],"DRAFT_LIMIT","Complete unfinished controls exceed 4 MiB.")
    # Native evidence is retained outside the transaction by host preparation. The
    # pure command independently checks all bytes before adopting its record.
    return {"value":value,"issue":issue,"files":files,"raw":raw,"original":original}
def _retained_edition_ids(state,parsed,read_blob,cache):
    selected={x["id"]:x for x in parsed["value"]["editions"]}
    if not selected:return
    for record in state.get(COLLECTION,[]):
        if record["kind"]!="review.receive" or record["result"]["issueId"]!=parsed["issue"]["id"]:continue
        overlap=set(record["result"]["editionIds"]) & set(selected)
        if not overlap:continue
        raw=_descriptor(record["body"]["file"],read_blob,cache);key=("review-document",sha(raw))
        if key not in cache:cache[key]=_read_document(raw)
        previous=cache[key]
        for edition in previous["editions"]:
            if edition["id"] in overlap:
                require(canonical(edition)==canonical(selected[edition["id"]]),"REVIEW_EDITION_CONFLICT","A named edition UUID already belongs to different complete original content. Preserve the received file and use a new named edition for a correction.")
def prepare_return(state,descriptor,read_blob):
    D.validate_state(state,read_blob)
    cache={};parsed=_parse_return(state,descriptor,read_blob,cache)
    _retained_edition_ids(state,parsed,read_blob,cache)
    return {"issueId":parsed["issue"]["id"],"workingCopyId":parsed["value"]["workingCopyId"],"editions":[{k:_copy(x[k]) for k in ("id","parentId","name","actor","at","sha256")} for x in parsed["value"]["editions"]],"draft":_copy(parsed["value"]["draft"]),"files":[{**desc,"base64":_b64(raw)} for desc,raw in parsed["files"].values()],"file":_copy(descriptor)}
def _loaded_return(state,return_id,read_blob):
    record=_event(state,return_id,"review.receive")
    return record,_parse_return(state,record["body"]["file"],read_blob)
def _comparison(state,return_id,edition_id,read_blob):
    record,parsed=_loaded_return(state,return_id,read_blob);issue=parsed["issue"]
    identifier(edition_id);edition=next((x for x in parsed["value"]["editions"] if x["id"]==edition_id),None)
    require(edition is not None,"EDITION","Select a complete named reviewer edition; unfinished drafts are retained but never applied.")
    selected={x["findingId"]:x for x in edition["items"]};rows=[]
    for issued in issue["items"]:
        key=issued["findingId"];baseline=issued["baselineDecision"];current=_latest(state,issue["reconciliation"]["id"],key);returned=selected[key]
        baseline_files={x["sha256"]:x for x in (baseline["body"]["evidence"] if baseline else [])}
        returned_value=None if returned["disposition"]is None else {"disposition":returned["disposition"],"reason":returned["reason"],"evidence":[_copy(baseline_files.get(x,parsed["files"][x][0])) for x in returned["evidence"]]}
        before=_decision_value(baseline);now_value=_decision_value(current)
        changed_current=not _same(before,now_value);changed_return=not _same(before,returned_value)
        status="SAME" if _same(now_value,returned_value) else ("CONFLICT" if changed_current and changed_return else ("CURRENT_CHANGED"if changed_current else"RETURNED_CHANGED"))
        rows.append({"findingId":key,"finding":_copy(issued["finding"]),"baselineDecision":_copy(baseline),"currentDecision":_copy(current),"returned":_copy(returned),"returnedDecision":returned_value,"status":status,"canApply":returned_value is not None})
    result={"schema":"bluewave.discrepancy-review-comparison.v1","workspaceId":state["id"],"stateSha256":digest(state),"issueId":issue["id"],"returnId":return_id,"returnSha256":record["body"]["file"]["sha256"],"editionId":edition_id,"editionSha256":edition["sha256"],"reconciliationId":issue["reconciliation"]["id"],"reportSha256":issue["report"]["sha256"],"rows":rows,"reviewSha256":None}
    result["reviewSha256"]=digest({k:v for k,v in result.items() if k!="reviewSha256"})
    require(len(canonical(result))<=LIMITS["responseBytes"],"REVIEW_CAPACITY","Complete comparison exceeds the response capacity; no findings were truncated.")
    return result
def compare(state,return_id,edition_id,read_blob,adoption_id=None):
    D.validate_state(state,read_blob)
    if adoption_id is None:return {"readOnly":False,"comparison":_comparison(state,return_id,edition_id,read_blob)}
    adopted=_event(state,adoption_id,"review.adopt")
    require(adopted["body"]["returnId"]==return_id and adopted["body"]["editionId"]==edition_id,"REVIEW_BINDING","Historical adoption identifies another returned edition.")
    before=D._replay(state,read_blob,stop_before_request=adopted["requestId"])
    comparison=_comparison(before,return_id,edition_id,read_blob)
    require(comparison["reviewSha256"]==adopted["body"]["reviewSha256"],"REVIEW_HISTORY","Historical comparison differs from its original selected basis.")
    return {"readOnly":True,"comparison":comparison,"adoption":_copy(adopted),"current":{"stateSha256":digest(state),"decisions":[_copy(_latest(state,comparison["reconciliationId"],x["findingId"])) for x in comparison["rows"]]}}
def _require_retained_files(parsed,read_blob,cache):
    for descriptor,expected in parsed["files"].values():
        require(D._descriptor(descriptor,read_blob,cache)==expected,"EVIDENCE","Complete returned/source evidence must be retained before command admission.")
def _core(state,command,read_blob,cache):
    b=command["body"];kind=command["kind"]
    if kind=="review.issue":
        _keys(b,("id","issued","html"),"Retained assigned review")
        raw=_descriptor(b["issued"],read_blob,cache);issue=loads(raw)
        require(issue.get("schema")==ISSUE and issue.get("id")==b["id"],"ISSUE","Original issue identity differs.")
        original=issue["request"]
        require(original["requestId"]==command["requestId"] and original["actor"]==command["actor"] and original["at"]==command["at"],"ISSUE","Preparation and compact original command differ.")
        expected=_build_issue(state,original,read_blob)
        require(canonical(expected)==raw,"ISSUE_CHANGED","Issue source, selection or prior decisions changed before retention.")
        html_raw=_descriptor(b["html"],read_blob,cache)
        require(_read_document(html_raw)==initial_return(raw),"ISSUE_HTML","Original issued HTML must carry the complete initial original return.")
        for descriptor,body in _enclosed_files(issue["files"]).values():require(D._descriptor(descriptor,read_blob,cache)==body,"EVIDENCE","Original issue files must be retained before issue commit.")
        return {"issueRequest":_copy(original),"issuedSha256":sha(raw),"htmlSha256":sha(html_raw),"reconciliationId":issue["reconciliation"]["id"],"reviewer":_copy(issue["reviewer"]),"findingIds":[x["findingId"]for x in issue["items"]],"files":[{"role":"issued_json",**_copy(b["issued"])},{"role":"issued_html",**_copy(b["html"])}]}
    if kind=="review.receive":
        _keys(b,("id","file"),"Complete raw reviewer return")
        parsed=_parse_return(state,b["file"],read_blob,cache)
        _retained_edition_ids(state,parsed,read_blob,cache);_require_retained_files(parsed,read_blob,cache)
        for edition in parsed["value"]["editions"]:require(D._time(edition["at"])<=D._time(command["at"]),"EDITION_TIME","A received reviewer edition cannot claim a future observation.")
        return {"issueId":parsed["issue"]["id"],"workingCopyId":parsed["value"]["workingCopyId"],"editionIds":[x["id"]for x in parsed["value"]["editions"]],"editionSha256s":[x["sha256"]for x in parsed["value"]["editions"]],"draftSha256":digest(parsed["value"]["draft"]),"fileSha256":b["file"]["sha256"],"files":[{"role":"returned_file",**_copy(b["file"])}]}
    _keys(b,("id","returnId","editionId","reviewSha256","choices"),"Explicit returned-review adoption")
    comparison=_comparison(state,b["returnId"],b["editionId"],read_blob)
    require(sha_id(b["reviewSha256"])==comparison["reviewSha256"],"REVIEW_CHANGED","Review the complete current comparison before adopting original findings.")
    D._list(b["choices"],"Explicit complete finding choices",LIMITS["findings"],1)
    rows={x["findingId"]:x for x in comparison["rows"]}
    require(len(b["choices"])==len(rows),"REVIEW_CHOICES","Choose keep/apply explicitly for every assigned finding.")
    seen=set();decisions=[]
    for choice in b["choices"]:
        _keys(choice,("findingId","action","resolution"),"Supervisor finding choice")
        key=choice["findingId"];require(key in rows and key not in seen,"REVIEW_CHOICES","Choice finding repeats or is absent.");seen.add(key)
        require(choice["action"]in("KEEP","APPLY") and choice["resolution"]in("CURRENT","RETURNED"),"REVIEW_CHOICES","Choose the actual current or returned decision explicitly.")
        row=rows[key]
        if choice["action"]=="KEEP":
            require(choice["resolution"]=="CURRENT","REVIEW_CHOICES","Keeping leaves the current original decision unchanged.")
            decisions.append({"findingId":key,"action":"KEEP","decisionId":row["currentDecision"]["id"]if row["currentDecision"]else None,"decisionSha256":row["currentDecision"]["sha256"]if row["currentDecision"]else None})
            continue
        require(choice["resolution"]=="RETURNED","REVIEW_CHOICES","Applying uses the explicitly selected returned decision; choose KEEP for current.")
        value=row["returnedDecision"];require(value is not None,"UNDECIDED","An unfinished/undecided reviewer item cannot become a native finding decision.")
        child={"requestId":str(uuid.uuid5(uuid.UUID(command["requestId"]),"request:"+key)),"kind":"finding.decide","actor":_copy(command["actor"]),"at":command["at"],"body":{"id":str(uuid.uuid5(uuid.UUID(command["requestId"]),"decision:"+key)),"reconciliationId":comparison["reconciliationId"],"findingId":key,**_copy(value)}}
        outcome=D._core(state,child,read_blob,cache)
        decisions.append({"findingId":key,"action":"APPLY","requestId":child["requestId"],"decisionId":outcome["id"],"decisionSha256":outcome["sha256"]})
    return {"issueId":comparison["issueId"],"returnId":b["returnId"],"editionId":b["editionId"],"editionSha256":comparison["editionSha256"],"reviewSha256":comparison["reviewSha256"],"basisStateSha256":comparison["stateSha256"],"decisions":decisions}
def child_requests(event):
    if event.get("kind")!="review.adopt":return set()
    return {str(uuid.uuid5(uuid.UUID(event["requestId"]),"request:"+x["findingId"])) for x in event["body"]["choices"] if x["action"]=="APPLY"}
def document(state,item_id,role,read_blob):
    D.validate_state(state,read_blob)
    entry=_event(state,item_id)
    descriptor=next((x for x in entry["result"].get("files",[]) if x["role"]==role),None)
    require(descriptor is not None,"REVIEW_FILE","Select an original issued JSON/HTML or returned file.")
    desc={k:v for k,v in descriptor.items() if k!="role"}
    return {"descriptor":_copy(descriptor),"bytes":_descriptor(desc,read_blob)}
def view(state,read_blob,item_id=None):
    D.validate_state(state,read_blob)
    if item_id is None:
        value={"schema":"bluewave.discrepancy-review-view.v1","records":_copy(state.get(COLLECTION,[])),"limits":_copy(LIMITS)}
    else:
        record=_event(state,item_id)
        value={"record":_copy(record),"files":_copy(record["result"].get("files",[]))}
        if record["kind"]=="review.issue":
            issue=loads(_descriptor(record["body"]["issued"],read_blob));value["issue"]=issue
            issue["files"]=[{k:v for k,v in x.items() if k!="base64"} for x in issue["files"]]
        elif record["kind"]=="review.receive":
            _,parsed=_loaded_return(state,item_id,read_blob);returned=_copy(parsed["value"])
            returned["issued"]={k:v for k,v in returned["issued"].items() if k!="base64"}
            returned["files"]=[{k:v for k,v in x.items() if k!="base64"}for x in returned["files"]]
            value["return"]=returned;value["issueId"]=parsed["issue"]["id"]
        else:value["historical"]=compare(state,record["body"]["returnId"],record["body"]["editionId"],read_blob,record["id"])
    require(len(canonical(value))<=LIMITS["responseBytes"],"REVIEW_CAPACITY","Complete review metadata exceeds response capacity; original files remain downloadable.")
    return value
