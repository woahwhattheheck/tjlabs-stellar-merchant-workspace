import React, { useEffect, useRef, useState } from "react";
import { backend, getJob, waitJob } from "./wmill";

type Data = Record<string, any>;
type Target = "source" | "receiver";
type Run = { id: string; kind: string; label: string; status: string; createdAt: string; error?: string; result?: any; approval?: string };
type Launch = { id: string; kind: string; label: string; createdAt: string; input: Data };
const ctx = (window as any).ctx ?? {};
const workspace = ctx.workspace || "open311_operations";
const storageKey = "tjlabs.open311.runs." + workspace + "." + (ctx.ctx?.username || ctx.ctx?.email || "operator");
const instanceOrigin = window.location.origin !== "null" ? window.location.origin : new URL(document.referrer).origin;
const requestQuery = { start_date: "2026-10-08T08:00:00Z", end_date: "2026-10-08T12:00:00Z", extensions: true };
const newKey = (kind: string) => kind + "-" + crypto.randomUUID();
const label = (value: any, empty = "—") => value === null || value === undefined || value === "" ? empty : String(value);
const date = (value: any) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC" : label(value);
const errorText = (e: any) => e?.message || String(e);
const active = (run: Run) => !["Completed", "Failed"].includes(run.status);
function trimRuns(values: Run[]): Run[] {
  let completed = 0;
  const seen = new Set<string>();
  return values.filter(run => {
    if (seen.has(run.id)) return false;
    seen.add(run.id);
    return active(run) || completed++ < 30;
  });
}
function retainedRuns(): Run[] {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(value) ? trimRuns(value.filter(run => run && typeof run.id === "string" && typeof run.kind === "string" && typeof run.status === "string")) : [];
  } catch { return []; }
}
let launchDatabase: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  if (!launchDatabase) launchDatabase = new Promise((resolve, reject) => {
    const request = indexedDB.open(storageKey + ".submissions", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("launches", { keyPath: "id" });
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error || new Error("Could not open the saved action journal."));
  });
  return launchDatabase;
}
async function journal(method: "put" | "get" | "delete" | "getAll", value?: Launch | string): Promise<any> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("launches", method === "get" || method === "getAll" ? "readonly" : "readwrite");
    const store = tx.objectStore("launches");
    const request = method === "put" ? store.put(value as Launch) : method === "delete" ? store.delete(value as string) : method === "get" ? store.get(value as string) : store.getAll();
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error || request.error || new Error("Could not retain the original action."));
    tx.onabort = () => reject(tx.error || new Error("The original action was not saved."));
  });
}
async function download(file: Data) {
  const bytes = Uint8Array.from(atob(file.body), c => c.charCodeAt(0));
  if (bytes.byteLength !== file.bytes) throw new Error("The download length changed.");
  if (file.sha256) {
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
    if (digest !== file.sha256) throw new Error("The download differs from its saved original.");
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: file.contentType || "application/octet-stream" }));
  const link = document.createElement("a"); link.href = url; link.download = file.filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function JsonView({ value }: { value: any }) {
  return <pre className="json">{JSON.stringify(value, null, 2)}</pre>;
}
export default function App() {
  const [target, setTarget] = useState<Target>("source");
  const [tab, setTab] = useState("Requests");
  const [snapshot, setSnapshot] = useState<Data | null>(null);
  const [captureId, setCaptureId] = useState("");
  const [queryText, setQueryText] = useState("");
  const [sourceStatus, setSourceStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<Data>({ items: [], total: 0, limit: 100 });
  const [selected, setSelected] = useState<Record<string, Data>>({});
  const [detail, setDetail] = useState<Data | null>(null);
  const [capture, setCapture] = useState<Data | null>(null);
  const [comparison, setComparison] = useState<Data | null>(null);
  const [before, setBefore] = useState("");
  const [after, setAfter] = useState("");
  const [review, setReview] = useState({ status: "assigned", assignee: "", dueDate: "", note: "" });
  const [runs, setRuns] = useState<Run[]>(retainedRuns);
  const [delivery, setDelivery] = useState<Data | null>(null);
  const [operation, setOperation] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [fileBundle, setFileBundle] = useState<Data | null>(null);
  const [fileName, setFileName] = useState("");
  const [recoveredId, setRecoveredId] = useState("");
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const targetRef = useRef(target);
  const pollInProgress = useRef(false);
  const runsRef = useRef(runs);
  const fetchEpoch = useRef(0);
  useEffect(() => { runsRef.current = runs;
    try { localStorage.setItem(storageKey, JSON.stringify(runs.map(({result, approval, ...run}) => run))); } catch {}
  }, [runs]);
  useEffect(() => {
    mounted.current = true;
    journal("getAll").then((saved: Launch[]) => {
      if (!mounted.current || !saved.length) return;
      setRuns(current => trimRuns([...saved.map(item => ({id:item.id,kind:item.kind,label:item.label,createdAt:item.createdAt,status:"Submission pending"})), ...current]));
      setNotice("Saved actions are available in Activity. Resume a submission to reopen the same Windmill job.");
    }).catch(e => { if (mounted.current) setError(errorText(e)); });
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => { targetRef.current = target; }, [target]);

  async function action(fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(""); setNotice("");
    try { await fn(); } catch (e) { setError(errorText(e)); } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  async function reload() {
    const epoch = ++fetchEpoch.current, selectedTarget = targetRef.current;
    setLoading(true);
    try {
      const value = await (backend as any).overview({ target: selectedTarget, args: {} });
      if (!mounted.current || epoch !== fetchEpoch.current || selectedTarget !== targetRef.current) return;
      setSnapshot(value);
      setCaptureId(current => value.captures.some((c: Data) => c.id === current && ["requests","request"].includes(c.kind)) ? current : value.latestRequestCapture?.id || "");
    } catch(e) { if (mounted.current && epoch === fetchEpoch.current) setError(errorText(e)); }
    finally { if (mounted.current && epoch === fetchEpoch.current) setLoading(false); }
  }
  useEffect(() => { setSnapshot(null); setCaptureId(""); setSelected({}); setDetail(null); setCapture(null); setComparison(null); setBefore(""); setAfter(""); setOperation(null); setOffset(0); reload(); }, [target]);
  useEffect(() => { if (refresh) reload(); }, [refresh]);
  useEffect(() => {
    if (!captureId) { setRows({items: [], total: 0, limit: 100}); return; }
    let current = true;
    const timer = setTimeout(async () => {
      try {
        const value = await (backend as any).requests({target, args:{captureId,q:queryText,status:sourceStatus,offset,limit:100,sort:"updated"}});
        if (current) setRows(value);
      } catch(e) { if (current) setError(errorText(e)); }
    }, queryText ? 250 : 0);
    return () => { current = false; clearTimeout(timer); };
  }, [target,captureId,queryText,sourceStatus,offset,refresh]);
  useEffect(() => { setSelected({}); setDetail(null); setOffset(0); }, [target,captureId]);
  useEffect(() => {
    const timer = setInterval(async () => {
      if (pollInProgress.current || document.visibilityState === "hidden") return;
      const pending = runsRef.current.filter(active);
      if (!pending.length) return;
      pollInProgress.current = true;
      try {
        for (const run of pending) {
          try {
            const job: any = await getJob(run.id);
            if (!mounted.current) return;
            if (["Submitting", "Submission pending"].includes(run.status)) {
              await journal("delete",run.id);
            }
            if (job.type === "CompletedJob") {
              const failed = job.success === false;
              let result: any;
              try { result = await waitJob(run.id); }
              catch(e) {
                if (!failed) throw e;
                result = job.result || {error:{message:errorText(e)}};
              }
              setRuns(current => trimRuns(current.map(item => item.id === run.id ? {...item,status:failed?"Failed":"Completed",result,error:failed?errorText(result.error || result):undefined} : item)));
              if (!failed && result?.delivery) setDelivery(result.delivery);
              setRefresh(n => n + 1);
              if (!failed) setNotice(run.label + " completed.");
            } else {
              const modules = job.flow_status?.modules || [];
              const waiting = modules.some((m:Data)=>m.type === "WaitingForEvents") || Boolean(job.suspend);
              let approval: string | undefined;
              const approvalStep = modules.find((m:Data)=>m.id === "approval" && m.job);
              if (approvalStep) {
                const approvalJob: any = await getJob(approvalStep.job);
                approval = approvalJob.result?.approvalPage;
              }
              setRuns(current => current.map(item => item.id === run.id ? {...item,status:waiting?"Awaiting approval":job.running?"Running":"Queued",approval:approval||item.approval,error:undefined} : item));
            }
          } catch(e) {
            if (mounted.current && !["Submitting","Submission pending"].includes(run.status)) {
              setRuns(current => current.map(item => item.id === run.id ? {...item,error:"Refresh: "+errorText(e)} : item));
            }
          }
        }
      } catch(e) { if (mounted.current) setError("Job refresh: " + errorText(e)); }
      finally { pollInProgress.current = false; }
    }, 2000);
    return () => clearInterval(timer);
  }, []);
  async function submit(ticket: Launch) {
    setRuns(current => trimRuns([{id:ticket.id,kind:ticket.kind,label:ticket.label,status:"Submitting",createdAt:ticket.createdAt},...current]));
    try {
      const result = await (backend as any).launch({target:"source",args:{kind:ticket.kind,jobId:ticket.id,input:ticket.input}});
      if (result.jobId !== ticket.id) throw new Error("The returned job differs from the saved action.");
      await journal("delete",ticket.id);
      setRuns(current => current.map(run => run.id === ticket.id ? {...run,status:"Queued",error:undefined} : run));
      setNotice(ticket.label + (result.replayed ? " reopened." : " started.") + " Its progress is in Activity.");
    } catch(e) {
      setRuns(current => current.map(run => run.id === ticket.id ? {...run,status:"Submission pending",error:errorText(e)} : run));
      setTab("Activity");
      throw e;
    }
  }
  async function launch(kind: string, title: string, args: Data) {
    const id = crypto.randomUUID();
    const ticket: Launch = {id,kind,label:title,createdAt:new Date().toISOString(),input:{...args,runKey:"app-"+id}};
    await journal("put",ticket);
    await submit(ticket);
    if (kind === "review_delivery") setTab("Activity");
  }
  async function resumeSubmission(id: string) {
    const ticket: Launch | undefined = await journal("get",id);
    if (ticket) return submit(ticket);
    const job: any = await getJob(id);
    setRuns(current => current.map(run => run.id === id ? {...run,status:"Queued",error:undefined} : run));
    setNotice("Saved job " + job.id + " reopened.");
  }
  async function inspectRequest(row: Data) {
    const value = await (backend as any).request({target,args:{captureId,serviceRequestId:row.serviceRequestId}});
    setDetail(value);
  }
  async function exportOne(kind: string, id = captureId) {
    const file = await (backend as any).export({target,args:{kind,captureId:id}});
    await download(file); setNotice(file.filename + " downloaded.");
  }
  const captures = snapshot?.captures || [];
  const requestCaptures = captures.filter((c:Data)=>["requests","request"].includes(c.kind));
  const selection = Object.values(selected);
  const hasPending = (kind:string) => runs.some(run=>run.kind===kind && active(run));
  const selectedSummary = requestCaptures.find((c:Data)=>c.id===captureId);
  const viewedRunLink = (id:string) => instanceOrigin + "/run/" + encodeURIComponent(id) + "?workspace=" + encodeURIComponent(workspace);
  return <main className="app">
    <header className="header">
      <div><p className="eyebrow">TJLabs / Operations</p><h1>Service operations</h1><p className="muted">Helsinki published feedback · 8 October 2026 · 08:00–12:00 UTC</p></div>
      <div className="header-controls">
        <label>Workspace<select disabled={busy} value={target} onChange={e=>setTarget(e.target.value as Target)}><option value="source">Source workspace</option><option value="receiver">Received workspace</option></select></label>
        <button disabled={loading||busy} onClick={()=>action(reload)}>{loading?"Loading…":"Refresh"}</button>
      </div>
    </header>
    <div className="workspace-bar"><span>{snapshot ? snapshot.workspaceId : "Opening workspace…"}</span><span>Revision {snapshot?.revision ?? "—"}</span><span>{captures.length} captures</span><span>{snapshot?.reviews?.length ?? 0} reviewed requests</span></div>
    {error && <div className="alert" role="alert"><strong>Action needs attention</strong><p>{error}</p><button onClick={()=>setError("")}>Dismiss</button></div>}
    {notice && <p className="notice" role="status">{notice}</p>}
    <nav className="tabs" aria-label="Service operations views">{["Requests","Captures","Comparison","Transfer","Activity"].map(name=><button key={name} aria-current={tab===name?"page":undefined} onClick={()=>setTab(name)}>{name}{name==="Activity"&&runs.some(active)?" ("+runs.filter(active).length+")":""}</button>)}</nav>

    {tab==="Requests" && <section>
      <div className="section-heading"><div><h2>Request queue</h2><p className="muted">Original public status and your team’s internal review stay visible together.</p></div>
        {target==="source" && <button className="primary" disabled={busy||hasPending("refresh")} onClick={()=>action(()=>launch("refresh","Source capture",{runKey:newKey("capture"),connectionId:"helsinki-public",servicesQuery:{locale:"en"},requestsQuery:requestQuery}))}>{hasPending("refresh")?"Capturing…":"Capture source"}</button>}
      </div>
      {!requestCaptures.length ? <div className="empty"><h3>{target==="source"?"Capture the source to open the queue":"Receive a workspace to open its queue"}</h3><p>The service catalogue, original response files and request history will appear here.</p></div> : <>
      <div className="filters">
        <label className="wide">Saved capture<select value={captureId} onChange={e=>setCaptureId(e.target.value)}>{requestCaptures.map((c:Data)=><option key={c.id} value={c.id}>{date(c.capturedAt)} · {c.rowCount} requests · {c.id.slice(-8)}</option>)}</select></label>
        <label className="wide">Search requests<input type="search" value={queryText} placeholder="Request, service, location, description" onChange={e=>{setQueryText(e.target.value);setOffset(0);}}/></label>
        <label>Source status<select value={sourceStatus} onChange={e=>{setSourceStatus(e.target.value);setOffset(0);}}><option value="">All source statuses</option>{(snapshot?.connections.find((c:Data)=>c.id===selectedSummary?.connectionId)?.statusValues||[]).map((s:string)=><option key={s}>{s}</option>)}</select></label>
      </div>
      <div className="table-scroll" role="region" aria-label="Service request queue" tabIndex={0}><table>
        <thead><tr><th><input type="checkbox" aria-label="Select displayed requests" checked={rows.items.length>0&&rows.items.every((r:Data)=>Boolean(selected[r.serviceRequestId]))} onChange={e=>{const on=e.target.checked;setSelected(current=>{const next={...current};rows.items.forEach((r:Data)=>{if(on)next[r.serviceRequestId]=r;else delete next[r.serviceRequestId];});return next;});}}/></th><th>Request</th><th>Service and description</th><th>Source status</th><th>Internal review</th><th>Assignee / due</th></tr></thead>
        <tbody>{rows.items.map((row:Data)=><tr key={row.serviceRequestId}>
          <td><input type="checkbox" aria-label={"Select request "+row.serviceRequestId} checked={Boolean(selected[row.serviceRequestId])} onChange={e=>{const on=e.target.checked;setSelected(current=>{const next={...current};if(on)next[row.serviceRequestId]=row;else delete next[row.serviceRequestId];return next;});}}/></td>
          <td><button className="link" onClick={()=>action(()=>inspectRequest(row))}>{row.serviceRequestId}</button><small>{date(row.updatedAt||row.requestedAt)}</small></td>
          <td className="description"><strong>{label(row.serviceName,"Unspecified service")}</strong><p>{row.description}</p><small>{label(row.address,"Location not supplied")}</small></td>
          <td><span className="badge">{label(row.status)}</span></td>
          <td>{label(row.review?.status,"new")}{row.review?.needsReview&&<small className="flag">Source changed</small>}</td>
          <td>{label(row.review?.assignee,"Unassigned")}<small>{label(row.review?.dueDate,"No due date")}</small></td>
        </tr>)}</tbody>
      </table></div>
      <div className="pagination"><span>{rows.total?offset+1:0}–{Math.min(offset+rows.items.length,rows.total)} of {rows.total} requests · {selection.length} selected</span><div><button disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-100))}>Previous</button><button disabled={offset+100>=rows.total} onClick={()=>setOffset(offset+100)}>Next</button></div></div>
      {target==="source"&&<form className="panel review-form" onSubmit={e=>{e.preventDefault();action(()=>launch("review_delivery","Request review and delivery",{runKey:newKey("review"),captureId,selection:selection.map(row=>({serviceRequestId:row.serviceRequestId,sourceSha256:row.sourceSha256,priorReviewId:row.review?.requestId||null})),review}));}}>
        <div><h3>Assign selected requests</h3><p className="muted">Review the proposed changes in Windmill’s approval page, then build the delivery files.</p></div>
        <div className="form-grid"><label>Status<select value={review.status} onChange={e=>setReview({...review,status:e.target.value})}><option value="new">New</option><option value="assigned">Assigned</option><option value="in_progress">In progress</option><option value="done">Done</option></select></label><label>Assignee<input value={review.assignee} maxLength={200} onChange={e=>setReview({...review,assignee:e.target.value})}/></label><label>Due date<input type="date" value={review.dueDate} onChange={e=>setReview({...review,dueDate:e.target.value})}/></label></div>
        <label>Internal note<textarea rows={3} value={review.note} maxLength={8000} onChange={e=>setReview({...review,note:e.target.value})}/></label>
        <div className="buttons"><button className="primary" disabled={busy||!selection.length||hasPending("review_delivery")}>Review {selection.length} selected</button><button type="button" disabled={!selection.length} onClick={()=>setSelected({})}>Clear selection</button></div>
      </form>}
      <div className="buttons"><button disabled={busy} onClick={()=>action(()=>exportOne("csv"))}>Download CSV</button><button disabled={busy} onClick={()=>action(()=>exportOne("report"))}>Download report</button><button disabled={busy} onClick={()=>action(()=>exportOne("source"))}>Download original response</button></div>
      </>}
      {detail&&<aside className="panel" aria-label="Request detail"><div className="section-heading"><h3>Request {detail.item.serviceRequestId}</h3><button onClick={()=>setDetail(null)}>Close</button></div><p>{detail.item.description}</p><dl><dt>Source status</dt><dd>{label(detail.item.status)}</dd><dt>Internal status</dt><dd>{label(detail.review?.status,"new")}</dd><dt>Assignee</dt><dd>{label(detail.review?.assignee,"Unassigned")}</dd><dt>Due date</dt><dd>{label(detail.review?.dueDate)}</dd></dl><h4>Review history</h4>{detail.review?.history?.length?<ol>{detail.review.history.map((r:Data)=><li key={r.requestId}>{date(r.updatedAt)} · {r.status} · {label(r.assignee,"Unassigned")}<p>{r.note}</p></li>)}</ol>:<p className="muted">No internal review yet.</p>}<details><summary>Original source and capture history</summary><JsonView value={{source:detail.item.source,history:detail.history}}/></details></aside>}
    </section>}

    {tab==="Captures"&&<section><div className="section-heading"><div><h2>Saved captures</h2><p className="muted">Open a capture to inspect its original response, request parameters and attribution.</p></div></div>
      {!captures.length?<div className="empty">The workspace has no captures yet.</div>:<div className="table-scroll" role="region" aria-label="Saved captures" tabIndex={0}><table><thead><tr><th>Captured</th><th>Resource</th><th>Rows</th><th>Source bytes</th><th>Coverage</th><th></th></tr></thead><tbody>{captures.map((c:Data)=><tr key={c.id}><td>{date(c.capturedAt)}<small>{c.id}</small></td><td>{c.kind}</td><td>{c.rowCount}</td><td>{c.sourceBytes?.toLocaleString()}</td><td>{c.complete?"Complete response":"Partial response"}<small>{c.scope?.fixed?"Fixed query":"Open query"}</small></td><td><button disabled={busy} onClick={()=>action(async()=>setCapture(await(backend as any).capture({target,args:{captureId:c.id}})))}>Inspect</button></td></tr>)}</tbody></table></div>}
      {capture&&<article className="panel"><div className="section-heading"><h3>{capture.capture.kind} · {capture.capture.rowCount} rows</h3><button onClick={()=>setCapture(null)}>Close</button></div><p>{capture.capture.connection?.attribution?.publisher}</p><p><a href={capture.capture.connection?.attribution?.licenseUrl} target="_blank" rel="noreferrer">{capture.capture.connection?.attribution?.license}</a></p><dl><dt>Source observed</dt><dd>{date(capture.receipt.observedAt)}</dd><dt>Workspace captured</dt><dd>{date(capture.capture.capturedAt)}</dd><dt>Original source SHA-256</dt><dd className="break">{capture.raw.sha256}</dd><dt>Source address</dt><dd className="break">{capture.receipt.url}</dd></dl><div className="buttons">{["source","json","csv","report"].map(kind=><button key={kind} disabled={busy} onClick={()=>action(()=>exportOne(kind,capture.capture.id))}>Download {kind}</button>)}</div><details><summary>Capture query and original receipt</summary><JsonView value={{query:capture.capture.query,receipt:capture.receipt,scope:capture.capture.scope}}/></details><details><summary>Original response values</summary><JsonView value={capture.value}/></details></article>}
    </section>}

    {tab==="Comparison"&&<section><h2>Compare saved captures</h2><p className="muted">Compare request content from the same connection. The workspace checks whether missing rows can be compared.</p><div className="filters"><label className="wide">Earlier capture<select value={before} onChange={e=>setBefore(e.target.value)}><option value="">Choose capture</option>{requestCaptures.map((c:Data)=><option key={c.id} value={c.id}>{date(c.capturedAt)} · {c.id.slice(-8)}</option>)}</select></label><label className="wide">Later capture<select value={after} onChange={e=>setAfter(e.target.value)}><option value="">Choose capture</option>{requestCaptures.map((c:Data)=><option key={c.id} value={c.id}>{date(c.capturedAt)} · {c.id.slice(-8)}</option>)}</select></label><button className="primary" disabled={busy||!before||!after||before===after} onClick={()=>action(async()=>setComparison(await(backend as any).diff({target,args:{before,after}})))}>Compare</button></div>
      {comparison&&<div className="panel"><div className="metrics">{[["Added",comparison.added.length],["Changed",comparison.changed.length],["Unchanged",comparison.unchanged.length],["Missing from capture",comparison.scopeComparable?comparison.missingFromCapture.length:"Not comparable"]].map(([name,count])=><div key={name}><span>{name}</span><strong>{count}</strong></div>)}</div>{comparison.changed.map((item:Data)=><details key={item.key}><summary>Request {item.id} · {item.fields.length} changed fields</summary><JsonView value={item.fields}/></details>)}<details><summary>Complete comparison</summary><JsonView value={comparison}/></details></div>}
    </section>}

    {tab==="Transfer"&&<section><h2>Portable handover</h2><p className="muted">Keep the service catalogue, captures, reviews and saved operations together when handing work to another operator.</p>
      <div className="two-column"><article className="panel"><h3>Download this workspace</h3><p>Save the complete workspace export for receiving, recovery or continued work.</p><button disabled={busy||!snapshot} onClick={()=>action(()=>exportOne("workspace"))}>Download complete workspace</button></article>
        <article className="panel"><h3>Open the receiving workspace</h3><p>The independent destination retains the original workspace identity and every original source response.</p><button className="primary" disabled={busy||hasPending("transfer")} onClick={()=>action(()=>launch("transfer","Workspace handover",{runKey:newKey("transfer"),source:true,bundle:null}))}>Receive current source workspace</button><p><button className="link" onClick={()=>{setTarget("receiver");setTab("Requests");}}>View receiving workspace</button></p></article></div>
      <article className="panel"><h3>Receive a saved export</h3><label>Select complete workspace JSON<input type="file" accept=".json,application/json" onChange={e=>{const file=e.target.files?.[0];if(!file)return;action(async()=>{if(file.size>192*1024*1024)throw new Error("Choose a workspace export within the 192 MiB receiving limit.");const value=JSON.parse(await file.text());if(value.schema!=="commons.open311.workspace-export.v1")throw new Error("Select a complete Open311 workspace export.");setFileBundle(value);setFileName(file.name);});}}/></label>{fileBundle&&<p>{fileName} · {fileBundle.manifest.captureCount} captures · {fileBundle.manifest.reviewCount} reviews</p>}<button disabled={busy||!fileBundle||hasPending("transfer")} onClick={()=>action(()=>launch("transfer","Saved workspace handover",{runKey:newKey("receive"),source:false,bundle:fileBundle}))}>Receive saved workspace</button></article>
      {delivery&&<article className="panel"><h3>Delivery files</h3><p>Revision {delivery.revision} · {date(delivery.createdAt)}</p><div className="table-scroll" role="region" aria-label="Delivery files" tabIndex={0}><table><thead><tr><th>File</th><th>Bytes</th><th></th></tr></thead><tbody>{delivery.files.map((file:Data)=><tr key={file.filename}><td>{file.filename}</td><td>{file.bytes.toLocaleString()}</td><td><button onClick={()=>action(async()=>download(file))}>Download</button></td></tr>)}</tbody></table></div><button onClick={()=>action(async()=>download({filename:"open311-delivery-manifest.json",contentType:"application/json",body:btoa(unescape(encodeURIComponent(JSON.stringify({...delivery,files:delivery.files.map(({body,...file}:Data)=>file)},null,2)))) ,bytes:new TextEncoder().encode(JSON.stringify({...delivery,files:delivery.files.map(({body,...file}:Data)=>file)},null,2)).length})))}>Download delivery manifest</button></article>}
    </section>}

    {tab==="Activity"&&<section><h2>Activity</h2><p className="muted">Open the native Windmill run for approval, logs and continuation. Interrupted submissions retain their original input and job identity in this browser.</p>
      <div className="panel"><label>Reopen an existing Windmill job<input value={recoveredId} placeholder="Job UUID" onChange={e=>setRecoveredId(e.target.value)}/></label><button disabled={busy||!recoveredId} onClick={()=>action(async()=>{const job:any=await getJob(recoveredId.trim());if(job.workspace_id&&job.workspace_id!==workspace)throw new Error("That job belongs to another workspace.");setRuns(current=>[{id:job.id,kind:"recovered",label:job.script_path||"Recovered job",status:"Queued",createdAt:job.created_at},...current.filter(r=>r.id!==job.id)]);setRecoveredId("");})}>Reopen job</button></div>
      {runs.length?<div className="table-scroll" role="region" aria-label="Windmill job activity" tabIndex={0}><table><thead><tr><th>Operation</th><th>Started</th><th>Status</th><th>Open</th></tr></thead><tbody>{runs.map(run=><tr key={run.id}><td>{run.label}<small className="break">{run.id}</small>{run.error&&<p className="flag">{run.error}</p>}</td><td>{date(run.createdAt)}</td><td>{run.status}</td><td><a href={viewedRunLink(run.id)} target="_blank" rel="noreferrer">Windmill run</a>{run.approval&&<a className="block" href={run.approval} target="_blank" rel="noreferrer">Review approval</a>}{["Submitting","Submission pending"].includes(run.status)&&<button className="link block" disabled={busy} onClick={()=>action(()=>resumeSubmission(run.id))}>Resume submission</button>}{run.status==="Completed"&&<button className="link block" onClick={()=>action(async()=>{const result:any=run.result||await waitJob(run.id);if(result.delivery){setDelivery(result.delivery);setTab("Transfer");}else setOperation(result);})}>Open result</button>}</td></tr>)}</tbody></table></div>:<div className="empty">Capture a source or prepare a review to see its progress here.</div>}
      <h3>Saved workspace operations</h3><div className="table-scroll" role="region" aria-label="Saved workspace operations" tabIndex={0}><table><thead><tr><th>Operation</th><th>Kind</th><th>State</th><th>Updated</th></tr></thead><tbody>{snapshot?.operations?.map((op:Data)=><tr key={op.requestId}><td><button className="link break" onClick={()=>action(async()=>setOperation(await(backend as any).operation({target,args:{requestId:op.requestId}})))}>{op.requestId}</button></td><td>{op.kind}</td><td>{op.state}</td><td>{date(op.updatedAt)}</td></tr>)}</tbody></table></div>
      {operation&&<article className="panel"><div className="section-heading"><h3>Saved result</h3><button onClick={()=>setOperation(null)}>Close</button></div><JsonView value={operation}/></article>}
    </section>}
    <footer>Source: City of Helsinki — Helsingin kaupunginkanslia · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> · <a href="https://hri.fi/data/en_GB/dataset/helsingin-kaupungin-palauterajapinta" target="_blank" rel="noreferrer">Dataset</a></footer>
  </main>;
}
