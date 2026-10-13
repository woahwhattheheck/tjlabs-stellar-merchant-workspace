"""Source-bound property continuity, independent returns and attributed release decisions.
No platform writer or network operation. Original bytes remain in the host's blob store.
"""
import copy,csv,io,json,re
from datetime import datetime,timezone
from decimal import Decimal,InvalidOperation
from .common import canonical,digest,sha,loads,require,fail,identifier,timestamp,text,sha_id

SCHEMA="bluewave.property-continuity.v1"
COLLECTIONS=("sourceEditions","mappings","approvals","reconciliations","decisions","rehearsals","cutovers","handovers")
PLATFORMS=("LEGACY","SALESFORCE","DOCUSIGN_CLM","CENTROS","ARCGIS","OTHER")
FAMILIES=("PROPERTY","RENTAL_SPACE","LEASE","PROJECT","DOCUMENT","FINANCE","SPATIAL","PARTY","PERMISSION","OTHER")
KINDS={"source.import":"sourceEditions","mapping.save":"mappings","mapping.review":"approvals","reconciliation.create":"reconciliations","finding.decide":"decisions","rehearsal.record":"rehearsals","cutover.plan":"cutovers","cutover.decide":"cutovers","cutover.close":"cutovers","handover.record":"handovers"}
LIMITS={"blobBytes":64*1024*1024,"aggregateBlobBytes":256*1024*1024,"stateBytes":8*1024*1024,"rowsPerDataset":25000,"rowsPerReconciliation":100000,"reportBytes":64*1024*1024,"sources":256,"fieldsPerMapping":256,"pairs":32,"events":4096}
AUTHORITIES={"SALESFORCE":"Reviewed PMS records, process and metadata; no tenant writes from this application.","DOCUSIGN_CLM":"Controlled document originals, versions, signatures and associations.","CENTROS":"Financial authority; a PMS mirror or request acknowledgement is not a posting.","ARCGIS":"Spatial and sizing authority; references retain supplied CRS and units.","KPN":"Capital-project identity is separate from property hierarchy.","LEASE":"At most one explicitly LIVE/ACTIVE lease per rental space at an instant."}
MISSING=object()
def _time(value):
    timestamp(value)
    require("T" in value,"TIME","Use an explicit date, time and offset.")
    return datetime.fromisoformat(value.replace("Z","+00:00"))
def _keys(value,expected,label):
    require(isinstance(value,dict) and set(value)==set(expected),"SHAPE",label+" has unexpected or missing fields.")
def _list(value,label,maximum,minimum=0):
    require(isinstance(value,list) and minimum<=len(value)<=maximum,"LIMIT",label+" exceeds its complete supported bound.")
    return value
def _note(value):require(isinstance(value,str) and len(value)<=8000 and "\x00" not in value,"NOTE","Use a bounded note.");return value
def _plain(value,label="Field ID"):
    text(value,label,128);require(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}",value),"ID",label+" must be a plain identifier.");return value
def _pointer(value):
    require(isinstance(value,str) and len(value)<=1024 and (value=="" or value.startswith("/")),"POINTER","Use an explicit JSON Pointer.")
    require(not re.search(r"~(?![01])",value),"POINTER","Invalid JSON Pointer escape.")
    return value
def _get(value,pointer):
    _pointer(pointer)
    if pointer=="":return value
    current=value
    for bit in pointer[1:].split("/"):
        bit=bit.replace("~1","/").replace("~0","~")
        if isinstance(current,dict):
            if bit not in current:return MISSING
            current=current[bit]
        elif isinstance(current,list) and re.fullmatch(r"0|[1-9][0-9]*",bit):
            n=int(bit)
            if n>=len(current):return MISSING
            current=current[n]
        else:return MISSING
    return current
def _descriptor(value,read_blob,cache):
    _keys(value,("sha256","bytes","mediaType","name"),"Original blob descriptor")
    sha_id(value["sha256"]);text(value["mediaType"],"Media type",160);text(value["name"],"Original filename",512)
    require(type(value["bytes"]) is int and 0<=value["bytes"]<=LIMITS["blobBytes"],"BLOB_LIMIT","Original file exceeds the bounded local working cohort.")
    key=value["sha256"]
    if key not in cache:
        body=read_blob(key)
        require(isinstance(body,bytes) and len(body)<=LIMITS["blobBytes"] and sha(body)==key,"BLOB_IDENTITY","Original bytes differ from their retained identity.")
        total=cache.get("_aggregate_bytes",0)+len(body)
        require(total<=LIMITS["aggregateBlobBytes"],"BLOB_LIMIT","Complete selected original bytes exceed the portable local cohort bound.")
        cache["_aggregate_bytes"]=total;cache[key]=body
    require(len(cache[key])==value["bytes"],"BLOB_IDENTITY","Original file byte count differs.")
    return cache[key]
def _evidence(value,read_blob,cache,minimum=0):
    _list(value,"Original evidence",64,minimum)
    seen=set()
    for descriptor in value:
        _descriptor(descriptor,read_blob,cache)
        require(descriptor["sha256"] not in seen,"EVIDENCE","The same evidence is repeated.")
        seen.add(descriptor["sha256"])
def _find(state,collection,item_id):
    identifier(item_id)
    found=next((x for x in state[collection] if x["id"]==item_id),None)
    require(found is not None,"NOT_FOUND","Original "+collection+" entry is absent.")
    return found
def _all(state):return sorted((x for c in COLLECTIONS for x in state[c]),key=lambda x:x["sequence"])
class _SourceNumber(str):
    """Original non-integer JSON token, never converted through binary float."""
def _source_json(value):
    def pairs(items):
        result={}
        for key,item in items:
            require(key not in result,"SOURCE_JSON","Original JSON contains a duplicate object key.")
            result[key]=item
        return result
    def invalid(token):fail("SOURCE_JSON","Original JSON contains a non-finite number: "+token)
    try:return json.loads(value,parse_float=_SourceNumber,parse_constant=invalid,object_pairs_hook=pairs)
    except (json.JSONDecodeError,RecursionError) as error:fail("SOURCE_JSON","Cannot read complete original JSON: "+str(error))
def _exact_tree(value):
    if isinstance(value,_SourceNumber):return {"type":"number","kind":"decimal","lexeme":str(value)}
    if value is None:return {"type":"null"}
    if type(value)is bool:return {"type":"boolean","value":value}
    if type(value)is int:return {"type":"number","kind":"integer","lexeme":str(value)}
    if type(value)is str:return {"type":"string","value":value}
    if isinstance(value,list):return {"type":"array","items":[_exact_tree(x)for x in value]}
    require(isinstance(value,dict),"SOURCE_JSON","Unsupported original JSON value.")
    return {"type":"object","entries":[{"key":key,"value":_exact_tree(value[key])}for key in sorted(value)]}
def _source_display(value,pointer="",tokens=None):
    if isinstance(value,_SourceNumber)or type(value)is int and abs(value)>9007199254740991:
        token={"kind":"decimal"if isinstance(value,_SourceNumber)else"integer","lexeme":str(value)}
        if tokens is not None:tokens.append({"pointer":pointer,**token})
        return {"originalJsonNumber":token}
    if isinstance(value,list):return [_source_display(item,pointer+"/"+str(i),tokens)for i,item in enumerate(value)]
    if isinstance(value,dict):return {key:_source_display(item,pointer+"/"+key.replace("~","~0").replace("/","~1"),tokens)for key,item in value.items()}
    return value
def _verified_population(source,observed,cutoff=None):
    ext=source["body"]["extraction"]
    return ext["mode"]=="FULL"and ext["complete"]and ext["expectedRows"]is not None and ext["expectedRows"]==observed and(cutoff is None or _time(ext["cutoff"])==cutoff)
def _rows(source,read_blob,cache):
    body=source["body"];raw=_descriptor(body["blob"],read_blob,cache)
    cache_key=("rows",source["id"],body["blob"]["sha256"])
    if cache_key in cache:return cache[cache_key]
    try:decoded=raw.decode("utf-8-sig")
    except UnicodeError:fail("SOURCE_ENCODING","Use a complete UTF-8 source export; retain any other original separately.")
    if body["format"]=="JSON":
        value=_source_json(decoded);rows=_get(value,body["jsonPointer"])
        require(rows is not MISSING and isinstance(rows,list),"SOURCE_ROWS","The selected original JSON pointer must contain an array.")
    elif body["format"]=="JSONL":
        require(body["jsonPointer"]=="","SOURCE_ROWS","JSONL does not use an array pointer.")
        lines=decoded.splitlines();require(all(line.strip() for line in lines),"SOURCE_ROWS","Blank JSONL records are not silently discarded.")
        rows=[_source_json(line) for line in lines]
    else:
        require(body["jsonPointer"]=="","SOURCE_ROWS","CSV does not use an array pointer.")
        try:
            reader=csv.reader(io.StringIO(decoded,newline=""),delimiter=body["csv"]["delimiter"],strict=True)
            header=next(reader,None)
            require(header is not None and header and all(isinstance(x,str) and x for x in header) and len(set(header))==len(header),"SOURCE_HEADER","CSV needs original unique nonempty headers; a header-only export represents zero rows.")
            rows=[]
            for n,row in enumerate(reader,2):
                require(len(row)==len(header),"SOURCE_COLUMNS","Original CSV record "+str(n)+" does not match its header.")
                token=body["csv"]["nullToken"]
                rows.append({k:(None if token is not None and v==token else v) for k,v in zip(header,row)})
                require(len(rows)<=LIMITS["rowsPerDataset"],"ROW_LIMIT","Select an explicitly bounded complete working cohort.")
        except csv.Error as error:fail("SOURCE_CSV","Cannot read complete original CSV: "+str(error))
    require(isinstance(rows,list) and len(rows)<=LIMITS["rowsPerDataset"] and all(isinstance(x,dict) for x in rows),"SOURCE_ROWS","Each complete record must be an object within the declared local cohort.")
    require(len(canonical(rows))<=LIMITS["blobBytes"],"SOURCE_LIMIT","Normalized source exceeds the local cohort bound.")
    cache[cache_key]=rows
    return rows
def _decimal(value):
    require(type(value)is str and len(value)<=200 and re.fullmatch(r"[+-]?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?",value),"DECIMAL","Use an exact decimal string; binary floating-point input is not accepted.")
    try:result=Decimal(value)
    except InvalidOperation:fail("DECIMAL","Invalid exact decimal.")
    require(result.is_finite(),"DECIMAL","Decimal must be finite.")
    # Decimal.normalize uses the process precision; string operations retain every digit.
    sign="-" if result.is_signed() and not result.is_zero() else ""
    digits=value.lstrip("+-").split(".");whole=digits[0].lstrip("0") or "0";fraction=digits[1].rstrip("0") if len(digits)>1 else ""
    return sign+whole+("."+fraction if fraction else "")
def _value(raw,field):
    if raw is MISSING:
        require(not field["required"],"MISSING_FIELD","Required mapped field is absent.")
        return {"present":False}
    if raw is None:
        require(field["allowNull"],"NULL_FIELD","Mapped field does not permit null.")
        return {"present":True,"value":None}
    kind=field["type"]
    if kind=="TEXT":require(type(raw)is str,"TYPE","Mapped text must be source text, not an original JSON numeric token.");value=raw
    elif kind=="DECIMAL":value=_decimal(raw)
    elif kind=="DATETIME":
        require(type(raw)is str,"TYPE","Mapped timestamp must be original text.");value=_time(raw).astimezone(timezone.utc).isoformat()
    elif kind=="BOOLEAN":require(type(raw) is bool,"TYPE","Mapped boolean must be an actual JSON boolean.");value=raw
    else:value=raw
    canonical(value)
    return {"present":True,"value":value,**({"exact":_exact_tree(raw)}if kind=="EXACT"else{})}
def _identity(row,keys):
    result=[]
    for pointer in keys:
        item=_get(row,pointer)
        require(item is not MISSING and item is not None and item!="","IDENTITY","Original key field is absent, null or empty.")
        require(type(item) in (str,int,bool),"IDENTITY","Key fields must be explicit text, integer or boolean values.")
        result.append({"type":type(item).__name__,"value":item})
    return result
def _role(mapped,mapping,role):
    field=mapping["body"]["roles"].get(role)
    value=mapped.get(field,{}) if field else {}
    return value.get("value",MISSING) if value.get("present") else MISSING
def _normal(row,mapping,side):
    b=mapping["body"];values={};errors=[]
    try:key=_identity(row,b["sourceKeys" if side=="source" else "targetKeys"])
    except ValueError as error:key=None;errors.append({"field":None,"code":"INVALID_IDENTITY","message":str(error)})
    for field in b["fields"]:
        try:values[field["id"]]=_value(_get(row,field[side]),field)
        except ValueError as error:errors.append({"field":field["id"],"code":"INVALID_FIELD","message":str(error)})
    return {"identity":key,"values":values,"errors":errors}
def _mapping_authority(body):
    family=body["family"];target=body["targetPlatform"];source=body["sourcePlatform"]
    if family in ("PROPERTY","RENTAL_SPACE","LEASE","PROJECT","PARTY","PERMISSION"):
        require(target=="SALESFORCE","AUTHORITY","These PMS records must name the reviewed Salesforce target.")
    elif family=="DOCUMENT":require(target=="DOCUSIGN_CLM","AUTHORITY","Controlled document versions remain with Docusign CLM.")
    elif family=="FINANCE":
        require(source=="CENTROS" and target in ("CENTROS","SALESFORCE"),"AUTHORITY","Finance originates in Centros; Salesforce is a visibility mirror.")
    elif family=="SPATIAL":
        require(source=="ARCGIS" and target in ("ARCGIS","SALESFORCE"),"AUTHORITY","Spatial and sizing values originate in ArcGIS.")
def _validate_mapping(body):
    _keys(body,("id","previousId","label","family","sourcePlatform","targetPlatform","sourceKeys","targetKeys","fields","roles","identityNamespace","references","activeStates","endInclusive","note"),"Mapping edition")
    identifier(body["id"]);text(body["label"],"Mapping label",200);_note(body["note"])
    if body["previousId"] is not None:identifier(body["previousId"])
    require(body["family"] in FAMILIES and body["sourcePlatform"] in PLATFORMS and body["targetPlatform"] in PLATFORMS,"MAPPING","Select actual dataset family and platform authority.")
    for key in ("sourceKeys","targetKeys"):
        _list(body[key],key,16,1)
        require(len(set(body[key]))==len(body[key]),"MAPPING","Identity pointers repeat.")
        for value in body[key]:_pointer(value)
    require(len(body["sourceKeys"])==len(body["targetKeys"]),"MAPPING","Composite identity keys must have corresponding parts.")
    _list(body["fields"],"Complete selected field mapping",LIMITS["fieldsPerMapping"],1);ids=set()
    for field in body["fields"]:
        _keys(field,("id","label","source","target","type","required","allowNull"),"Mapped field")
        _plain(field["id"]);text(field["label"],"Field label",200);_pointer(field["source"]);_pointer(field["target"])
        require(field["id"] not in ids,"MAPPING","Mapped field ID repeats.");ids.add(field["id"])
        require(field["type"] in ("EXACT","TEXT","DECIMAL","DATETIME","BOOLEAN") and type(field["required"])is bool and type(field["allowNull"])is bool,"MAPPING","Invalid mapped field semantics.")
    require(isinstance(body["roles"],dict) and all(v in ids for v in body["roles"].values()),"MAPPING","Every semantic role must name an actual mapped field.")
    required={"PROPERTY":("identity",),"RENTAL_SPACE":("identity","property"),"LEASE":("identity","rentalSpace","leaseStatus","effectiveStart","effectiveEnd"),"PROJECT":("projectId","property"),"DOCUMENT":("documentId","documentVersion","property","documentHash","documentBytes"),"FINANCE":("identity","counterparty","currency","amount"),"SPATIAL":("identity","crs","units")}.get(body["family"],())
    permitted=set(required)|({"parent"}if body["family"]=="PROPERTY"else set())
    require(set(required)<=set(body["roles"]) and set(body["roles"])<=permitted,"MAPPING","Use the complete declared semantic roles for this dataset family.")
    for role,field_id in body["roles"].items():
        f=next(x for x in body["fields"]if x["id"]==field_id)
        require(f["required"],"MAPPING","Semantic fields must be explicitly mapped as required.")
        if role in ("amount","documentBytes"):require(f["type"]=="DECIMAL","MAPPING","Amounts and document sizes use exact decimal strings.")
        if role in ("effectiveStart","effectiveEnd"):require(f["type"]=="DATETIME","MAPPING","Lease interval fields use offset date/time semantics.")
        if role in ("currency","documentHash","leaseStatus","crs","units"):require(f["type"]=="TEXT","MAPPING","This semantic role requires exact original text.")
        if role not in ("effectiveEnd","parent"):require(not f["allowNull"],"MAPPING","Required semantic identity/value cannot be null.")
    require(body["activeStates"]==["LIVE","ACTIVE"] and type(body["endInclusive"])is bool,"MAPPING","Preserve explicit LIVE/ACTIVE states and declared endpoint semantics.")
    text(body["identityNamespace"],"Original identity namespace",200)
    relation="rentalSpace" if body["family"]=="LEASE" else("property" if body["family"]in("RENTAL_SPACE","PROJECT","DOCUMENT")else None)
    require(isinstance(body["references"],dict)and set(body["references"])==({relation}if relation else set()),"MAPPING","Declare the actual relationship identity scope.")
    for reference in body["references"].values():
        _keys(reference,("sourcePlatform","targetPlatform","identityNamespace"),"Relationship identity scope")
        require(reference["sourcePlatform"]in PLATFORMS and reference["targetPlatform"]in PLATFORMS,"MAPPING","Unknown relationship authority.")
        text(reference["identityNamespace"],"Referenced population identity namespace",200)
    _mapping_authority(body)
def _approved(state,mapping_id):
    candidates=[x for x in state["approvals"]if x["body"]["mappingId"]==mapping_id]
    require(candidates and candidates[-1]["body"]["decision"]=="APPROVED","MAPPING_APPROVAL","The selected immutable mapping needs a current named approval.")
    return candidates[-1]
def _cohort(state,reconciliation):
    return sorted(_pair_scope(state,p)for p in reconciliation["body"]["pairs"])
def _record(state,command,result):
    body=command["body"];record={"id":body["id"],"kind":command["kind"],"body":copy.deepcopy(body),"createdAt":command["at"],"actor":copy.deepcopy(command["actor"]),"requestId":command["requestId"],"sequence":sum(len(state[c])for c in COLLECTIONS)+1,"result":result}
    record["sha256"]=digest(record);state[KINDS[command["kind"]]].append(record);return record
def new_state(workspace_id,title,created_at):
    identifier(workspace_id);text(title,"Workspace title",240);_time(created_at)
    return {"schema":SCHEMA,"id":workspace_id,"title":title,"createdAt":created_at,**{key:[]for key in COLLECTIONS}}

def _report(state,record,read_blob,cache):
    body=record["body"];cutoff=_time(body["cutoff"]);output=[];findings=[];finding_ids=set();pair_views=[];semantic={"source":[],"target":[]};coverage={"source":{},"target":{}}
    counts={k:0 for k in ("expected","observed","matched","missing","extra","conflicting","duplicateSource","duplicateTarget","unverified")}
    def finding(code,severity,message,**context):
        value={"code":code,"severity":severity,"message":message,**context}
        value["id"]=digest({"reconciliationId":record["id"],**value})
        if value["id"]not in finding_ids:findings.append(value);finding_ids.add(value["id"])
    if body["load"]["outcome"]!="SUCCESS":finding("LOAD_NOT_CONFIRMED","BLOCKING","The actual original load has no successful completed outcome.",operationId=body["load"]["operationId"])
    total=0
    for pair_number,pair in enumerate(body["pairs"]):
        mapping=_find(state,"mappings",pair["mappingId"]);source=_find(state,"sourceEditions",pair["sourceId"]);target=_find(state,"sourceEditions",pair["targetId"])
        source_rows=_rows(source,read_blob,cache);target_rows=_rows(target,read_blob,cache)
        total+=len(source_rows)+len(target_rows);require(total<=LIMITS["rowsPerReconciliation"],"ROW_LIMIT","The complete reconciliation exceeds its explicit local working-cohort limit.")
        counts["expected"]+=len(source_rows);counts["observed"]+=len(target_rows)
        pair_view={"index":pair_number,**pair,"mappingSha256":mapping["sha256"],"sourceSha256":source["sha256"],"targetSha256":target["sha256"],"family":mapping["body"]["family"],"expected":len(source_rows),"observed":len(target_rows)}
        pair_views.append(pair_view)
        for side,dataset in (("source",source),("target",target)):
            ext=dataset["body"]["extraction"]
            observed=len(source_rows)if side=="source"else len(target_rows)
            if not _verified_population(dataset,observed):
                finding("INCOMPLETE_POPULATION","BLOCKING","Partial/delta, unknown denominator or mismatched declared count cannot establish complete-population receiving.",pair=pair_number,side=side,sourceId=dataset["id"],declaredRows=ext["expectedRows"],observedRows=observed,declaredComplete=ext["complete"],mode=ext["mode"])
            if _time(ext["cutoff"])!=cutoff:
                finding("CUTOFF_MISMATCH","BLOCKING","The source's declared effective cutoff differs from this reconciliation.",pair=pair_number,side=side,sourceId=dataset["id"],declared=ext["cutoff"])
        groups={};keysets={}
        for side,dataset,rows in (("source",source,source_rows),("target",target,target_rows)):
            groups[side]={};keysets[side]=_verified_population(dataset,len(rows),cutoff)
            scope=(mapping["body"]["family"],mapping["body"][side+"Platform"],mapping["body"]["identityNamespace"])
            coverage[side][scope]=coverage[side].get(scope,True)and keysets[side]
            for index,row in enumerate(rows,1):
                normalized=_normal(row,mapping,side)
                located={"row":index,"sourceId":dataset["id"],"blobSha256":dataset["body"]["blob"]["sha256"],"identity":normalized["identity"],"values":normalized["values"],"errors":normalized["errors"]}
                semantic[side].append({"pair":pair_number,"mapping":mapping,"location":located})
                if normalized["errors"]:
                    coverage[side][scope]=False
                    counts["unverified"]+=1
                    finding("INVALID_SOURCE_VALUE","BLOCKING","An original identity or required typed field cannot be verified.",pair=pair_number,side=side,row=index,errors=normalized["errors"])
                if normalized["identity"] is None:
                    keysets[side]=False
                    output.append({"pair":pair_number,"status":"UNVERIFIED","identity":None,"source":located if side=="source"else None,"target":located if side=="target"else None,"differences":[]})
                else:groups[side].setdefault(canonical(normalized["identity"]),[]).append(located)
        all_keys=sorted(set(groups["source"])|set(groups["target"]))
        for key in all_keys:
            earlier=groups["source"].get(key,[]);following=groups["target"].get(key,[])
            identity=(earlier or following)[0]["identity"]
            if len(earlier)>1 or len(following)>1:
                if len(earlier)>1:counts["duplicateSource"]+=len(earlier)
                if len(following)>1:counts["duplicateTarget"]+=len(following)
                finding("DUPLICATE_IDENTITY","BLOCKING","The explicit original key is not unique; no convenient row is chosen.",pair=pair_number,identity=identity,sourceRows=[x["row"]for x in earlier],targetRows=[x["row"]for x in following])
                output.append({"pair":pair_number,"status":"DUPLICATE","identity":identity,"sources":earlier,"targets":following,"differences":[]})
            elif not earlier:
                verified=keysets["source"]
                counts["extra"if verified else"unverified"]+=1;output.append({"pair":pair_number,"status":"EXTRA"if verified else"UNVERIFIED","identity":identity,"source":None,"target":following[0],"differences":[]})
                finding("EXTRA_TARGET"if verified else"UNVERIFIED_SOURCE_MEMBERSHIP","REVIEW"if verified else"BLOCKING","The independently returned identity is outside the complete original source keyset."if verified else"The original source population or identity keyset is incomplete; this returned identity cannot be classified as extra.",pair=pair_number,identity=identity,targetRow=following[0]["row"])
            elif not following:
                verified=keysets["target"]
                counts["missing"if verified else"unverified"]+=1;output.append({"pair":pair_number,"status":"MISSING"if verified else"UNVERIFIED","identity":identity,"source":earlier[0],"target":None,"differences":[]})
                finding("MISSING_TARGET"if verified else"UNVERIFIED_TARGET_MEMBERSHIP","REVIEW"if verified else"BLOCKING","The expected original identity is absent from the complete independent target keyset."if verified else"The independent target population or identity keyset is incomplete; absence of this identity is unverified.",pair=pair_number,identity=identity,sourceRow=earlier[0]["row"])
            else:
                a,b=earlier[0],following[0];different=[]
                for f in mapping["body"]["fields"]:
                    av=a["values"].get(f["id"]);bv=b["values"].get(f["id"])
                    if canonical(av)!=canonical(bv):different.append({"field":f["id"],"label":f["label"],"source":av,"target":bv})
                status="UNVERIFIED"if a["errors"]or b["errors"]else("CONFLICT"if different else"MATCHED")
                if status=="MATCHED":counts["matched"]+=1
                if status=="CONFLICT":
                    counts["conflicting"]+=1
                    finding("FIELD_DIFFERENCE","REVIEW","Mapped original values differ; aggregate totals cannot resolve a row discrepancy.",pair=pair_number,identity=identity,sourceRow=a["row"],targetRow=b["row"],fields=[x["field"]for x in different])
                output.append({"pair":pair_number,"status":status,"identity":identity,"source":a,"target":b,"differences":different})
    for side,entries in semantic.items():
        properties={};spaces={};leases={};projects={};documents={};property_links=[];space_links=[]
        def semantic_key(value,scope):
            require(value is not MISSING and value is not None and value!="" and type(value)in(str,int,bool),"SEMANTIC_ID","Semantic identity must be a nonempty scalar.")
            return canonical({"platform":scope[side+"Platform"],"namespace":scope["identityNamespace"],"type":type(value).__name__,"value":value})
        for entry in entries:
            m=entry["mapping"];loc=entry["location"];family=m["body"]["family"];values=loc["values"]
            context={"side":side,"pair":entry["pair"],"row":loc["row"],"sourceId":loc["sourceId"]}
            if loc["errors"]:continue
            role=lambda name:_role(values,m,name)
            own=m["body"];ref=m["body"]["references"]
            key_of=lambda value:semantic_key(value,own)
            try:
                if family=="PROPERTY":
                    key=key_of(role("identity"))
                    require(key not in properties,"SEMANTIC_DUPLICATE","Property identity repeats across the accepted cohort.")
                    parent=role("parent");properties[key]={"entry":entry,"parent":None if parent is MISSING or parent is None or parent==""else key_of(parent)}
                elif family=="RENTAL_SPACE":
                    key=key_of(role("identity"));parent=semantic_key(role("property"),ref["property"])
                    require(key not in spaces,"SEMANTIC_DUPLICATE","Rental-space identity repeats across the accepted cohort.");spaces[key]=entry;property_links.append((parent,entry,"RENTAL_SPACE_PROPERTY"))
                elif family=="LEASE":
                    key=key_of(role("identity"));space=semantic_key(role("rentalSpace"),ref["rentalSpace"])
                    state_value=role("leaseStatus");require(isinstance(state_value,str) and state_value!="","LEASE_STATE","Lease state must be actual original text.")
                    start=_time(role("effectiveStart"));end_value=role("effectiveEnd");end=None if end_value is None else _time(end_value)
                    require(end is None or end>=start,"LEASE_INTERVAL","Lease ends before its original effective start.")
                    space_links.append((space,entry,"LEASE_RENTAL_SPACE"))
                    if state_value in m["body"]["activeStates"]:leases.setdefault(space,[]).append({"key":key,"start":start,"end":end,"inclusive":m["body"]["endInclusive"],"entry":entry})
                elif family=="PROJECT":
                    key=key_of(role("projectId"));parent=semantic_key(role("property"),ref["property"]);require(key not in projects,"SEMANTIC_DUPLICATE","KPN project identity repeats; it is not a property hierarchy label.")
                    projects[key]=entry;property_links.append((parent,entry,"PROJECT_PROPERTY"))
                elif family=="DOCUMENT":
                    key=(key_of(role("documentId")),key_of(role("documentVersion")))
                    require(key not in documents,"SEMANTIC_DUPLICATE","The controlled document/version identity repeats.")
                    sha_id(role("documentHash"));size=_decimal(role("documentBytes"));require("."not in size and not size.startswith("-"),"DOCUMENT_BYTES","Original document version bytes must be a nonnegative integer string.")
                    documents[key]=entry;property_links.append((semantic_key(role("property"),ref["property"]),entry,"DOCUMENT_PROPERTY"))
                elif family=="FINANCE":
                    key_of(role("identity"));key_of(role("counterparty"))
                    require(isinstance(role("currency"),str)and re.fullmatch(r"[A-Z]{3}",role("currency")),"CURRENCY","Retain an explicit three-letter currency; no rate conversion or inferred currency.")
                    _decimal(role("amount"))
                elif family=="SPATIAL":
                    key_of(role("identity"));text(role("crs"),"Supplied CRS",300);text(role("units"),"Supplied spatial units",100)
            except ValueError as error:
                coverage[side][(family,m["body"][side+"Platform"],m["body"]["identityNamespace"])]=False
                finding("BUSINESS_RULE","BLOCKING",str(error),**context)
        def absent_reference(parent,entry,code,family,message):
            reference=loads(parent);certain=coverage[side].get((family,reference["platform"],reference["namespace"]),False)
            finding(code if certain else"UNVERIFIED_"+code,"BLOCKING",message if certain else"The referenced population or semantic identity keyset is incomplete or unselected; absence is unverified.",side=side,pair=entry["pair"],row=entry["location"]["row"],reference=reference,classification="MISSING"if certain else"UNVERIFIED")
        for parent,entry,code in property_links:
            if parent not in properties:absent_reference(parent,entry,code,"PROPERTY","Referenced property identity is outside the complete accepted property population.")
        for parent,entry,code in space_links:
            if parent not in spaces:absent_reference(parent,entry,code,"RENTAL_SPACE","Referenced rental-space identity is outside the complete accepted rental-space population.")
        colors={}
        for start in properties:
            if colors.get(start)==2:continue
            path=[];positions={};current=start
            while current is not None and current in properties and colors.get(current)!=2:
                if current in positions:
                    involved=path[positions[current]:]
                    finding("PROPERTY_HIERARCHY_CYCLE","BLOCKING","Original property hierarchy contains a cycle.",side=side,identities=[loads(x)for x in involved]);break
                positions[current]=len(path);path.append(current);parent=properties[current]["parent"]
                if parent is not None and parent not in properties:
                    entry=properties[current]["entry"];absent_reference(parent,entry,"PROPERTY_PARENT_MISSING","PROPERTY","Original property parent is absent from this complete cohort.")
                current=parent
            for key in path:colors[key]=2
        for space,rows in leases.items():
            ordered=sorted(rows,key=lambda x:(x["start"],x["entry"]["pair"],x["entry"]["location"]["row"]))
            furthest=None
            for current in ordered:
                if furthest is not None and(furthest["end"]is None or current["start"]<furthest["end"]or(current["start"]==furthest["end"]and furthest["inclusive"])):
                    a=furthest["entry"];b=current["entry"]
                    finding("MULTIPLE_ACTIVE_LEASES","BLOCKING","Explicit LIVE/ACTIVE lease intervals overlap for one rental space.",side=side,rentalSpace=loads(space),first={"pair":a["pair"],"row":a["location"]["row"]},second={"pair":b["pair"],"row":b["location"]["row"]})
                if furthest is None or(furthest["end"]is not None and(current["end"]is None or current["end"]>furthest["end"]or(current["end"]==furthest["end"]and current["inclusive"]))):furthest=current
            current_active=[x for x in ordered if x["start"]<=cutoff and(x["end"]is None or cutoff<x["end"]or(cutoff==x["end"]and x["inclusive"]))]
            if len(current_active)>1:finding("ACTIVE_LEASE_AT_CUTOFF","BLOCKING","More than one explicitly LIVE/ACTIVE lease applies to this rental space at the reviewed cutoff.",side=side,rentalSpace=loads(space),rows=[{"pair":x["entry"]["pair"],"row":x["entry"]["location"]["row"]}for x in current_active])
    findings.sort(key=lambda x:x["id"])
    result={"schema":"bluewave.independent-reconciliation.v1","id":record["id"],"cutoff":body["cutoff"],"pairs":pair_views,"counts":counts,"rows":output,"findings":findings,"blocking":sum(x["severity"]=="BLOCKING"for x in findings),"ready":not findings}
    number_tokens=[];result=_source_display(result,tokens=number_tokens);result["numberTokens"]=number_tokens
    require(len(canonical(result))<=LIMITS["reportBytes"],"REPORT_LIMIT","Complete report exceeds the supported bound; select a declared complete working cohort.")
    return result
def _accepted_report(state,reconciliation,read_blob,cache):
    report_value=_report(state,reconciliation,read_blob,cache)
    require(report_value["blocking"]==0,"RECONCILIATION_BLOCKED","Coverage, identity, type, hierarchy or lease blockers cannot be waived.")
    accepted=[]
    for finding in report_value["findings"]:
        choices=[x for x in state["decisions"]if x["body"]["reconciliationId"]==reconciliation["id"]and x["body"]["findingId"]==finding["id"]]
        require(choices and choices[-1]["body"]["disposition"]=="ACCEPT_EXCEPTION","FINDINGS_OPEN","Every remaining original discrepancy needs an explicit named acceptance or a later corrected reconciliation.")
        accepted.append(choices[-1]["id"])
    return {"reportSha256":digest(report_value),"decisionIds":accepted,"acceptedWithExceptions":bool(accepted)}

def _release_report(state,reconciliation,read_blob,cache):
    approvals=[_approved(state,pair["mappingId"])for pair in reconciliation["body"]["pairs"]]
    accepted=_accepted_report(state,reconciliation,read_blob,cache)
    return {**accepted,"mappingApprovals":[{"id":x["id"],"sha256":x["sha256"],"mappingId":x["body"]["mappingId"]}for x in approvals]}

def _core(state,command,read_blob,cache):
    _keys(command,("requestId","kind","actor","at","body"),"Original command")
    identifier(command["requestId"]);_time(command["at"])
    _keys(command["actor"],("id","name"),"Named operator");text(command["actor"]["id"],"Operator ID",128);text(command["actor"]["name"],"Operator name",160)
    require(command["kind"]in KINDS and isinstance(command["body"],dict),"COMMAND","Unknown original operating command.")
    b=command["body"];identifier(b.get("id"));events=_all(state)
    require(len(events)<LIMITS["events"],"STATE_LIMIT","Complete retained event history reached its explicit local limit.")
    require(not any(x["id"]==b["id"] or x["requestId"]==command["requestId"]for x in events),"IDENTITY_REUSE","Use the original store request lookup for replay; saved event IDs cannot be rewritten.")
    require(_time(command["at"])>=_time(events[-1]["createdAt"]if events else state["createdAt"]),"COMMAND_TIME","Command observation cannot precede its retained workspace history.")
    kind=command["kind"];result={}
    if kind=="source.import":
        _keys(b,("id","label","role","platform","family","format","blob","jsonPointer","csv","extraction","note"),"Source edition")
        text(b["label"],"Source label",240);_note(b["note"]);_pointer(b["jsonPointer"])
        require(len(state["sourceEditions"])<LIMITS["sources"],"SOURCE_LIMIT","Original source edition limit reached.")
        require(b["role"]in("SOURCE","TARGET")and b["platform"]in PLATFORMS and b["family"]in FAMILIES and b["format"]in("JSON","JSONL","CSV"),"SOURCE","Select original source role, actual authority and encoding.")
        _keys(b["csv"],("delimiter","nullToken"),"CSV interpretation")
        require(isinstance(b["csv"]["delimiter"],str)and len(b["csv"]["delimiter"])==1 and b["csv"]["delimiter"]not in '\r\n"\0',"CSV","Select one original delimiter.")
        token=b["csv"]["nullToken"];require(token is None or isinstance(token,str)and 0<len(token)<=100 and "\x00"not in token,"CSV","Null token must be explicit nonempty source text; empty remains distinct.")
        ext=b["extraction"]
        _keys(ext,("id","at","cutoff","mode","scope","complete","expectedRows","method","reference","independent","loadOperationId"),"Original acquisition")
        identifier(ext["id"]);_time(ext["at"]);_time(ext["cutoff"])
        require(_time(ext["cutoff"])<=_time(ext["at"])<=_time(command["at"]),"SOURCE_TIME","Actual effective cutoff must not follow extraction, and extraction must precede intake.")
        require(ext["mode"]in("FULL","PARTIAL","DELTA")and type(ext["complete"])is bool and type(ext["independent"])is bool,"SOURCE","Invalid original acquisition coverage.")
        for k in("scope","method","reference"):text(ext[k],"Acquisition "+k,2000)
        require(ext["expectedRows"]is None or type(ext["expectedRows"])is int and 0<=ext["expectedRows"]<=9007199254740991,"SOURCE_COVERAGE","Retain the actual expected denominator or explicit unknown.")
        require(not any(x["body"]["extraction"]["id"]==ext["id"]for x in state["sourceEditions"]),"ACQUISITION_REUSE","Use the existing source edition for this acquisition; it cannot be relabeled.")
        if b["role"]=="TARGET":
            require(ext["independent"],"TARGET_EVIDENCE","A target return must be separately retrieved, not an echoed load request.")
            identifier(ext["loadOperationId"])
        else:require(ext["loadOperationId"]is None,"SOURCE","Source intake does not claim a target load operation.")
        source={"id":b["id"],"body":b};rows=_rows(source,read_blob,cache)
        result={"rowCount":len(rows),"sourceSha256":b["blob"]["sha256"],"complete":_verified_population(source,len(rows)),"interpretationSha256":digest({"format":b["format"],"jsonPointer":b["jsonPointer"],"csv":b["csv"]})}
    elif kind=="mapping.save":
        _validate_mapping(b);previous=None
        if b["previousId"]is not None:
            previous=_find(state,"mappings",b["previousId"])
            require(not any(x["body"]["previousId"]==previous["id"]for x in state["mappings"]),"MAPPING_EDITION","Continue the latest mapping edition.")
            for k in("family","sourcePlatform","targetPlatform","identityNamespace"):require(b[k]==previous["body"][k],"MAPPING_EDITION","A correction retains its original population and platform identity.")
        result={"previousSha256":previous["sha256"]if previous else None,"authority":AUTHORITIES.get(b["targetPlatform"],"Explicitly declared original target.")}
    elif kind=="mapping.review":
        _keys(b,("id","mappingId","decision","note","evidence"),"Mapping review")
        mapping=_find(state,"mappings",b["mappingId"]);require(b["decision"]in("APPROVED","REJECTED"),"DECISION","Choose the actual review decision.");_note(b["note"]);_evidence(b["evidence"],read_blob,cache,1)
        result={"mappingSha256":mapping["sha256"]}
    elif kind=="reconciliation.create":
        _keys(b,("id","label","stage","cutoff","previousId","pairs","load","note"),"Independent target reconciliation")
        text(b["label"],"Reconciliation label",240);_note(b["note"]);_time(b["cutoff"])
        require(b["stage"]in("REHEARSAL_1","REHEARSAL_2","CUTOVER"),"STAGE","Choose the actual receiving stage.")
        if b["previousId"]is not None:_find(state,"reconciliations",b["previousId"])
        _list(b["pairs"],"Complete population pairs",LIMITS["pairs"],1)
        load=b["load"];_keys(load,("operationId","startedAt","completedAt","writer","reference","inputSha256","outcome","evidence"),"Original load observation")
        identifier(load["operationId"]);_time(load["startedAt"]);_time(load["completedAt"]);sha_id(load["inputSha256"]);text(load["writer"],"Actual authorized writer",240);text(load["reference"],"Original operation/return reference",2000)
        require(_time(load["startedAt"])<=_time(load["completedAt"])<=_time(command["at"]),"LOAD_TIME","Original load observation times are inconsistent.")
        require(load["outcome"]in("SUCCESS","PARTIAL","FAILED","UNKNOWN"),"LOAD","Retain actual original outcome; an acknowledgement is not assumed complete.")
        _evidence(load["evidence"],read_blob,cache,1)
        require(any(x["sha256"]==load["inputSha256"]for x in load["evidence"]),"LOAD_INPUT","Retain the exact original load input among its evidence files.")
        bindings=[];approvals=[];used=set();scopes=set();used_sources=set()
        for pair in b["pairs"]:
            _keys(pair,("mappingId","sourceId","targetId"),"Population pair")
            mapping=_find(state,"mappings",pair["mappingId"]);source=_find(state,"sourceEditions",pair["sourceId"]);target=_find(state,"sourceEditions",pair["targetId"]);mb=mapping["body"]
            require(source["id"]!=target["id"]and source["body"]["role"]=="SOURCE"and target["body"]["role"]=="TARGET","TARGET_EVIDENCE","Select original source and independently acquired target roles.")
            require(source["body"]["platform"]==mb["sourcePlatform"]and target["body"]["platform"]==mb["targetPlatform"]and source["body"]["family"]==target["body"]["family"]==mb["family"],"MAPPING_BINDING","The actual datasets differ from the selected mapping authority/family.")
            require(source["body"]["extraction"]["scope"]==target["body"]["extraction"]["scope"],"POPULATION_SCOPE","Source and independent target must declare the same reviewed full population scope.")
            require(_time(source["body"]["extraction"]["at"])<=_time(load["startedAt"]),"SOURCE_TIME","Original source acquisition must precede the selected load.")
            te=target["body"]["extraction"]
            require(te["independent"]and te["loadOperationId"]==load["operationId"]and _time(te["at"])>=_time(load["completedAt"]),"TARGET_EVIDENCE","Independent target acquisition must follow and bind this exact original load.")
            require(te["id"]!=source["body"]["extraction"]["id"],"TARGET_EVIDENCE","Source and target cannot reuse one acquisition identity.")
            scope=(mb["family"],mb["sourcePlatform"],mb["targetPlatform"],mb["identityNamespace"],source["body"]["extraction"]["scope"])
            require(scope not in scopes and mapping["id"]not in used and source["id"]not in used_sources and target["id"]not in used_sources,"POPULATION_DUPLICATE","Each complete selected population appears exactly once.")
            scopes.add(scope);used.add(mapping["id"]);used_sources.update((source["id"],target["id"]))
            approved=_approved(state,mapping["id"]);approvals.append(approved["id"])
            bindings.append({**pair,"mappingSha256":mapping["sha256"],"sourceSha256":source["sha256"],"targetSha256":target["sha256"],"approvalId":approved["id"],"approvalSha256":approved["sha256"]})
        derived=_report(state,{"id":b["id"],"body":b},read_blob,cache)
        result={"pairBindings":bindings,"approvalIds":approvals,"reportSha256":digest(derived),"counts":derived["counts"],"blocking":derived["blocking"],"ready":derived["ready"],"findingCount":len(derived["findings"])}
    elif kind=="finding.decide":
        _keys(b,("id","reconciliationId","findingId","disposition","reason","evidence"),"Original finding decision")
        reconciliation=_find(state,"reconciliations",b["reconciliationId"]);sha_id(b["findingId"]);text(b["reason"],"Named decision reason",8000);_evidence(b["evidence"],read_blob,cache,1)
        require(b["disposition"]in("ACCEPT_EXCEPTION","REQUIRE_CORRECTION"),"DECISION","Choose an explicit discrepancy disposition.")
        derived=_report(state,reconciliation,read_blob,cache);found=next((x for x in derived["findings"]if x["id"]==b["findingId"]),None)
        require(found is not None,"FINDING","Selected original finding is absent.")
        require(b["disposition"]!="ACCEPT_EXCEPTION"or found["severity"]=="REVIEW","FINDING","Coverage, identity, type, hierarchy and lease blockers cannot be waived.")
        result={"reconciliationSha256":reconciliation["sha256"],"findingSha256":digest(found)}
    elif kind=="rehearsal.record":
        _keys(b,("id","number","reconciliationId","previousId","decision","note","evidence"),"Rehearsal outcome")
        require(type(b["number"])is int and b["number"]in(1,2)and b["decision"]in("ACCEPTED","REJECTED"),"REHEARSAL","Record actual first/second rehearsal decision.")
        _note(b["note"]);_evidence(b["evidence"],read_blob,cache,1);reconciliation=_find(state,"reconciliations",b["reconciliationId"])
        require(reconciliation["body"]["stage"]=="REHEARSAL_"+str(b["number"]),"REHEARSAL","The reconciliation is from a different original stage.")
        previous=None
        if b["number"]==1:require(b["previousId"]is None,"REHEARSAL","First rehearsal has no preceding rehearsal.")
        else:
            previous=_find(state,"rehearsals",b["previousId"]);require(previous["body"]["number"]==1 and previous["body"]["decision"]=="ACCEPTED","REHEARSAL","Second rehearsal requires the actual accepted first rehearsal.")
            first=_find(state,"reconciliations",previous["body"]["reconciliationId"])
            require(reconciliation["body"]["previousId"]==first["id"]and _cohort(state,reconciliation)==_cohort(state,first),"REHEARSAL","Second rehearsal must preserve the complete first population and its original lineage.")
            require(reconciliation["body"]["load"]["operationId"]!=first["body"]["load"]["operationId"],"REHEARSAL","The second rehearsal is a separate actual original load, not a relabeled first result.")
            old={_pair_scope(state,p):p for p in first["body"]["pairs"]}
            for pair in reconciliation["body"]["pairs"]:
                earlier=old[_pair_scope(state,pair)];a=_find(state,"sourceEditions",earlier["sourceId"]);z=_find(state,"sourceEditions",pair["sourceId"])
                require(a["id"]!=z["id"]and _time(z["body"]["extraction"]["at"])>_time(a["body"]["extraction"]["at"])and _time(z["body"]["extraction"]["cutoff"])>=_time(a["body"]["extraction"]["cutoff"]),"REHEARSAL","Second rehearsal requires a later original full source acquisition; unchanged legitimate content is allowed.")
                prior_map=_find(state,"mappings",earlier["mappingId"]);new_map=_find(state,"mappings",pair["mappingId"]);require(_mapping_descends(state,new_map,prior_map["id"]),"MAPPING_EDITION","Later rehearsal mapping must retain its actual reviewed lineage.")
        accepted=_accepted_report(state,reconciliation,read_blob,cache)if b["decision"]=="ACCEPTED"else None
        result={"reconciliationSha256":reconciliation["sha256"],"previousSha256":previous["sha256"]if previous else None,"acceptance":accepted}
    elif kind=="cutover.plan":
        _keys(b,("id","rehearsalIds","cutoff","scope","authority","changeWindowStart","changeWindowEnd","deltaPolicy","rollbackPlan","recoveryEvidence","note"),"Cutover plan")
        _list(b["rehearsalIds"],"Two accepted rehearsals",2,2);first=_find(state,"rehearsals",b["rehearsalIds"][0]);second=_find(state,"rehearsals",b["rehearsalIds"][1])
        require(first["body"]["number"]==1 and second["body"]["number"]==2 and second["body"]["previousId"]==first["id"]and first["body"]["decision"]==second["body"]["decision"]=="ACCEPTED","CUTOVER","The plan requires both actual accepted rehearsals in order.")
        for k in("scope","authority","deltaPolicy","rollbackPlan"):text(b[k],"Cutover "+k,8000)
        _note(b["note"]);_time(b["cutoff"]);_time(b["changeWindowStart"]);_time(b["changeWindowEnd"]);_evidence(b["recoveryEvidence"],read_blob,cache,1)
        require(_time(b["changeWindowStart"])<=_time(b["cutoff"])<=_time(b["changeWindowEnd"]),"CUTOVER_TIME","Cutoff must be inside the explicit agreed change window.")
        second_report=_find(state,"reconciliations",second["body"]["reconciliationId"])
        require(_time(b["cutoff"])>=_time(second_report["body"]["cutoff"]),"CUTOVER_TIME","Production cutoff cannot precede the accepted later rehearsal.")
        release=_release_report(state,second_report,read_blob,cache)
        result={"rehearsalBindings":[{"id":x["id"],"sha256":x["sha256"]}for x in(first,second)],"reconciliationId":second_report["id"],"reconciliationSha256":second_report["sha256"],"releaseBasis":release}
    elif kind=="cutover.decide":
        _keys(b,("id","planId","decision","reason","evidence"),"Cutover authorization")
        plan=_find(state,"cutovers",b["planId"]);require(plan["kind"]=="cutover.plan","CUTOVER","Select the immutable cutover plan.")
        require(b["decision"]in("AUTHORIZED","REJECTED"),"CUTOVER","Record actual release authority decision.")
        text(b["reason"],"Authorization reason",8000);_evidence(b["evidence"],read_blob,cache,1)
        release=None
        if b["decision"]=="AUTHORIZED":
            require(_time(command["at"])<=_time(plan["body"]["changeWindowEnd"]),"CUTOVER_TIME","A new release authorization cannot be backdated after its change window.")
            release=_release_report(state,_find(state,"reconciliations",plan["result"]["reconciliationId"]),read_blob,cache)
        result={"planSha256":plan["sha256"],"releaseBasis":release}
    elif kind=="cutover.close":
        _keys(b,("id","planId","reconciliationId","decision","deltaEvidence","recoveryEvidence","note","reason","loadObservation"),"Cutover receiving")
        plan=_find(state,"cutovers",b["planId"]);require(plan["kind"]=="cutover.plan","CUTOVER","Select the original cutover plan.");_note(b["note"])
        require(b["decision"]in("ACCEPTED","REJECTED"),"CUTOVER","Record actual final receiving decision.")
        text(b["reason"],"Actual receiving decision reason",8000)
        choices=[x for x in state["cutovers"]if x["kind"]=="cutover.decide"and x["body"]["planId"]==plan["id"]]
        authorization=choices[-1]if choices else None
        prior=_find(state,"reconciliations",plan["result"]["reconciliationId"])
        reconciliation=_find(state,"reconciliations",b["reconciliationId"])if b["reconciliationId"]is not None else None
        if reconciliation is not None:
            require(reconciliation["body"]["stage"]=="CUTOVER"and reconciliation["body"]["previousId"]==prior["id"],"CUTOVER","Any retained final reconciliation must identify this original cutover and its second rehearsal.")
        accepted=None;release=None
        if b["decision"]=="ACCEPTED":
            require(authorization is not None and authorization["body"]["decision"]=="AUTHORIZED","CUTOVER","The exact cutover plan must have actual current authorization.")
            require(reconciliation is not None and b["loadObservation"]is None,"CUTOVER","Accepted receiving requires its full original reconciliation; no alternate load observation replaces it.")
            require(_cohort(state,reconciliation)==_cohort(state,prior),"CUTOVER","Final independent return must cover the same complete rehearsed population.")
            require(_time(reconciliation["body"]["cutoff"])==_time(plan["body"]["cutoff"]),"CUTOVER","Final return must use the authorized cutoff.")
            require(sorted(p["mappingId"]for p in reconciliation["body"]["pairs"])==sorted(p["mappingId"]for p in prior["body"]["pairs"]),"CUTOVER","Final production must use the exact accepted mapping editions.")
            load=reconciliation["body"]["load"]
            require(_time(load["startedAt"])>=_time(authorization["createdAt"])and _time(plan["body"]["changeWindowStart"])<=_time(load["startedAt"])<=_time(load["completedAt"])<=_time(plan["body"]["changeWindowEnd"]),"CUTOVER_TIME","Actual original production load must fall in its authorized change window.")
            require(load["operationId"]!=prior["body"]["load"]["operationId"],"CUTOVER","Final production cannot reuse a rehearsal's load identity.")
            _evidence(b["deltaEvidence"],read_blob,cache,1);_evidence(b["recoveryEvidence"],read_blob,cache,1)
            release=copy.deepcopy(authorization["result"]["releaseBasis"])
            accepted=_release_report(state,reconciliation,read_blob,cache)
        else:
            _evidence(b["deltaEvidence"],read_blob,cache);_evidence(b["recoveryEvidence"],read_blob,cache)
            observed=b["loadObservation"]
            if observed is not None:
                _keys(observed,("operationId","startedAt","completedAt","writer","reference","inputSha256","outcome","evidence"),"Actual failed or incomplete load observation")
                if observed["operationId"]is not None:identifier(observed["operationId"])
                text(observed["writer"],"Actual writer or explicitly unknown writer",240);text(observed["reference"],"Original returned or unavailable-operation reference",2000)
                require(observed["outcome"]in("NOT_STARTED","RUNNING","SUCCESS","PARTIAL","FAILED","UNKNOWN"),"LOAD","Preserve the actual observation without assuming completion.")
                for key in("startedAt","completedAt"):
                    if observed[key]is not None:require(_time(observed[key])<=_time(command["at"]),"LOAD_TIME","An observed operation time cannot be in the future.")
                if observed["startedAt"]is not None and observed["completedAt"]is not None:
                    require(_time(observed["startedAt"])<=_time(observed["completedAt"]),"LOAD_TIME","Actual completion cannot precede actual start.")
                if observed["outcome"]=="NOT_STARTED":require(observed["startedAt"]is None and observed["completedAt"]is None,"LOAD_TIME","A not-started observation cannot claim actual execution times.")
                if observed["outcome"]=="RUNNING":require(observed["completedAt"]is None,"LOAD_TIME","A running observation cannot claim completed execution.")
                _evidence(observed["evidence"],read_blob,cache)
                if observed["inputSha256"]is not None:
                    sha_id(observed["inputSha256"])
                    require(any(x["sha256"]==observed["inputSha256"]for x in observed["evidence"]),"LOAD_INPUT","Retain the exact known original input with the load observation.")
                if reconciliation is not None:
                    require(observed["operationId"]==reconciliation["body"]["load"]["operationId"],"LOAD_BINDING","The additional observation must refer to the same original reconciled load.")
            require(b["deltaEvidence"]or b["recoveryEvidence"]or observed is not None and observed["evidence"],"CUTOVER_EVIDENCE","Retain actual failure, missing-return or recovery evidence rather than fabricate a receiving result.")
        result={"planSha256":plan["sha256"],"authorizationId":authorization["id"]if authorization else None,"authorizationSha256":authorization["sha256"]if authorization else None,"reconciliationSha256":reconciliation["sha256"]if reconciliation else None,"acceptance":accepted,"releaseBasis":release,"loadObservationSha256":digest(b["loadObservation"])if b["loadObservation"]is not None else None}
    elif kind=="handover.record":
        _keys(b,("id","cutoverId","recipient","receivedAt","reopenedAt","correctionRef","evidence","note"),"Independent editable handover")
        cutover=_find(state,"cutovers",b["cutoverId"])
        require(cutover["kind"]=="cutover.close"and cutover["body"]["decision"]=="ACCEPTED","HANDOVER","Receiving follows an actually accepted cutover.")
        text(b["recipient"],"Actual receiving operator",240);text(b["correctionRef"],"Original independent correction/reopen reference",2000);_note(b["note"]);_evidence(b["evidence"],read_blob,cache,1)
        require(_time(cutover["createdAt"])<=_time(b["receivedAt"])<=_time(b["reopenedAt"])<=_time(command["at"]),"HANDOVER_TIME","Retain actual ordered handover and independent reopen times.")
        result={"cutoverSha256":cutover["sha256"]}
    saved=_record(state,command,result)
    require(len(canonical(state))<=LIMITS["stateBytes"],"STATE_LIMIT","Complete state exceeds the portable local working-cohort bound.")
    return {"id":saved["id"],"sha256":saved["sha256"],"kind":kind,**result}
def _pair_scope(state,pair):
    mapping=_find(state,"mappings",pair["mappingId"])["body"];source=_find(state,"sourceEditions",pair["sourceId"])["body"]
    return(mapping["family"],mapping["sourcePlatform"],mapping["targetPlatform"],mapping["identityNamespace"],source["extraction"]["scope"])
def _mapping_descends(state,current,ancestor):
    seen=set()
    while current:
        if current["id"]==ancestor:return True
        require(current["id"]not in seen,"MAPPING_EDITION","Mapping history contains a cycle.");seen.add(current["id"])
        previous=current["body"]["previousId"];current=_find(state,"mappings",previous)if previous else None
    return False
def validate_state(state,read_blob):
    _keys(state,("schema","id","title","createdAt",*COLLECTIONS),"Complete workspace state")
    require(state["schema"]==SCHEMA,"SCHEMA","Unknown property-continuity workspace.")
    require(len(canonical(state))<=LIMITS["stateBytes"],"STATE_LIMIT","Complete imported state exceeds its bound.")
    for collection in COLLECTIONS:_list(state[collection],collection,LIMITS["events"])
    events=_all(state);require(len(events)<=LIMITS["events"],"STATE_LIMIT","Complete imported event history exceeds its bound.")
    original=new_state(state["id"],state["title"],state["createdAt"]);cache={}
    for sequence,event in enumerate(events,1):
        _keys(event,("id","kind","body","createdAt","actor","requestId","sequence","result","sha256"),"Saved original event")
        require(event["sequence"]==sequence and event["kind"]in KINDS,"HISTORY","Original operating events must be complete and consecutive.")
        require(event in state[KINDS[event["kind"]]],"HISTORY","Original event is in the wrong collection.")
        identity={k:v for k,v in event.items()if k!="sha256"};require(digest(identity)==event["sha256"],"HISTORY","Original operating event bytes differ.")
        command={"requestId":event["requestId"],"kind":event["kind"],"actor":event["actor"],"at":event["createdAt"],"body":event["body"]}
        _core(original,command,read_blob,cache)
        require(canonical(original[KINDS[event["kind"]]][-1])==canonical(event),"HISTORY","Saved result differs from its complete original sources and command.")
    require(canonical(original)==canonical(state),"HISTORY","Imported state differs from its full original operating history.")
    return {"events":len(events),"sources":len(state["sourceEditions"]),"reconciliations":len(state["reconciliations"]),"sha256":digest(state)}
def apply(state,command,read_blob):
    validate_state(state,read_blob)
    result=copy.deepcopy(state);outcome=_core(result,command,read_blob,{})
    return result,outcome

def _page(items,offset,limit):
    require(type(offset)is int and offset>=0 and type(limit)is int and 1<=limit<=100,"PAGE","Use a nonnegative offset and limit 1–100.")
    end=min(len(items),offset+limit)
    return {"total":len(items),"offset":offset,"nextOffset":end if end<len(items)else None,"items":items[offset:end]}
def source_rows(state,source_id,read_blob,offset=0,limit=100):
    source=_find(state,"sourceEditions",source_id);values=_rows(source,read_blob,{})
    page=_page(values,offset,limit)
    displayed=[]
    for i,row in enumerate(page["items"]):
        tokens=[];value=_source_display(row,tokens=tokens);displayed.append({"row":offset+i+1,"value":value,"numberTokens":tokens})
    return {"source":copy.deepcopy(source),"total":page["total"],"offset":offset,"nextOffset":page["nextOffset"],"rows":displayed}
def report(state,reconciliation_id,read_blob):
    entry=_find(state,"reconciliations",reconciliation_id);value=_report(state,entry,read_blob,{})
    require(digest(value)==entry["result"]["reportSha256"],"REPORT_IDENTITY","The complete original report changed.")
    return value
def report_rows(state,reconciliation_id,read_blob,offset=0,limit=100,status=None):
    value=report(state,reconciliation_id,read_blob)
    require(status is None or status in("MATCHED","MISSING","EXTRA","CONFLICT","DUPLICATE","UNVERIFIED"),"REPORT_FILTER","Unknown record status.")
    selected=value["rows"]if status is None else[x for x in value["rows"]if x["status"]==status]
    page=_page(selected,offset,limit)
    return {"reconciliation":copy.deepcopy(_find(state,"reconciliations",reconciliation_id)),"reportSha256":digest(value),"counts":value["counts"],"blocking":value["blocking"],"ready":value["ready"],"findingCount":len(value["findings"]),"total":page["total"],"offset":offset,"nextOffset":page["nextOffset"],"rows":page["items"],"numberTokens":value["numberTokens"]}
def finding_rows(state,reconciliation_id,read_blob,offset=0,limit=100,severity=None):
    value=report(state,reconciliation_id,read_blob)
    require(severity is None or severity in("BLOCKING","REVIEW"),"REPORT_FILTER","Unknown finding severity.")
    selected=value["findings"]if severity is None else[x for x in value["findings"]if x["severity"]==severity]
    page=_page(selected,offset,limit)
    return {"reconciliationId":reconciliation_id,"total":page["total"],"offset":offset,"nextOffset":page["nextOffset"],"findings":page["items"],"numberTokens":value["numberTokens"]}
def view(state,read_blob,as_of=None):
    if as_of is not None:_time(as_of)
    latest=state["reconciliations"][-1]if state["reconciliations"]else None
    accepted_first=[x for x in state["rehearsals"]if x["body"]["number"]==1 and x["body"]["decision"]=="ACCEPTED"]
    accepted_second=[x for x in state["rehearsals"]if x["body"]["number"]==2 and x["body"]["decision"]=="ACCEPTED"]
    accepted_cutovers=[x for x in state["cutovers"]if x["kind"]=="cutover.close"and x["body"]["decision"]=="ACCEPTED"]
    stage="SOURCE_AND_MAPPING"
    if state["reconciliations"]:stage="INDEPENDENT_RECONCILIATION"
    if accepted_first:stage="FIRST_REHEARSAL_ACCEPTED"
    if accepted_second:stage="SECOND_REHEARSAL_ACCEPTED"
    if accepted_cutovers:stage="CUTOVER_ACCEPTED"
    if state["handovers"]:stage="EDITABLE_HANDOVER_RECORDED"
    return {**copy.deepcopy(state),"summary":{"stage":stage,"sourceEditions":len(state["sourceEditions"]),"mappingEditions":len(state["mappings"]),"reconciliations":len(state["reconciliations"]),"events":sum(len(state[c])for c in COLLECTIONS),"latestReconciliationId":latest["id"]if latest else None,"latestCounts":copy.deepcopy(latest["result"]["counts"])if latest else None,"latestBlocking":latest["result"]["blocking"]if latest else None,"acceptedFirstRehearsals":len(accepted_first),"acceptedSecondRehearsals":len(accepted_second),"acceptedCutovers":len(accepted_cutovers),"handovers":len(state["handovers"])},"commands":list(KINDS),"limits":copy.deepcopy(LIMITS),"authorities":copy.deepcopy(AUTHORITIES),"asOf":as_of}
def report_html(state,reconciliation_id,read_blob):
    from html import escape
    value=report(state,reconciliation_id,read_blob);entry=_find(state,"reconciliations",reconciliation_id)
    def cell(v):return escape(json.dumps(v,ensure_ascii=False,sort_keys=True,indent=2))
    rows="".join("<tr><td>"+str(i+1)+"</td><td>"+escape(row["status"])+"</td><td><pre>"+cell(row)+"</pre></td></tr>"for i,row in enumerate(value["rows"]))
    findings="".join("<tr><td>"+escape(f["severity"])+"</td><td>"+escape(f["code"])+"</td><td>"+escape(f["message"])+"<pre>"+cell(f)+"</pre></td></tr>"for f in value["findings"])
    decisions=[x for x in state["decisions"]if x["body"]["reconciliationId"]==reconciliation_id]
    return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Property continuity review</title><style>body{font:15px/1.5 system-ui,sans-serif;color:#171717;background:#fff;margin:32px;max-width:1280px}table{border-collapse:collapse;width:100%;margin:20px 0}td,th{border:1px solid #bbb;padding:8px;vertical-align:top;text-align:left}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}h1,h2{line-height:1.2}.identity{overflow-wrap:anywhere}@media print{body{margin:10mm}tr{break-inside:avoid}}</style><h1>'+escape(state["title"])+'</h1><h2>'+escape(entry["body"]["label"])+'</h2><p class="identity">Original reconciliation '+escape(reconciliation_id)+' · SHA-256 '+digest(value)+'</p><p>Source cutoff '+escape(value["cutoff"])+'. This report compares the complete selected original populations and recorded independent target return. It does not execute tenant writes, make a financial posting, certify security or imply client acceptance.</p><h2>Population and exact original load</h2><pre>'+cell({"pairs":value["pairs"],"counts":value["counts"],"load":entry["body"]["load"],"operator":entry["actor"],"createdAt":entry["createdAt"]})+'</pre><h2>Original findings</h2><table><thead><tr><th>Severity</th><th>Code</th><th>Complete finding</th></tr></thead><tbody>'+findings+'</tbody></table><h2>Attributed decisions recorded in this workspace</h2><pre>'+cell(decisions)+'</pre><h2>Complete row comparison</h2><table><thead><tr><th>Row</th><th>Status</th><th>Original locations, mapped values and differences</th></tr></thead><tbody>'+rows+'</tbody></table><h2>Authority and local working-cohort limits</h2><pre>'+cell({"authorities":AUTHORITIES,"limits":LIMITS})+'</pre></html>'
