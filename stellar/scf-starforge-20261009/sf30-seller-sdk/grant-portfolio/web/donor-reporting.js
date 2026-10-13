/* MIT. Original donor report selection and complete submitted-statement reader. */
"use strict";
function GrantDonorReporting(H) {
  const {node,field,button,panel,table,rawDetails,showDialog,api,notice,failure,sourceName,
    rows,selected,current,dimensionsControl,referenceControl,title} = H;
  const schema="stellar-forge.grant-donor-selection.v1";
  const label=x=>String(x).replaceAll("_"," ").toLowerCase();
  function value(item,key,otherwise=""){return item?.[key]??otherwise;}
  function download(filename,body,type) {
    const blob=new Blob([body],{type}),url=URL.createObjectURL(blob),link=node("a");
    link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  function selectionControl(initial,portfolioSelection,record) {
    let enabled=initial!=null;
    const wrapper=node("div",null,"programme-repeater"),toggle=field("Period-specific donor statement","select",String(enabled),
      [["false","Original cumulative position"],["true","Configure donor statement"]]);
    const body=node("div"),lines=node("div"),items=[],controls=node("div"),controlItems=[],exclusions=node("div"),exclusionItems=[];
    const agreement=referenceControl("documents",initial?.agreementId,{filter:r=>["agreement","amendment"].includes(r.category)});
    const prior=referenceControl("reports",initial?.supersedesReportId,{exclude:record?.id,filter:r=>!!r.publication});
    const correction=field("Reason for correcting the earlier report","textarea",value(initial,"correctionReason"));
    const review=field("Statement review note","textarea",value(initial,"reviewNote"));
    const indicators=referenceControl("indicators",initial?.indicatorIds,{multiple:true});
    const mode=field("Results period basis","select",value(initial,"resultMode","period-contained"),
      [["period-contained","Observations fully contained in this report period"],["cumulative","Cumulative through report period end"]]);
    function block(name,control){const g=node("fieldset");g.append(node("legend",name),control.wrapper);return g;}
    body.append(block("Agreement or amendment",agreement),block("Earlier submitted report being corrected",prior),
      correction.wrapper,block("Selected results indicators",indicators),mode.wrapper);
    function addLine(item={}) {
      const box=node("fieldset",null,"programme-point"),identity=item.id||crypto.randomUUID();
      const titleField=field("Statement line","text",value(item,"title")),sources=field("Original source edition IDs","textarea",(item.sourceIds||[]).join("\n"));
      const kind=field("Original financial meaning","text",value(item,"kind"));
      const currency=field("Original currency","text",value(item,"currency"));currency.input.maxLength=3;
      const dimensions=dimensionsControl(item.dimensions||{});
      const dateMode=field("Date selection","select",value(item,"dateMode","point"),[["point","Original point date"],["contained-period","Complete contained source period"]]);
      const datePointer=field("Date or period-start pointer","text",value(item,"datePointer","/dimensions/valueDate"));
      const endPointer=field("Period-end pointer","text",value(item,"endPointer"));
      const basis=field("Date and financial basis","textarea",value(item,"basis"));
      const presets=field("Original source date fields","select","",[
        ["","Choose a source-specific starting point"],
        ["iati-value","IATI value date"],["iati-period","IATI budget period"],["giving-award","360Giving award date"]]);
      presets.input.addEventListener("change",()=>{
        if(presets.input.value==="iati-value"){dateMode.input.value="point";datePointer.input.value="/dimensions/valueDate";endPointer.input.value="";}
        if(presets.input.value==="iati-period"){dateMode.input.value="contained-period";datePointer.input.value="/dimensions/periodStart";endPointer.input.value="/dimensions/periodEnd";kind.input.value="budgets";}
        if(presets.input.value==="giving-award"){dateMode.input.value="point";datePointer.input.value="/dimensions/awardDate";endPointer.input.value="";}
      });
      const selectedSources=node("details");selectedSources.append(node("summary","Source editions in this portfolio"));
      const sourceIDs=H.portfolio().sources||[];
      for(const source of sourceIDs){const id=typeof source==="string"?source:source.id;
        if(id)selectedSources.append(button(sourceName(id),()=>{const values=new Set(sources.input.value.split(/\s+/).filter(Boolean));values.add(id);sources.input.value=[...values].join("\n");}));}
      box.append(node("legend",item.title||"Financial line"),titleField.wrapper,sources.wrapper,selectedSources,kind.wrapper,currency.wrapper,
        block("Exact original dimension filters",dimensions),presets.wrapper,dateMode.wrapper,datePointer.wrapper,endPointer.wrapper,basis.wrapper,
        node("p","All other original dimensions remain separate. Point dates are inclusive; source periods must fit completely. Each original row can contribute to one line.","small"));
      const entry={active:true,read(){return {id:identity,title:titleField.input.value,sourceIds:sources.input.value.split(/\s+/).filter(Boolean),
        kind:kind.input.value,currency:currency.input.value,dimensions:dimensions.read(),dateMode:dateMode.input.value,
        datePointer:datePointer.input.value,endPointer:dateMode.input.value==="contained-period"?endPointer.input.value:null,basis:basis.input.value};}};
      box.append(button("Remove financial line",()=>{entry.active=false;box.remove();}));
      items.push(entry);lines.append(box);
    }
    const groupChoices=[];
    const groupSelectors=[];
    function refreshGroupSelectors(){for(const {choice,group} of groupSelectors){const selectedValue=group.input.value;choice.input.replaceChildren();const empty=node("option","Choose an original statement group");empty.value="";choice.input.append(empty);for(const g of groupChoices){const option=node("option",g.title+" · "+JSON.stringify(g.dimensions));option.value=g.id;choice.input.append(option);}choice.input.value=groupChoices.some(g=>g.id===selectedValue)?selectedValue:"";}}
    async function loadGroups(){if(!record)throw new Error("Save this draft first, then reopen it to select its generated statement groups.");current(portfolioSelection);const received=await api("/api/programme/donor-report?"+new URLSearchParams({...portfolioSelection,id:record.id}));current(portfolioSelection);if(received.report.sha256!==record.sha256)throw new Error("The selected report changed.");groupChoices.splice(0,groupChoices.length,...received.statement.lines.flatMap(line=>line.groups));refreshGroupSelectors();notice("Loaded original saved statement groups.");}
    function addControl(item={}) {
      const box=node("fieldset"),group=field("Statement group ID","text",value(item,"groupId"));
      const choice=field("Original statement group","select","",[["","Load saved report groups to select"]]);groupSelectors.push({choice,group});choice.input.addEventListener("change",()=>{if(choice.input.value)group.input.value=choice.input.value;});
      const amount=field("Supplied original control total","text",value(item,"amount"));
      const basis=field("Control total source and basis","textarea",value(item,"basis"));
      const entry={active:true,read:()=>({groupId:group.input.value,amount:amount.input.value,basis:basis.input.value})};
      box.append(choice.wrapper,group.wrapper,amount.wrapper,basis.wrapper,button("Remove control total",()=>{entry.active=false;box.remove();}));
      controlItems.push(entry);controls.append(box);
    }
    function addExclusion(item={}) {
      const box=node("fieldset"),source=field("Source edition ID","text",value(item,"sourceId"));
      const row=field("Original row key","text",value(item,"rowKey")),sha=field("Original full-row SHA256","text",value(item,"sha256"));
      const reason=field("Reason for excluding this original row","textarea",value(item,"reason"));
      const entry={active:true,read:()=>({sourceId:source.input.value,rowKey:row.input.value,sha256:sha.input.value,reason:reason.input.value})};
      box.append(source.wrapper,row.wrapper,sha.wrapper,reason.wrapper,button("Remove row exclusion",()=>{entry.active=false;box.remove();}));
      exclusionItems.push(entry);exclusions.append(box);
    }
    (initial?.lines||[]).forEach(addLine);(initial?.controlTotals||[]).forEach(addControl);(initial?.exclusions||[]).forEach(addExclusion);
    body.append(node("h3","Financial lines"),lines,button("Add financial line",()=>addLine()),
      node("h3","Supplied control totals"),node("p","Save the draft and open its statement to select exact group IDs. Amounts remain original decimal text.","small"),
      button("Load saved report groups",loadGroups),controls,button("Add control total",()=>{addControl();refreshGroupSelectors();}),node("h3","Explained original-row exclusions"),
      exclusions,button("Add row exclusion",()=>addExclusion()),review.wrapper);
    body.hidden=!enabled;
    toggle.input.addEventListener("change",()=>{enabled=toggle.input.value==="true";body.hidden=!enabled;});
    wrapper.append(toggle.wrapper,body);
    return {wrapper,read(){current(portfolioSelection);if(!enabled)return null;
      return {schema,agreementId:agreement.read(),supersedesReportId:prior.read(),correctionReason:correction.input.value,
        indicatorIds:indicators.read(),resultMode:mode.input.value,lines:items.filter(x=>x.active).map(x=>x.read()),
        controlTotals:controlItems.filter(x=>x.active).map(x=>x.read()),exclusions:exclusionItems.filter(x=>x.active).map(x=>x.read()),
        reviewNote:review.input.value};}};
  }
  const escaped=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function htmlReport(result) {
    const s=result.statement;
    const list=(heads,values)=>"<table><thead><tr>"+heads.map(h=>"<th>"+escaped(h)+"</th>").join("")+
      "</tr></thead><tbody>"+values.map(row=>"<tr>"+row.map(v=>"<td>"+escaped(typeof v==="object"?JSON.stringify(v):v)+"</td>").join("")+"</tr>").join("")+"</tbody></table>";
    let body="<h1>"+escaped(s.title)+"</h1><p>"+escaped(s.reportingPeriod.start)+" to "+escaped(s.reportingPeriod.end)+
      " · "+escaped(s.recipient)+"</p><p>"+escaped(result.frozen?"Submitted statement":"Working statement")+"</p><p class='text'>"+escaped(s.narrative)+"</p>";
    body+="<h2>Financial basis</h2><p>"+escaped(s.financialBasis)+"</p><p>"+escaped(s.financialCoverage)+"</p>";
    for(const line of s.lines){
      body+="<h3>"+escaped(line.selection.title)+"</h3><p class='text'>"+escaped(line.selection.basis)+"</p>"+
        list(["Original dimensions","Period total","Control","Variance","State","Group ID"],line.groups.map(g=>[g.dimensions,g.amount,g.control?.amount,g.variance,g.status,g.id]))+
        "<h4>Complete original rows</h4>"+list(["Source","Row","State","Selected start","Selected end","Reason","Complete original record"],line.records.map(r=>
          [r.reference.sourceId,r.reference.rowKey,r.status,r.selectedStart,r.selectedEnd,r.reason,r.record]));
    }
    body+="<h2>Unselected original financial rows</h2>"+list(["Reason","Reference","Original record"],s.unselectedFinancialRows.map(r=>[r.reason,r.reference,r.record]))+
      "<h2>Results</h2><p>"+escaped(s.resultBasis)+"</p>"+list(["Indicator","Dimensions","Actual","Dated target","Variance to dated target","Unit","State"],s.results.map(r=>
        [r.title,r.dimensions,r.actual,r.target?.value,r.variance,r.unit,r.status]))+
      "<h3>Complete observations</h3>"+list(["State","Reference","Original observation"],s.observations.map(r=>[r.status,r.reference,r.record]))+
      "<h2>Agreement and original result records</h2>"+list(["Reference","Record"],s.selectedRecords.map(r=>[r.reference,r.record]))+
      "<h2>Review note</h2><p class='text'>"+escaped(s.selection.reviewNote)+"</p><h2>Complete editable statement</h2><pre>"+
      escaped(JSON.stringify(result,null,2))+"</pre>";
    return "<!doctype html><html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>"+
      escaped(s.title)+"</title><style>body{font:14px system-ui,sans-serif;color:#202020;background:#fff;max-width:1200px;margin:32px auto;padding:0 20px}table{border-collapse:collapse;width:100%;margin:16px 0;table-layout:fixed}th,td{border:1px solid #bbb;padding:7px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#eee}.text,pre{white-space:pre-wrap;overflow-wrap:anywhere}pre{font-size:11px}h2{margin-top:32px}@media print{body{max-width:none;margin:0;font-size:10px}tr{break-inside:avoid}pre{font-size:8px}}</style>"+body+"</html>";
  }
  async function open(record,selection=selected()) {
    const result=await api("/api/programme/donor-report?"+new URLSearchParams({...selection,id:record.id}));
    if(result.portfolioId!==selection.portfolioId||result.revision!==selection.revision||result.report.sha256!==record.sha256)
      throw new Error("The selected donor report edition changed.");
    const s=result.statement,content=[node("p",(result.frozen?"Submitted statement":"Working statement")+" · "+s.reportingPeriod.start+" to "+s.reportingPeriod.end,"small"),
      node("p",s.narrative),node("p",s.financialBasis,"small")];
    const actions=node("div",null,"actions");
    actions.append(button("Download editable statement",()=>{download("donor-report-"+record.id+"-r"+record.revision+".json",JSON.stringify(result,null,2)+"\n","application/json");notice("Complete donor statement downloaded.");}),
      button("Download printable report",()=>{download("donor-report-"+record.id+"-r"+record.revision+".html",htmlReport(result),"text/html");notice("Complete donor report downloaded.");}));
    content.push(actions,table(["Original scope rows","Included","Review","Unselected","Indicators","Included observations"],[[
      s.summary.scopedFinancialRows,s.summary.includedFinancialRows,s.summary.reviewFinancialRows,s.summary.uncoveredFinancialRows,s.summary.selectedIndicators,s.summary.includedObservations]]));
    for(const line of s.lines){
      const section=panel(line.selection.title,line.selection.basis);
      section.append(table(["Original dimensions","Period total","Control","Variance","State"],line.groups.map(g=>[
        JSON.stringify(g.dimensions),g.amount??"—",g.control?.amount??"—",g.variance??"—",label(g.status)])));
      section.append(rawDetails("Complete group identities and control totals",line.groups),rawDetails("Every original selected row and date decision",line.records));
      content.push(section);
    }
    const results=panel("Selected results",s.resultBasis);
    results.append(table(["Indicator","Dimensions","Actual","Target","Variance","Unit","State"],s.results.map(r=>[
      r.title,JSON.stringify(r.dimensions),r.actual??"—",r.target?.value??"—",r.variance??"—",r.unit,label(r.status)])),
      rawDetails("Complete original observations",s.observations));
    content.push(results,rawDetails("Unselected original financial rows",s.unselectedFinancialRows),
      rawDetails("Unmatched supplied control totals",s.unmatchedControls),
      rawDetails("Original agreement and result records",s.selectedRecords),
      node("h3","Statement review note"),node("p",s.selection.reviewNote||"—"),rawDetails("Complete donor statement",result));
    showDialog(s.title,content);
  }
  return {control:selectionControl,open,htmlReport};
}
