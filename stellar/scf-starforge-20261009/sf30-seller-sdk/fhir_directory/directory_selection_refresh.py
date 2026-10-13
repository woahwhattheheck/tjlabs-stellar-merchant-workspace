"""MIT. Review one saved Directory choice against a later retained source edition."""
from __future__ import annotations
import copy
import csv
import html
import io
from pathlib import Path
from directory_runtime import InputError,source,safe_read,original_workspace,write_zip
from directory_domain import DirectoryView,public_ref,ref_key,key
import directory_schema as schema

KIND="selectionRefreshes"
SCHEMA="stellar-forge.human-services-directory-selection-refresh.v1"

def checked_input(name,raw):
    return schema.input_value(name,raw)

def differences(before,after,path=""):
    """Omission is distinct from null; arrays retain their complete ordered values."""
    if key(before)==key(after):return []
    if isinstance(before,dict) and isinstance(after,dict):
        rows=[]
        for name in sorted(set(before)|set(after)):
            pointer=path+"/"+name.replace("~","~0").replace("/","~1")
            if name in before and name in after:
                rows.extend(differences(before[name],after[name],pointer))
            else:
                rows.append({"pointer":pointer,"beforePresent":name in before,
                    "afterPresent":name in after,
                    **({"before":before[name]}if name in before else {}),
                    **({"after":after[name]}if name in after else {})})
        return rows
    return [{"pointer":path,"beforePresent":True,"afterPresent":True,
        "before":before,"after":after}]

def csv_bytes(rows):
    stream=io.StringIO(newline="");writer=csv.writer(stream,lineterminator="\r\n")
    for row in rows:
        values=[]
        for value in row:
            text=""if value is None else str(value)
            values.append("'"+text if text[:1]in {"=","+","-","@","\t","\r"}else text)
        writer.writerow(values)
    return stream.getvalue().encode("utf-8")

def esc(value):
    return html.escape(""if value is None else str(value),quote=True)

def table(head,rows):
    return "<div class='table-wrap'><table><thead><tr>"+"".join("<th>"+esc(h)+"</th>"for h in head)+"</tr></thead><tbody>"+"".join(
        "<tr>"+"".join("<td>"+esc(v)+"</td>"for v in row)+"</tr>"for row in rows)+"</tbody></table></div>"

def render_report(report):
    title="Service choice refresh — "+report["label"]
    s=report["summary"]
    body="<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>"+esc(title)+"</title><style>body{font:15px/1.5 system-ui,sans-serif;color:#20252a;background:#fff;max-width:1200px;margin:auto;padding:24px}h1{font-size:28px}h2{margin-top:32px}h3{font-size:18px}a{color:#294861}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bcc2c7;padding:8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#edf0f2}.table-wrap{overflow:auto;margin:16px 0}pre,code{white-space:pre-wrap;overflow-wrap:anywhere}.context{border-left:3px solid #6a7279;padding:12px 16px;background:#f5f6f7}details{margin:12px 0}summary{cursor:pointer;font-weight:600}article{border-top:1px solid #aeb5ba;margin-top:24px;padding-top:12px}@media(max-width:600px){body{padding:14px}h1{font-size:24px}td,th{padding:6px}}@media print{details>*{display:block}summary{display:block}.table-wrap{overflow:visible}article{break-inside:avoid}}</style></head><body><h1>"+esc(title)+"</h1>"
    body+="<p class='context'>This is a retained review of directory evidence and an explicitly proposed service choice. It does not confirm provider availability, reserve capacity, change a referral, or establish that a missing source service has ceased operating.</p>"
    body+=table(["Original selection","Earlier edition","Reviewed edition","Reviewer"],
        [[report["selectionId"],report["beforeEditionId"],report["afterEditionId"],report["actor"]]])
    body+=table(["Prior candidates","Matched explicitly","Not carried forward","New candidates","Chosen in proposal"],
        [[s[k]for k in ("beforeCandidates","matched","notCarried","added","proposedChosen")]])
    body+="<h2>Source scope and criteria</h2><p>"+esc(report["scopeNote"])+"</p><p>"+esc(report["criteriaReason"])+"</p>"
    body+=table(["Source","Original scope"],[["Earlier",source.lexical_json(report["beforeEdition"]["scope"])],["Reviewed",source.lexical_json(report["afterEdition"]["scope"])]])
    body+="<details><summary>Complete original and proposed criteria</summary><h3>Original criteria</h3><pre>"+esc(source.lexical_json(report["beforeCriteria"]))+"</pre><h3>Proposed criteria</h3><pre>"+esc(source.lexical_json(report["afterCriteria"]))+"</pre></details>"
    for row in report["rows"]:
        before=row["before"];after=row["after"]
        name=(after or before).get("name") or (after or before)["ref"]["recordId"]
        body+="<article><h2>"+esc(name)+"</h2><p>"+esc(row["state"])+" · "+esc(row["reason"])+"</p>"
        body+=table(["Position","Original source reference","Classification","Disposition"],
            [[label,source.lexical_json(candidate["ref"]),candidate["classification"],source.lexical_json(candidate.get("disposition"))]
             for label,candidate in (("Original",before),("Proposed",after))if candidate is not None])
        checks_before={c["criterion"]:c for c in (before or {}).get("checks",[])}
        checks_after={c["criterion"]:c for c in (after or {}).get("checks",[])}
        body+=table(["Criterion","Original result","Proposed result","Proposed basis"],
            [[name,checks_before.get(name,{}).get("state","—"),checks_after.get(name,{}).get("state","—"),checks_after.get(name,{}).get("reason","—")]
             for name in sorted(set(checks_before)|set(checks_after))])
        body+="<details><summary>Original service-field differences ("+str(len(row["serviceChanges"]))+")</summary>"
        body+=table(["Field","Original","Proposed"],[[d["pointer"],source.lexical_json(d["before"])if d["beforePresent"]else"[not present]",
            source.lexical_json(d["after"])if d["afterPresent"]else"[not present]"]for d in row["serviceChanges"]])+"</details>"
        body+="<details><summary>Complete source, schedule, capacity and contact evidence</summary><h3>Original</h3><pre>"+esc(source.lexical_json(before))+"</pre><h3>Proposed</h3><pre>"+esc(source.lexical_json(after))+"</pre></details></article>"
    body+="<h2>Continue the same saved workspace</h2><p>Read the complete proposed selection and each unresolved criterion. Apply this saved refresh through Service choice refresh to create or reopen its ordinary successor selection. A new clinical assignment or customer handoff remains a separate explicit operation. Earlier selections, referrals and handoffs stay available.</p><ul><li><a href='Refresh.json'>Complete review</a></li><li><a href='Input.json'>Original reviewed input</a></li><li><a href='Proposed_Selection.json'>Complete proposed selection</a></li><li><a href='Service_Choices.csv'>Source choices</a></li><li><a href='Criteria.csv'>All criteria</a></li></ul></body></html>"
    return body.encode("utf-8")

class DirectorySelectionRefresh:
    def _selection_refresh_analysis(self,raw):
        data=checked_input("selection_refresh_prepare",raw)
        previous=self.directory_record("selections",data["selectionId"])
        before=self.directory_selection(previous["id"])
        target=copy.deepcopy(data["target"])
        if target.get("refreshId"):raise InputError("A new refresh starts from its complete proposed input, without another refresh ID")
        if target.get("predecessorId")not in (None,previous["id"]):raise InputError("The proposed choice must continue this exact saved selection")
        target["predecessorId"]=previous["id"]
        if target["editionId"]==previous["editionId"]:raise InputError("Choose an explicit different source edition; ordinary same-edition choice editing remains available")
        target,after=self._directory_evaluate_selection(target)
        old_view=DirectoryView(self,previous["editionId"]);new_view=DirectoryView(self,target["editionId"])
        before_map={ref_key(c["ref"]):c for c in before["candidates"]}
        after_map={ref_key(c["ref"]):c for c in after["candidates"]}
        bindings={};destinations=set()
        for binding in data["bindings"]:
            old_ref=public_ref(old_view.row(binding["beforeRef"]));old_key=ref_key(old_ref)
            if old_key not in before_map or old_key in bindings:raise InputError("Match every original candidate exactly once")
            current=binding["afterRef"]
            if current is not None:
                current=public_ref(new_view.row(current));current_key=ref_key(current)
                if current_key not in after_map:raise InputError("The matched current service must be in the complete proposed candidate set")
                if current_key in destinations:raise InputError("Two earlier candidates cannot silently merge into one current service")
                destinations.add(current_key)
            if not binding["reason"].strip():raise InputError("Retain the reason for each source match or omitted service")
            bindings[old_key]={"beforeRef":old_ref,"afterRef":current,"reason":binding["reason"]}
        if set(bindings)!=set(before_map):raise InputError("Every original candidate needs an explicit match or not-carried-forward decision")
        if not data["scopeNote"].strip() or not data["criteriaReason"].strip():
            raise InputError("Review the later source scope and the proposed criteria, including original location/schedule bindings")
        # Every proposed candidate gets a real disposition, including new candidates.
        proposed_dispositions={ref_key(d["ref"])for d in target["dispositions"]}
        if proposed_dispositions!=set(after_map):raise InputError("Give every proposed service its explicit disposition and reason")
        rows=[]
        for old_key,before_candidate in before_map.items():
            binding=bindings[old_key]
            current=after_map[ref_key(binding["afterRef"])]if binding["afterRef"]is not None else None
            rows.append({"state":"matched"if current else"not-carried-forward",
                "reason":binding["reason"],"before":before_candidate,"after":current,
                "serviceChanges":differences(before_candidate["original"],current["original"])if current else[],
                "evidenceChanged":current is None or key(before_candidate)!=key(current)})
        for current_key,candidate in after_map.items():
            if current_key not in destinations:
                rows.append({"state":"added","reason":candidate["disposition"]["reason"],
                    "before":None,"after":candidate,"serviceChanges":[],"evidenceChanged":True})
        data["target"]=target
        data["bindings"]=[bindings[ref_key(c["ref"])]for c in before["candidates"]]
        report={"schema":SCHEMA,"workspaceId":self.workspace_id,"label":data["label"],
            "actor":data["actor"],"note":data["note"],"selectionId":previous["id"],
            "beforeEditionId":previous["editionId"],"afterEditionId":target["editionId"],
            "beforeEdition":{k:old_view.edition.get(k)for k in ("id","label","scope","sourceIds","predecessorId")},
            "afterEdition":{k:new_view.edition.get(k)for k in ("id","label","scope","sourceIds","predecessorId")},
            "scopeNote":data["scopeNote"],"criteriaReason":data["criteriaReason"],
            "beforeCriteria":before["criteria"],"afterCriteria":after["criteria"],
            "criteriaChanges":differences(before["criteria"],after["criteria"]),
            "target":target,"rows":rows,
            "summary":{"beforeCandidates":len(before_map),"matched":len(destinations),
                "notCarried":len(before_map)-len(destinations),"added":len(after_map)-len(destinations),
                "proposedCandidates":len(after_map),"proposedChosen":len(target["chosenRefs"]),
                "proposedClassifications":after["summary"]["classificationCounts"]}}
        return data,report

    def prepare_directory_selection_refresh(self,raw):
        with self.mutex,self.scratch()as temp:
            data,report=self._selection_refresh_analysis(raw)
            choices=[["state","before_source","before_record","after_source","after_record","name","decision","reason","owner"]]
            criteria=[["state","before_record","after_record","criterion","before","after","original_context_json","proposed_context_json"]]
            for row in report["rows"]:
                a=row["before"] or {};b=row["after"]or{};d=b.get("disposition")or{}
                choices.append([row["state"],a.get("ref",{}).get("sourceId"),a.get("ref",{}).get("recordId"),
                    b.get("ref",{}).get("sourceId"),b.get("ref",{}).get("recordId"),b.get("name",a.get("name")),
                    d.get("decision"),row["reason"],d.get("owner")])
                ac={c["criterion"]:c for c in a.get("checks",[])};bc={c["criterion"]:c for c in b.get("checks",[])}
                for name in sorted(set(ac)|set(bc)):
                    criteria.append([row["state"],a.get("ref",{}).get("recordId"),b.get("ref",{}).get("recordId"),name,
                        ac.get(name,{}).get("state"),bc.get(name,{}).get("state"),source.lexical_json(ac.get(name)),source.lexical_json(bc.get(name))])
            contents={"Input.json":source.lexical_json(data).encode()+b"\n",
                "Refresh.json":source.lexical_json(report).encode()+b"\n",
                "Proposed_Selection.json":source.lexical_json(data["target"]).encode()+b"\n",
                "Service_Choices.csv":csv_bytes(choices),"Criteria.csv":csv_bytes(criteria),
                "START_HERE.html":render_report(report)}
            files={};paths={}
            for name,body in contents.items():
                if len(body)>schema.MAX_RECORD:raise InputError("The complete refresh report exceeds64MiB; use a smaller explicit selection")
                path=Path(temp)/name;original_workspace.private_write(path,body);paths[name]=path
                files[name]=self._directory_retain_file(path,"directory-selection-refresh")
            archive=Path(temp)/"Service_Choice_Refresh.zip"
            write_zip(archive,paths)
            files["Service_Choice_Refresh.zip"]=self._directory_retain_file(archive,"directory-selection-refresh-package")
            return self._directory_store(KIND,{"schema":SCHEMA,"workspaceId":self.workspace_id,
                "label":data["label"],"actor":data["actor"],"note":data["note"],
                "selectionId":data["selectionId"],"beforeEditionId":report["beforeEditionId"],
                "afterEditionId":report["afterEditionId"],"summary":report["summary"],"files":files})

    def directory_selection_refresh_report(self,ident):
        record=self.directory_record(KIND,ident)
        report=source.json_value(safe_read(self._directory_file_path(record["files"]["Refresh.json"]),schema.MAX_RECORD),lexical=True)
        if (report.get("schema")!=SCHEMA or report.get("workspaceId")!=self.workspace_id
                or report.get("selectionId")!=record["selectionId"]
                or report.get("beforeEditionId")!=record["beforeEditionId"]
                or report.get("afterEditionId")!=record["afterEditionId"]):
            raise InputError("The retained refresh report differs from its original workspace/selection")
        return report

    def directory_selection_refresh_rows(self,ident,offset=0,limit=50):
        return self._directory_rows_page(self.directory_selection_refresh_report(ident)["rows"],offset,limit)

    def directory_selection_refresh_file(self,ident,member):
        record=self.directory_record(KIND,ident)
        if member not in record["files"]:raise InputError("Choose one original complete refresh member")
        media="application/zip"if member.endswith(".zip")else"text/html; charset=utf-8"if member.endswith(".html")else"text/csv; charset=utf-8"if member.endswith(".csv")else"application/json"
        return self._directory_file_path(record["files"][member]),{"filename":member,"contentType":media}

    def _verify_directory_selection_refresh_target(self,ident,data):
        report=self.directory_selection_refresh_report(ident)
        selected={k:v for k,v in data.items()if k not in {"refreshId","actor","note"}}
        if key(selected)!=key({k:v for k,v in report["target"].items()if k not in {"actor","note"}}):raise InputError("The saved successor differs from the complete reviewed refresh; prepare a new review for changed input")
        if selected.get("predecessorId")!=report["selectionId"]:raise InputError("The refreshed choice must retain its original selection predecessor")

    def apply_directory_selection_refresh(self,raw):
        data=checked_input("selection_refresh_apply",raw)
        if not data["confirm"]:raise InputError("Confirm the original saved review before retaining its successor choice")
        with self.mutex:
            record=self.directory_record(KIND,data["refreshId"])
            if record["files"]["Refresh.json"]["sha256"]!=data["expectedReportSha256"]:
                raise InputError("The reviewed report differs from the selected original file")
            report=self.directory_selection_refresh_report(record["id"])
            target=source.json_value(source.lexical_json(report["target"]))
            target["refreshId"]=record["id"];target["actor"]=data["actor"];target["note"]=data["note"]
            # The ordinary immutable selection writer recovers an already saved
            # successor on the same exact input. No second mutable apply receipt.
            return self.save_directory_selection(target)

    def _verify_directory_selection_refreshes(self,registry):
        for record in registry["records"].get(KIND,[]):
            original=self.directory_record("selections",record["selectionId"])
            if original["editionId"]!=record["beforeEditionId"]:raise InputError("The received refresh has a different original selection edition")
            self.directory_record("editions",record["afterEditionId"])
            report=self.directory_selection_refresh_report(record["id"])
            raw=source.json_value(safe_read(self._directory_file_path(record["files"]["Input.json"]),schema.MAX_RECORD),lexical=True)
            if key(report["target"])!=key(raw["target"]):raise InputError("The received refresh target differs from its retained input")
        for selection in registry["records"]["selections"]:
            if selection.get("refreshId"):
                data={k:v for k,v in selection.items()if k in schema.catalogue()["inputSchemas"]["selection"]["properties"]}
                self._verify_directory_selection_refresh_target(selection["refreshId"],data)
