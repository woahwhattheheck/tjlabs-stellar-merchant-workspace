"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const offline = Boolean(window.REVECS_EXPORT);
  let snapshot = null, selected = null, chosenEdition = "", pageSize = 150;
  let loading = false, timer = null, detailKey = "", detailSequence = 0;
  const tokenKey = "revecs.operator.token." + location.host;
  let token = "";
  if (!offline) {
    const fragment = new URLSearchParams(location.hash.slice(1));
    token = fragment.get("token") || sessionStorage.getItem(tokenKey) || "";
    if (fragment.has("token")) {
      sessionStorage.setItem(tokenKey, token);
      history.replaceState(null, "", location.pathname + location.search);
    }
  }
  const text = (tag, value, className) => {
    const node = document.createElement(tag);
    node.textContent = value == null ? "" : String(value);
    if (className) node.className = className;
    return node;
  };
  const clear = node => node.replaceChildren();
  const fmtDate = value => {
    if (!value) return "No date reported";
    const date = new Date(value.length === 10 ? value + "T12:00:00Z" : value);
    if (Number.isNaN(date.getTime())) return "Date unavailable";
    return new Intl.DateTimeFormat("en-GB", {day:"numeric", month:"short", year:"numeric", timeZone:"UTC"}).format(date);
  };
  const fmtTime = value => {
    if (!value) return "Not yet recorded";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Time unavailable";
    return new Intl.DateTimeFormat("en-GB", {
      day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit", timeZone:"UTC"
    }).format(date) + " UTC";
  };
  const fmtBytes = amount => {
    if (amount < 1024) return amount + " B";
    if (amount < 1048576) return (amount / 1024).toFixed(1) + " KB";
    return (amount / 1048576).toFixed(2) + " MB";
  };
  const fmtMoney = amount => {
    try {
      const n = BigInt(amount || "0");
      return (n / 1000000n).toString() + "." +
        (n % 1000000n).toString().padStart(6, "0").replace(/0+$/, "").padEnd(2, "0") + " USDC";
    } catch (_) { return "Amount unavailable"; }
  };
  const status = state => ({
    idle:"Ready", running:"Receiving", receiving:"Receiving", caught_up:"History up to date",
    page_limit:"Authorized pages received", stopped:"Stopped after the current response",
    interrupted:"Interrupted — saved responses retained", failed:"Receiving needs attention",
    applied:"Events applied", received:"Complete response retained", dispatched:"Request started",
    current:"Current history", archived:"Earlier history", previous:"Earlier history", preview:"Provider preview"
  }[state] || String(state || "Saved").replaceAll("_", " "));
  const notice = (message, isError = false) => {
    $("notice").textContent = message;
    $("notice").hidden = !message;
    $("notice").setAttribute("role", isError ? "alert" : "status");
  };
  async function request(path, body) {
    if (offline) throw new Error("Open the local operator to change this saved workspace.");
    const options = {headers:{"Authorization":"Bearer " + token}, cache:"no-store"};
    if (body !== undefined) {
      options.method = "POST";
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    const response = await fetch(path, options);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The operator could not complete this request.");
    return result;
  }
  async function action(button, operation) {
    const before = button.disabled;
    button.disabled = true;
    notice("");
    try { return await operation(); }
    catch (error) { notice(error.message || String(error), true); }
    finally {
      button.disabled = before;
      if (button.id === "receive-button" && snapshot) button.disabled = snapshot.job?.state === "receiving" || !snapshot.payment_ready;
      if (button.id === "stop" && snapshot) button.disabled = snapshot.job?.state !== "receiving";
    }
  }
  async function download(path, filename) {
    if (offline) {
      const anchor = text("a", "");
      anchor.href = path;
      anchor.download = filename;
      document.body.append(anchor); anchor.click(); anchor.remove();
      return;
    }
    const response = await fetch(path, {headers:{"Authorization":"Bearer " + token}, cache:"no-store"});
    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || "The saved file could not be opened.");
    }
    const url = URL.createObjectURL(await response.blob());
    const anchor = text("a", "");
    anchor.href = url; anchor.download = filename;
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function sourceLink(value, label) {
    if (!value) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") return null;
      const anchor = text("a", label || "Open source filing");
      anchor.href = url.href; anchor.target = "_blank"; anchor.rel = "noreferrer";
      return anchor;
    } catch (_) { return null; }
  }
  function showTab(name) {
    document.querySelectorAll(".panel").forEach(node => { node.hidden = node.id !== name; });
    document.querySelectorAll("[data-tab]").forEach(button => {
      if (button.dataset.tab === name) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }
  function filtered() {
    const words = $("search").value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const watch = new Set(snapshot.watchlist || []);
    const rows = snapshot.catalysts.filter(row =>
      ($("withdrawn").checked || !row.withdrawn) &&
      (!$("watch-only").checked || row.tickers.some(ticker => watch.has(ticker))) &&
      words.every(word => [row.name,row.company,row.indication,...row.tickers].join(" ").toLowerCase().includes(word))
    );
    const priority = row => row.withdrawn ? 4 :
      row.status === "Upcoming" ? 0 : row.status === "Awaiting resubmission" || row.status === "Awaiting date" ? 1 :
      row.status === "Date passed" || row.status === "Decision unresolved" ? 2 : 3;
    return rows.sort((a,b) => priority(a)-priority(b) || (a.date || "9999").localeCompare(b.date || "9999") || a.name.localeCompare(b.name));
  }
  function renderRows() {
    if (!snapshot) return;
    const rows = filtered();
    $("catalyst-count").textContent = rows.length.toLocaleString();
    clear($("catalyst-rows"));
    for (const row of rows.slice(0, pageSize)) {
      const tr = document.createElement("tr");
      tr.classList.toggle("selected", row.id === selected);
      const name = document.createElement("td");
      const button = text("button", row.name, "record-button");
      button.type = "button"; button.dataset.catalyst = row.id;
      button.setAttribute("aria-label", "Review " + row.name);
      button.addEventListener("click", () => select(row.id, true));
      name.append(button, text("span", [row.company, row.tickers.join(" · ")].filter(Boolean).join(" — "), "sub"));
      const date = text("td", row.withdrawn ? "Record withdrawn" : fmtDate(row.date));
      date.dataset.label = "Date";
      if (row.date && row.days_to_date != null && row.days_to_date >= 0)
        date.append(text("span", row.days_to_date === 0 ? "Today" : "In " + row.days_to_date + " days", "sub"));
      const state = document.createElement("td"); state.dataset.label = "Status";
      state.append(text("span", row.status, "tag"));
      tr.append(name, date, state); $("catalyst-rows").append(tr);
    }
    $("empty").hidden = rows.length !== 0;
    $("empty").textContent = snapshot.catalysts.length ?
      ($("watch-only").checked && !(snapshot.watchlist || []).length ?
       "Add your tickers in Workspace & handover to use the watchlist." :
       "No catalysts match these filters. Adjust the search, watchlist or withdrawn-record filter.") :
      (snapshot.configuration.mode === "preview" ?
       "Load the provider's public sample from Receiving history to explore filing and event review." :
       "Receive the first complete event pages from Receiving history to build this workspace.");
    let more = $("show-more");
    if (!more) {
      more = text("button", "", "show-more");
      more.id = "show-more"; more.type = "button";
      $("empty").parentElement.append(more);
      more.addEventListener("click", () => { pageSize += 150; renderRows(); });
    }
    more.hidden = rows.length <= pageSize;
    more.textContent = "Show more catalysts (" + Math.max(0, rows.length-pageSize).toLocaleString() + " remaining)";
  }
  async function select(ident, focus) {
    selected = ident;
    renderRows();
    await renderDetail();
    if (focus && innerWidth < 901) $("detail").scrollIntoView({behavior:"smooth", block:"start"});
  }
  async function renderDetail() {
    const row = snapshot.catalysts.find(c => c.id === selected);
    if (!row) {
      selected = null; detailKey = "";
      $("detail").replaceChildren(text("h3","Filing & history"),
        text("p","Select a catalyst to review its source and complete event history.","muted"));
      return;
    }
    const key = snapshot.selected_edition + ":" + row.id + ":" + row.events + ":" + row.status + ":" + row.date;
    if (key === detailKey) return;
    detailKey = key;
    const sequence = ++detailSequence;
    const container = $("detail");
    clear(container);
    const summary = text("div", "", "summary");
    summary.append(text("h3", row.name), text("p", [row.company, row.tickers.join(" · ")].filter(Boolean).join(" — "), "muted"),
      text("span", row.status, "tag"));
    const dl = document.createElement("dl");
    const entry = (label, value) => {
      if (value == null || value === "") return;
      dl.append(text("dt",label), text("dd",value));
    };
    entry("Current date", row.withdrawn ? "Record withdrawn" : fmtDate(row.date));
    entry("Indication", row.indication); entry("Application", row.application_number);
    entry("Date confidence", row.date_confidence ? row.date_confidence[0].toUpperCase()+row.date_confidence.slice(1) : null);
    entry("Filed", row.filed_at ? fmtDate(row.filed_at) : null);
    entry("Observed", row.last_observed ? fmtTime(row.last_observed) : null);
    summary.append(dl);
    if (row.merged_into) {
      const next = snapshot.catalysts.find(c => c.id === row.merged_into);
      summary.append(text("p", "This record was merged into the surviving catalyst. Its original history remains below."));
      if (next) {
        const button = text("button", "Open " + next.name);
        button.type = "button"; button.addEventListener("click", () => select(next.id, true));
        summary.append(button);
      }
    }
    if (row.source_quote) {
      summary.append(text("p", row.source_kind === "Vendor repair" ? "Reason for the current date" : "Source for the current date", "eyebrow"),
        text("blockquote", row.source_quote, "quote"));
    }
    const link = sourceLink(row.source_url);
    if (link) summary.append(link);
    container.append(summary, text("h3", "Complete event history"));
    const pending = text("p", "Opening the saved event history…", "muted"); container.append(pending);
    try {
      const events = offline ? (snapshot.timelines?.[row.id] || []) :
        (await request("/api/timeline?catalyst=" + encodeURIComponent(row.id) +
         (snapshot.selected_edition ? "&edition=" + encodeURIComponent(snapshot.selected_edition) : ""))).events;
      if (sequence !== detailSequence || selected !== row.id) return;
      pending.remove();
      const list = text("ol", "", "timeline");
      for (const event of events) {
        const item = document.createElement("li");
        const extras = event.duplicate_after_merge ? " — Duplicate retained after merge" :
          event.applied === false && event.new_date ? " — Saved observation; date not applied" : "";
        item.append(text("h4", event.label + extras));
        const meta = [];
        if (event.filed_at) meta.push("Filed " + fmtDate(event.filed_at));
        if (event.detected_at) meta.push("Observed " + fmtTime(event.detected_at));
        if (meta.length) item.append(text("p",meta.join(" · "),"meta"));
        if (event.new_date) {
          const change = event.prior_date ? fmtDate(event.prior_date) + " → " + fmtDate(event.new_date) : fmtDate(event.new_date);
          item.append(text("p",change + (event.applied ? (event.date_changed ? " · Applied date change" : " · Date restated") : "")));
        }
        if (event.outcome) item.append(text("p", ({
          crl:"Complete Response Letter: this review cycle was rejected. A later resubmission can reopen it.",
          approved:"Full approval reported in the sponsor's filing.",
          tentative:"Tentative approval reported.",
          none_found:"The provider has not resolved the decision."
        }[event.outcome] || "Provider outcome: " + event.outcome)));
        if (event.source_quote) item.append(text("blockquote", event.source_quote, "quote"));
        if (event.event_type === "corrected") item.append(text("p","Provider data repair. This event does not count as an FDA extension.","meta"));
        const filing = sourceLink(event.source_url, "Open this event's filing");
        if (filing) item.append(filing);
        if (event.merged_into) {
          const target = snapshot.catalysts.find(c => c.id === event.merged_into);
          if (target) {
            const button = text("button","Review " + target.name);
            button.type = "button"; button.addEventListener("click", () => select(target.id,true));
            item.append(button);
          }
        }
        list.append(item);
      }
      container.append(list);
      if (!events.length) container.append(text("p","This edition has no retained events for the selected catalyst.","muted"));
    } catch (error) {
      if (sequence === detailSequence) { pending.textContent = error.message; detailKey = ""; }
    }
  }
  function renderReceiving() {
    const preview = snapshot.configuration.mode === "preview";
    $("preview-controls").hidden = !preview || offline;
    $("receiving-controls").hidden = preview || offline;
    const active = snapshot.job?.state === "receiving";
    $("receive-button").disabled = active || !snapshot.payment_ready;
    $("stop").disabled = !active;
    $("wallet-status").textContent = snapshot.payment_ready ?
      "The receiving process has a payer configured. Set the request and authorization limits for this operation." :
      "Set PAYER_PRIVATE_KEY in the receiving process and install the payment requirements to enable paid updates.";
    $("job-status").textContent = snapshot.job?.state && snapshot.job.state !== "idle" ?
      status(snapshot.job.state) + (snapshot.job.error ? ". " + snapshot.job.error : "") : "";
    clear($("runs"));
    const attempts = snapshot.attempts || [];
    for (const run of snapshot.runs || []) {
      const item = text("div","","run");
      const summary = document.createElement("div");
      summary.append(text("p",status(run.state)),text("p","Started "+fmtTime(run.created),"meta"));
      if (run.error) summary.append(text("p",run.error,"meta"));
      const counts = attempts.filter(a => a.run === run.id);
      const values = document.createElement("div");
      values.append(text("p",counts.filter(a => a.state === "applied").length+" complete pages applied"),
        text("p",fmtMoney(run.reserved_amount)+" authorized · "+fmtMoney(run.amount_limit)+" operation limit","meta"));
      item.append(summary,values); $("runs").append(item);
    }
    if (!(snapshot.runs || []).length) $("runs").append(text("p","No receiving operations have been recorded.","muted"));
    clear($("response-rows"));
    const responses = [...(snapshot.responses || [])].reverse();
    for (const response of responses) {
      const tr = document.createElement("tr");
      const kind = response.purpose === "provider-meta" ? "Provider freshness" :
        response.purpose === "public-preview" ? "Public preview" :
        response.status === 402 ? "Payment challenge" : "Event response";
      const title = text("td",kind);
      title.append(text("span","HTTP "+response.status+" · "+(response.complete?"Complete":"Partial"),"sub"));
      const received = text("td",fmtTime(response.created)); received.dataset.label="Received";
      const size = text("td",fmtBytes(response.length)); size.dataset.label="Body";
      const open = document.createElement("td");
      const button = text("button",response.complete?"Open original":"Open retained part"); button.type="button";
      button.addEventListener("click",()=>action(button,()=>download(
        offline ? response.download : "/api/response/"+encodeURIComponent(response.id),
        "event-response-"+response.created.slice(0,10)+(response.complete?".json":".partial"))));
      open.append(button); tr.append(title,received,size,open); $("response-rows").append(tr);
    }
    if (!responses.length) {
      const tr=document.createElement("tr"), cell=text("td","Original response bodies will appear here after receiving.");
      cell.colSpan=4; tr.append(cell); $("response-rows").append(tr);
    }
  }
  function renderSettings() {
    if (document.activeElement !== $("watchlist")) $("watchlist").value=(snapshot.watchlist || []).join(", ");
    if (document.activeElement !== $("name")) $("name").value=snapshot.configuration.name;
    $("watchlist-scope").textContent = snapshot.configuration.ticker ?
      "This workspace receives the provider's "+snapshot.configuration.ticker+" stream. Use another workspace for a different server filter." :
      "Local watchlists filter the complete received history, including co-filers. Changing the watchlist uses no provider request.";
    const provider=snapshot.provider;
    const feed=provider?.feed || provider?.freshness || {};
    const freshness=feed.last_polled_at || feed.last_polled || provider?.last_polled_at || provider?.last_polled;
    $("freshness").textContent = freshness ? "Provider last polled "+fmtTime(freshness)+"." :
      provider ? "The complete public metadata response is saved in Receiving history." : "Read the free metadata to record the provider's current freshness.";
    renderExports();
  }
  function renderExports() {
    clear($("exports"));
    for (const row of snapshot.exports || []) {
      const item=text("div","","export-item"), button=text("button","Download complete workspace");
      button.type="button";
      button.addEventListener("click",()=>action(button,()=>download(row.download,row.filename)));
      item.append(button,text("p",fmtBytes(row.bytes)+" · Database, original responses and local operator"));
      $("exports").append(item);
    }
  }
  function render() {
    $("workspace-title").textContent=snapshot.configuration.name;
    document.title=snapshot.configuration.name+" — Event monitor";
    $("mode").textContent=offline?"Saved workspace":snapshot.configuration.mode==="preview"?"Public preview":"Customer workspace";
    $("event-count").textContent=snapshot.events.toLocaleString();
    $("extension-count").textContent=snapshot.fda_extensions.toLocaleString();
    $("repair-count").textContent=snapshot.vendor_repairs.toLocaleString();
    const edition=(snapshot.editions || []).find(row=>row.id===snapshot.selected_edition);
    $("history-status").textContent=edition ?
      "Edition "+edition.ordinal+" · "+status(edition.state)+(edition.completed?" · Received "+fmtTime(edition.completed):"")+
        (edition.needs_reconcile?" · A merge or restoration needs a full history reconciliation.":"") :
      "A complete event history will appear after the first receiving operation.";
    const selectEdition=$("edition"); clear(selectEdition);
    const options=offline ? (snapshot.editions || []).filter(e=>e.id===snapshot.selected_edition) : snapshot.editions || [];
    for (const e of options) {
      const option=text("option","Edition "+e.ordinal+" — "+status(e.state)+" · "+fmtDate(e.created));
      option.value=e.id; option.selected=e.id===snapshot.selected_edition; selectEdition.append(option);
    }
    if (!options.length) selectEdition.append(text("option","No history yet"));
    selectEdition.disabled=offline || !options.length;
    renderRows(); renderReceiving(); renderSettings(); renderDetail();
    clearTimeout(timer);
    if (!offline && snapshot.job?.state==="receiving") timer=setTimeout(()=>refresh(false),1200);
  }
  async function refresh(feedback=true) {
    if (loading) return;
    loading=true;
    try {
      snapshot=offline?window.REVECS_EXPORT:await request("/api/snapshot"+(chosenEdition?"?edition="+encodeURIComponent(chosenEdition):""));
      render();
      if (feedback) notice("");
    } catch (error) { notice(error.message,true); }
    finally { loading=false; }
  }
  document.querySelectorAll("[data-tab]").forEach(button=>button.addEventListener("click",()=>showTab(button.dataset.tab)));
  $("search").addEventListener("input",()=>{pageSize=150;renderRows();});
  for (const id of ["watch-only","withdrawn"]) $(id).addEventListener("change",()=>{pageSize=150;renderRows();});
  $("edition").addEventListener("change",()=>{chosenEdition=$("edition").value;selected=null;detailKey="";refresh();});
  $("refresh").addEventListener("click",()=>refresh());
  $("watchlist-form").addEventListener("submit",event=>{
    event.preventDefault();
    if (offline) return;
    action(event.submitter || $("watchlist-form").querySelector("button"),async()=>{
      await request("/api/watchlist",{tickers:$("watchlist").value.split(/[,\s]+/).filter(Boolean)});
      await refresh(false); notice("Watchlist saved.");
    });
  });
  $("name-form").addEventListener("submit",event=>{
    event.preventDefault(); if (offline) return; action(event.submitter || $("name-form").querySelector("button"),async()=>{
      await request("/api/name",{name:$("name").value}); await refresh(false); notice("Workspace name saved.");
    });
  });
  $("receive-form").addEventListener("submit",event=>{
    event.preventDefault(); action($("receive-button"),async()=>{
      const operation={operation_key:crypto.randomUUID(),max_pages:Number($("max-pages").value),
        max_usdc:$("max-usdc").value,max_page_usdc:$("max-page-usdc").value,refresh:$("reconcile").checked};
      sessionStorage.setItem("revecs.last-receiving-request."+snapshot.configuration.id,JSON.stringify(operation));
      await request("/api/receive",operation); await refresh(false);
    });
  });
  $("stop").addEventListener("click",()=>action($("stop"),async()=>{
    await request("/api/stop",{}); notice("Stopping after the current response has been retained."); await refresh(false);
  }));
  $("preview-file").addEventListener("change",()=>{
    const file=$("preview-file").files[0]; if (!file) return;
    action($("preview-file"),async()=>{
      await request("/api/preview",{body:await file.text(),operation_key:"public-preview-"+crypto.randomUUID()});
      await refresh(false); showTab("catalysts"); notice("The complete public preview has been received.");
    });
  });
  $("metadata").addEventListener("click",()=>action($("metadata"),async()=>{
    await request("/api/metadata",{}); await refresh(false); notice("Provider freshness and its original response are saved.");
  }));
  $("export").addEventListener("click",()=>action($("export"),async()=>{
    const result=await request("/api/export",{}); await refresh(false);
    notice("Complete workspace created. Download it below."); await download(result.download,result.filename);
  }));
  $("replay").addEventListener("click",()=>action($("replay"),async()=>{
    const result=await request("/api/replay",{edition:snapshot.selected_edition});
    detailKey=""; await refresh(false);
    $("replay-status").textContent="Saved event history rebuilt from its original pages.";
  }));
  if (offline) {
    document.querySelectorAll(".live").forEach(node=>{node.hidden=true;});
    $("offline-note").hidden=false;
    $("watchlist").readOnly=true; $("name").readOnly=true;
    for (const id of ["watchlist-form","name-form"]) $(id).addEventListener("submit",event=>event.preventDefault());
  }
  refresh();
})();
