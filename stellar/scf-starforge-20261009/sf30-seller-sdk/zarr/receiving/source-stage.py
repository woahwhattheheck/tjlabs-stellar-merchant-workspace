"""One retained-source stage for the complete Zarr operator receiving journey.

This caller delegates every source import, array read, review, freeze and packet
operation to the original application. Requests are saved before dispatch and
reused verbatim after a lost response. It does not implement a Zarr decoder.
"""
from __future__ import annotations
import argparse,base64,fcntl,itertools,json,os,sys,uuid
from pathlib import Path
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"python"))
from files import require,encoded,digest,value_digest,read_json,publish,private_directory,file_identity
from workspace import Workspace
from packet import export_packet,receive_packet,inspect_packet
import native

def verify_values(result,expected):
    require(result["shape"]==expected["shape"],"ZARR_RECEIVING_SHAPE","The original returned shape differs from its source-derived expectation")
    require(result["rowCount"]==len(expected["values"]),"ZARR_RECEIVING_ROWS","The complete array population differs")
    actual=[]
    for row in result["rows"]:
        cell=row["value"];kind=expected["kind"]
        require(cell["kind"]==kind,"ZARR_RECEIVING_TYPE","The original native scalar class differs")
        if kind=="integer":value=int(cell["value"])
        elif kind=="float":value=float(cell["value"])
        elif kind=="bytes":value=base64.b64decode(cell["base64"]).decode("utf-8")
        else:value=cell["value"]
        actual.append(value)
    require(actual==expected["values"],"ZARR_RECEIVING_VALUES","The complete original array values differ from the retained generator source")
    positions=[]
    for size,axis in zip(result["sourceShape"],result["selection"]):
        positions.append([axis] if type(axis) is int else range(axis.get("start",0),axis.get("stop",size),axis.get("step",1)))
    require([row["sourceIndex"] for row in result["rows"]]==[list(x) for x in itertools.product(*positions)],
            "ZARR_RECEIVING_INDICES","The native result lost its exact source coordinates")
    require([row["ordinal"] for row in result["rows"]]==list(range(result["rowCount"])),
            "ZARR_RECEIVING_ORDER","The native result lost its original C-order cell identities")
    return {"shape":result["shape"],"rowCount":result["rowCount"],"kind":expected["kind"],
            "allValuesCompared":True,"allSourceIndicesCompared":True}

def receive_source_stage(input_file):
    selection=read_json(input_file)
    require(selection.get("schema")=="stellar-forge.zarr-native-source-selection.v1","ZARR_RECEIVING_INPUT","Choose a complete original source-stage selection")
    operation_id=selection["operationId"];root=Path(selection["outputRoot"])
    private_directory(root,True);journal=root/"source-stage";private_directory(journal,True)
    lease=os.open(journal/"receiving.lock",os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    fcntl.flock(lease,fcntl.LOCK_EX|fcntl.LOCK_NB)
    try:
        publish(journal/"input.json",encoded(selection))
        completed=journal/"result.json"
        workspace_path=Path(selection["workspace"])
        identity_path=journal/"workspace.json"
        if not workspace_path.exists():
            with Workspace(workspace_path,create=True) as created:
                publish(identity_path,encoded({"workspaceId":created.meta("id"),"directory":str(workspace_path)}))
        with Workspace(workspace_path) as workspace:
            if not identity_path.exists():
                require(workspace.meta("revision")==0 and not workspace._status()["operations"],
                        "ZARR_RECEIVING_WORKSPACE","An unrelated existing workspace must not be adopted")
                publish(identity_path,encoded({"workspaceId":workspace.meta("id"),"directory":str(workspace_path)}))
            require(read_json(identity_path)=={"workspaceId":workspace.meta("id"),"directory":str(workspace_path)},
                    "ZARR_RECEIVING_WORKSPACE","The original native workspace changed")
            if completed.exists():
                result=read_json(completed)
                require(result["workspaceId"]==workspace.meta("id"),"ZARR_RECEIVING_WORKSPACE","Completed source stage differs")
                require(inspect_packet(result["packet"]["archive"])==result["packet"]["inspection"],
                        "ZARR_RECEIVING_PACKET","The completed source packet changed")
                return {**result,"replayed":True}
            def action(label,kind,value):
                key=digest(label.encode());folder=journal/"steps"/key;private_directory(folder,True)
                wanted={"label":label,"action":kind,"input":value}
                publish(folder/"selection.json",encoded(wanted))
                request_file=folder/"request.json"
                if not request_file.exists():
                    publish(request_file,encoded({"id":str(uuid.uuid4()),"action":kind,
                                                 "expectedRevision":workspace.meta("revision"),"input":value}))
                request=read_json(request_file)
                require(request["action"]==kind and request["input"]==value,"ZARR_RECEIVING_REQUEST","The original native request changed")
                receipt=workspace.execute(request);receipt.pop("replayed",None)
                publish(folder/"receipt.json",encoded(receipt))
                return receipt["item"]
            records=[];frozen=[];sources={};all_cells=0;cut_cells=0
            for selected in selection["sources"]:
                source=action("source:"+selected["id"],"import",{
                    "path":selected["file"],"kind":"zip","root":selected["root"],"title":selected["title"],
                    "expectedSha256":selected["sha256"],"provenance":selected["provenance"]})
                sources[selected["id"]]=source
                arrays={row["path"]:row for row in source["inspection"]["nodes"] if row["nodeType"]=="array"}
                require(set(arrays)==set(selected["expected"]),"ZARR_RECEIVING_INVENTORY",
                        "The native full-array inventory differs from the pinned original generator")
                for name,node in sorted(arrays.items()):
                    expected=selected["expected"][name]
                    axes=[{"start":0,"stop":size,"step":1} for size in node["shape"]]
                    label=selected["id"]+":"+name
                    plan=action("selection:"+label,"selection",{"sourceId":source["id"],"array":name,"axes":axes,"title":selected["title"]+" / "+name})
                    item=action("run:"+label,"run",{"selectionId":plan["id"]})
                    result=read_json(workspace_path/item["file"])
                    verified=verify_values(result,expected)
                    review=action("review:"+label,"review",{"resultId":item["id"],"contentSha256":item["contentSha256"],
                        "decision":"accepted","comment":"Complete upstream interoperability example. Every decoded cell and source coordinate matches its retained generator source; this is not a customer or current environmental observation."})
                    value_type="number" if expected["kind"] in ("integer","float") else "boolean" if expected["kind"]=="boolean" else "text"
                    source_file=action("freeze:"+label,"freeze",{"resultId":item["id"],"reviewId":review["id"],
                        "title":selected["title"]+" / "+name,"valueType":value_type})
                    records.append({"source":selected["id"],"array":name,"selection":plan["id"],"result":item,"verification":verified})
                    frozen.append({"source":selected["id"],"array":name,**workspace.frozen_source(source_file["id"])})
                    all_cells+=result["rowCount"]
                print(json.dumps({"state":"ORIGINAL_SOURCE_COMPLETE","source":selected["id"],"arrays":len(arrays),
                                  "workspaceId":workspace.meta("id"),"revision":workspace.meta("revision")}),flush=True)
            for cut in selection.get("cuts",[]):
                source=sources[cut["source"]];label="cut:"+cut["id"]
                plan=action(label+":selection","selection",{"sourceId":source["id"],"array":cut["array"],"axes":cut["axes"],"title":cut["title"]})
                item=action(label+":run","run",{"selectionId":plan["id"]})
                result=read_json(workspace_path/item["file"]);verified=verify_values(result,cut["expected"])
                review=action(label+":review","review",{"resultId":item["id"],"contentSha256":item["contentSha256"],
                    "decision":"accepted","comment":cut["review"]})
                frozen_item=action(label+":freeze","freeze",{"resultId":item["id"],"reviewId":review["id"],"title":cut["title"],"valueType":cut["valueType"]})
                records.append({"source":cut["source"],"array":cut["array"],"cut":cut["id"],"selection":plan["id"],"result":item,"verification":verified})
                frozen.append({"source":cut["source"],"array":cut["array"],"cut":cut["id"],**workspace.frozen_source(frozen_item["id"])})
                cut_cells+=result["rowCount"]
            original=workspace.status()
        export_request=journal/"export.json"
        if not export_request.exists():
            ident=str(uuid.uuid4())
            publish(export_request,encoded({"id":ident,"out":str(workspace_path/"exports"/(ident+".zip"))}))
        selected_export=read_json(export_request)
        packet=export_packet(workspace_path,selected_export["id"],selected_export["out"]);packet.pop("replayed",None)
        received=receive_packet(packet["archive"],root/"source-received");received.pop("replayed",None);received.pop("currentRevision",None)
        with Workspace(root/"source-received",readonly=True) as reopened:
            received_status=reopened.status()
            require(received_status["workspaceId"]==original["workspaceId"] and received_status["revision"]==original["revision"],
                    "ZARR_RECEIVING_IDENTITY","The received original workspace identity changed")
            for name in ("sources","selections","results","reviews","frozen","operations"):
                require(received_status[name]==original[name],"ZARR_RECEIVING_HISTORY","The received complete "+name+" changed")
        result={"schema":"stellar-forge.zarr-native-source-result.v1","state":"SOURCE_WORKSPACE_COMPLETE",
                "operationId":operation_id,"inputSha256":value_digest(selection),"workspace":str(workspace_path),
                "workspaceId":original["workspaceId"],"revision":original["revision"],"engine":native.runtime(),
                "sources":[{"id":key,"sourceId":value["id"],"sourceSha256":value["sourceSha256"],
                            "memberCount":value["memberCount"],"sourceBytes":value["sourceBytes"],
                            "arrays":value["inspection"]["arrays"],"groups":value["inspection"]["groups"]}
                           for key,value in sources.items()],
                "fullArrayCount":sum(value["inspection"]["arrays"] for value in sources.values()),
                "fullArrayCells":all_cells,"additionalSelectedCells":cut_cells,"results":records,"frozen":frozen,
                "packet":packet,"received":received,"originalOperationsReplayedWithoutArrayRead":True}
        publish(completed,encoded(result));return result
    finally:os.close(lease)

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("--input",required=True)
    args=parser.parse_args()
    result=receive_source_stage(args.input)
    print(json.dumps({"state":result["state"],"operationId":result["operationId"],"workspaceId":result["workspaceId"],
                      "revision":result["revision"],"fullArrayCount":result["fullArrayCount"],
                      "fullArrayCells":result["fullArrayCells"],"additionalSelectedCells":result["additionalSelectedCells"],
                      "packet":result["packet"],"received":result["received"]}),flush=True)
