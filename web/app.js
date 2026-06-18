import { SUPABASE_URL, SUPABASE_ANON_KEY, DEV_AUTOLOGIN, DEV_EMAIL, DEV_PASSWORD } from "./config.js";
import { openMembers } from "./members.js";
const { createClient } = window.supabase;

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const app = document.getElementById("app");

// surface failures on-screen instead of a blank/stuck page
function showFatal(msg){ if (app) app.innerHTML = `<div class="wrap"><div class="empty">Couldn't load the dashboard:<br/><b>${msg}</b><br/><br/><button class="newbtn" onclick="location.reload()">Reload</button></div></div>`; }
window.addEventListener("error", (e) => showFatal(e.message || "script error"));
window.addEventListener("unhandledrejection", (e) => showFatal((e.reason && e.reason.message) || String(e.reason)));

// ---- a minimal LiteBoard doc so a new board opens cleanly later -------------
function starterDoc(title) {
  const pid = "p_" + Math.abs(hash(title + ":" + (window.crypto?.randomUUID?.() || title))).toString(36);
  return {
    cur: 0,
    panels: [{ id: pid, name: "Board" }],
    pages: [{ name: "Page 1", panelId: pid, view: { x: 40, y: 20, k: 0.8 },
              strokes: [], zones: [], cards: [], frames: [] }],
    production: { people: [], vendors: [], assets: [], tasks: [],
                  settings: { startDate: "2026-01-01", unit: "days", skipWeekends: true } },
  };
}
function hash(s){let h=0;for(let i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))|0;}return h;}

// ---- routing ----------------------------------------------------------------
function renderFor(session) {
  if (session) renderHome(session);
  else if (!DEV_AUTOLOGIN || sessionStorage.getItem("lb_noauto")) renderAuth();   // show login if auto-login off, or user explicitly signed out
}
// IMPORTANT: never call sb.auth.getSession()/getUser() inside this callback — it re-enters
// GoTrue's navigator lock and deadlocks (page hangs on reload). Use the session passed in.
sb.auth.onAuthStateChange((_event, session) => renderFor(session));
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (!session && DEV_AUTOLOGIN && !sessionStorage.getItem("lb_noauto")) {
    await sb.auth.signInWithPassword({ email: DEV_EMAIL, password: DEV_PASSWORD });
    return; // the resulting SIGNED_IN event triggers renderFor
  }
  renderFor(session);
})();

// ---- auth view --------------------------------------------------------------
function renderAuth() {
  let mode = "in"; // in | up
  app.innerHTML = `
    <div class="auth">
      <h1 id="ah">Sign in</h1>
      <p id="ap">Welcome back to LiteBoard.</p>
      <label>Email</label><input id="email" type="email" placeholder="you@liquidnitrogames.com" autocomplete="email"/>
      <label id="nl" style="display:none">Full name</label><input id="name" style="display:none" placeholder="Your name"/>
      <label>Password</label><input id="pw" type="password" placeholder="••••••••" autocomplete="current-password"/>
      <button class="btn" id="go">Sign in</button>
      <button class="muted-link" id="swap">Need an account? Sign up</button>
      <div class="err" id="err"></div>
    </div>`;
  const $ = (id) => document.getElementById(id);
  $("swap").onclick = () => {
    mode = mode === "in" ? "up" : "in";
    const up = mode === "up";
    $("ah").textContent = up ? "Create account" : "Sign in";
    $("ap").textContent = up ? "Set up your LiteBoard login." : "Welcome back to LiteBoard.";
    $("go").textContent = up ? "Create account" : "Sign in";
    $("swap").textContent = up ? "Have an account? Sign in" : "Need an account? Sign up";
    $("nl").style.display = $("name").style.display = up ? "block" : "none";
  };
  $("go").onclick = async () => {
    $("err").textContent = "";
    const email = $("email").value.trim(), pw = $("pw").value;
    if (!email || !pw) { $("err").textContent = "Email and password required."; return; }
    $("go").disabled = true;
    sessionStorage.removeItem("lb_noauto");
    try {
      if (mode === "up") {
        const { error } = await sb.auth.signUp({ email, password: pw,
          options: { data: { full_name: $("name").value.trim() || email } } });
        if (error) throw error;
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
      }
    } catch (e) { $("err").textContent = e.message || String(e); $("go").disabled = false; }
  };
}

// ---- home view (Miro-style dashboard) --------------------------------------
async function renderHome(session) {
  const user = session.user;
  app.innerHTML = `
    <div class="dash">
      <aside class="sidebar">
        <div class="side-brand"><span class="lb-logo">Lb</span><span class="side-name">LiteBoard</span></div>
        <input id="search" class="side-search" placeholder="Search boards…" autocomplete="off"/>
        <nav class="side-nav">
          <button class="navitem active" data-nav="home"><span class="ni">⌂</span>Home</button>
          <button class="navitem" data-nav="recent"><span class="ni">◷</span>Recent</button>
        </nav>
        <div class="side-spaces">
          <div class="ss-head"><span>Spaces</span><button id="addspace" title="New space">+</button></div>
          <div id="spacelist" class="ss-list"></div>
        </div>
        <div class="side-foot">
          <div class="side-user" title="${escapeHtml(user.email)}">${escapeHtml(user.email)}</div>
          <button id="out" class="side-out">Sign out</button>
        </div>
      </aside>
      <main class="main">
        <div class="main-head">
          <h1 id="dtitle">Dream it, Ship it!</h1>
          <button class="newbtn" id="new">+ Create new</button>
        </div>
        <div class="toolbar">
          <span class="tlabel">Filter by</span>
          <select id="filter"><option value="all">All boards</option><option value="mine">Owned by me</option><option value="shared">Shared with me</option></select>
          <span class="tlabel">Sort by</span>
          <select id="sort"><option value="updated">Last updated</option><option value="name">Name</option></select>
          <span class="spacer"></span>
          <div class="vtoggle"><button id="vgrid" title="Grid view">▦</button><button id="vlist" class="on" title="List view">≣</button></div>
        </div>
        <div id="boards"><div class="loading">Loading boards…</div></div>
      </main>
    </div>`;
  document.getElementById("out").onclick = async () => { sessionStorage.setItem("lb_noauto", "1"); await sb.auth.signOut(); renderAuth(); };
  document.getElementById("new").onclick = () => createBoard(user);

  const FULL = "id,title,kind,status,owner_id,updated_at,icon,space_id,thumbnail";
  const BASIC = "id,title,kind,status,owner_id,updated_at,icon";
  let [{ data: boards, error: be }, { data: mems }, sp] = await Promise.all([
    sb.from("boards").select(FULL).order("updated_at", { ascending: false }),
    sb.from("board_members").select("board_id,role").eq("user_id", user.id),
    sb.from("spaces").select("id,name").order("name"),
  ]);
  if (be) { ({ data: boards, error: be } = await sb.from("boards").select(BASIC).order("updated_at", { ascending: false })); } // spaces/thumbnail migration not applied yet
  const boardsEl = document.getElementById("boards");
  if (be) { boardsEl.innerHTML = `<div class="empty">Couldn't load boards: ${be.message}</div>`; return; }

  let spaces = (sp && sp.data) || [];
  const roleOf = {}; (mems || []).forEach((m) => (roleOf[m.board_id] = m.role));
  const ownerIds = [...new Set((boards || []).map((b) => b.owner_id))];
  const { data: profs } = await sb.from("profiles").select("id,full_name,email")
    .in("id", ownerIds.length ? ownerIds : ["00000000-0000-0000-0000-000000000000"]);
  const nameOf = {}; (profs || []).forEach((p) => (nameOf[p.id] = p.full_name || (p.email || "").split("@")[0]));
  // Best-effort: pull each board's Nitro Forge project-folder URL (doc.projectFolder)
  // in its own query so a JSON-path issue can never break the main board list.
  try {
    const { data: fol } = await sb.from("boards").select("id, folder:doc->>projectFolder");
    if (fol) { const fmap = {}; fol.forEach((r) => { if (r.folder) fmap[r.id] = r.folder; }); (boards || []).forEach((b) => { b.folder = fmap[b.id]; }); }
  } catch (e) { /* json-path select unsupported — folder column just stays empty */ }

  const all = boards || [];
  let view = localStorage.getItem("lb_view") || "list";
  let nav = "home", filter = "all", sort = "updated", q = "";
  const starred = new Set(JSON.parse(localStorage.getItem("lb_starred") || "[]"));
  const saveStars = () => localStorage.setItem("lb_starred", JSON.stringify([...starred]));
  const $ = (id) => document.getElementById(id);

  $("search").oninput = (e) => { q = e.target.value.trim().toLowerCase(); render(); };
  $("filter").onchange = (e) => { filter = e.target.value; render(); };
  $("sort").onchange = (e) => { sort = e.target.value; render(); };
  $("vgrid").onclick = () => { view = "grid"; localStorage.setItem("lb_view", view); syncToggle(); render(); };
  $("vlist").onclick = () => { view = "list"; localStorage.setItem("lb_view", view); syncToggle(); render(); };
  function selectNav(el, navVal, title) {
    document.querySelectorAll(".navitem,.spaceitem").forEach((x) => x.classList.remove("active"));
    el.classList.add("active"); nav = navVal; $("dtitle").textContent = title; render();
  }
  document.querySelectorAll(".navitem").forEach((n) => n.onclick = () => selectNav(n, n.dataset.nav,
    n.dataset.nav === "starred" ? "Starred boards" : n.dataset.nav === "recent" ? "Recent boards" : "Dream it, Ship it!"));

  function renderSpaces() {
    const el = $("spacelist");
    el.innerHTML = spaces.length
      ? spaces.map((s) => `<div class="spaceitem" data-sp="${s.id}"><span class="ni">▦</span><span class="sp-name">${escapeHtml(s.name)}</span><button class="sp-menu" data-spmenu="${s.id}" title="Options">⋮</button></div>`).join("")
      : `<div class="ss-empty">No spaces yet</div>`;
    el.querySelectorAll(".spaceitem").forEach((d) => d.onclick = (e) => { if (e.target.closest("[data-spmenu]")) return; const s = spaces.find((x) => x.id === d.dataset.sp); selectNav(d, "space:" + s.id, s.name); });
    el.querySelectorAll("[data-spmenu]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); openSpaceMenu(b, spaces.find((x) => x.id === b.dataset.spmenu)); });
  }
  function openSpaceMenu(btn, s) {
    closeMenu();
    const m = document.createElement("div"); m.className = "rmenu"; m.id = "rmenu";
    m.innerHTML = `<button data-act="rename">Rename space</button><button data-act="delete" class="danger">Delete space</button>`;
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect(); m.style.left = Math.min(r.left, window.innerWidth - 180) + "px"; m.style.top = (r.bottom + 6) + "px";
    m.querySelectorAll("button").forEach((x) => x.onclick = async (e) => {
      e.stopPropagation(); const act = x.dataset.act; closeMenu();
      if (act === "rename") { const t = prompt("Rename space:", s.name); if (!t) return; const { error } = await sb.from("spaces").update({ name: t }).eq("id", s.id); if (error) return alert(error.message); s.name = t; spaces.sort((a, b) => a.name.localeCompare(b.name)); renderSpaces(); if (nav === "space:" + s.id) $("dtitle").textContent = t; }
      else if (act === "delete") { if (!confirm(`Delete space “${s.name}”? The boards in it won't be deleted — they'll just become unassigned.`)) return; const { error } = await sb.from("spaces").delete().eq("id", s.id); if (error) return alert(error.message); spaces = spaces.filter((x) => x.id !== s.id); all.forEach((b) => { if (b.space_id === s.id) b.space_id = null; }); if (nav === "space:" + s.id) { nav = "home"; $("dtitle").textContent = "Dream it, Ship it!"; document.querySelector('.navitem[data-nav="home"]').classList.add("active"); } renderSpaces(); render(); }
    });
  }
  renderSpaces();
  $("addspace").onclick = async () => {
    const name = prompt("New space name:"); if (!name) return;
    const { data, error } = await sb.from("spaces").insert({ name, owner_id: user.id }).select("id,name").single();
    if (error) return alert(error.message);
    spaces.push(data); spaces.sort((a, b) => a.name.localeCompare(b.name)); renderSpaces();
  };
  function syncToggle(){ $("vgrid").classList.toggle("on", view === "grid"); $("vlist").classList.toggle("on", view === "list"); }
  syncToggle();

  function current() {
    let list = all.slice();
    if (filter === "mine") list = list.filter((b) => b.owner_id === user.id);
    else if (filter === "shared") list = list.filter((b) => b.owner_id !== user.id);
    if (nav.indexOf("space:") === 0) { const sid = nav.slice(6); list = list.filter((b) => b.space_id === sid); }
    else if (nav === "starred") list = list.filter((b) => starred.has(b.id));
    if (q) list = list.filter((b) => (b.title || "").toLowerCase().includes(q));
    if (sort === "name") list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    else list.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
    if (nav === "recent") list = list.slice(0, 12);
    return list;
  }
  const roleLabel = (b) => (b.owner_id === user.id ? "owner" : (roleOf[b.id] || "viewer"));
  const iconCell = (b) => b.icon ? `<img src="${b.icon}" class="ricon"/>` : `<span class="ricon kindicon">${(((b.title || b.kind || "?").trim()[0]) || "?").toUpperCase()}</span>`;
  const thumbHtml = (b) => {
    if (b.icon || !b.thumbnail) return `<span class="bthumb-ph">${iconCell(b)}</span>`;
    let urls; try { urls = JSON.parse(b.thumbnail); } catch (e) { urls = [b.thumbnail]; }
    if (!Array.isArray(urls)) urls = [b.thumbnail];
    if (urls.length <= 1) return `<img src="${urls[0]}" alt=""/>`;
    return `<div class="thumb-collage">${urls.slice(0, 4).map((u) => `<img src="${u}" alt=""/>`).join("")}</div>`;
  };

  function render() {
    const list = current();
    if (!list.length) { boardsEl.className = ""; boardsEl.innerHTML = `<div class="empty">No boards${q ? " match your search" : nav === "starred" ? " starred yet" : " yet"}.</div>`; return; }
    if (view === "grid") {
      boardsEl.className = "bgrid";
      boardsEl.innerHTML = list.map((b) => `
        <div class="bcard" data-open="${b.id}">
          <div class="bthumb">${thumbHtml(b)}<button class="rowmenu gridmenu" data-menu="${b.id}" title="More">⋮</button></div>
          <div class="bcard-body">
            <div class="bcard-title">${escapeHtml(b.title)}</div>
            <div class="bcard-foot"><span class="badge s-${b.status}">${b.status.replace("_", " ")}</span><span class="role">${roleLabel(b)}</span></div>
          </div>
        </div>`).join("");
    } else {
      boardsEl.className = "blist";
      boardsEl.innerHTML = `<div class="lrow lhead"><span>Name</span><span>Project folder</span><span>Status</span><span>Owner</span><span></span></div>` +
        list.map((b) => `
        <div class="lrow" data-open="${b.id}">
          <span class="lname">${iconCell(b)}<span class="lnamecol"><span class="ltitle">${escapeHtml(b.title)}</span><span class="lsub">Modified by ${escapeHtml(nameOf[b.owner_id] || "someone")}, ${relDate(b.updated_at)}</span></span></span>
          <span class="lfolder">${b.folder ? (b.folder.indexOf("file:") === 0
            ? `<a class="folderlink" href="${escapeHtml(b.folder)}" data-folder data-copy="${escapeHtml(decodeURIComponent(b.folder.replace(/^file:\/\/\//, "")).replace(/\//g, "\\"))}" title="Copy the local folder path (paste into Explorer)">Copy folder path ⧉</a>`
            : `<a class="folderlink" href="${escapeHtml(b.folder)}" target="_blank" rel="noopener" data-folder title="Open the project asset folder">Open folder ↗</a>`) : `<span class="lfolder-empty">—</span>`}</span>
          <span><span class="badge s-${b.status}">${b.status.replace("_", " ")}</span></span>
          <span class="lowner">${escapeHtml(nameOf[b.owner_id] || "—")}${b.owner_id === user.id ? " (you)" : ""}</span>
          <span class="lactions"><button class="rowmenu" data-menu="${b.id}" title="More">⋮</button></span>
        </div>`).join("");
    }
    boardsEl.querySelectorAll("[data-open]").forEach((el) => el.onclick = (e) => {
      if (e.target.closest("[data-star],[data-menu],[data-folder]")) return;
      location.href = `board.html?id=${el.dataset.open}`;
    });
    // Local folder links can't be opened from a web page (browser blocks file://),
    // so clicking copies the path to paste into Explorer.
    boardsEl.querySelectorAll("[data-copy]").forEach((el) => el.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      const path = el.getAttribute("data-copy") || "";
      try { navigator.clipboard.writeText(path); } catch (x) {}
      const orig = el.textContent; el.textContent = "Path copied ✓";
      setTimeout(() => { el.textContent = orig; }, 1400);
    });
    boardsEl.querySelectorAll("[data-star]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); const id = b.dataset.star; starred.has(id) ? starred.delete(id) : starred.add(id); saveStars(); render(); });
    boardsEl.querySelectorAll("[data-menu]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); openRowMenu(b, all.find((x) => x.id === b.dataset.menu)); });
  }
  render();

  function openRowMenu(btn, b) {
    closeMenu();
    const amOwner = b.owner_id === user.id, canEdit = amOwner || roleOf[b.id] === "editor";
    const m = document.createElement("div"); m.className = "rmenu"; m.id = "rmenu";
    m.innerHTML = `<button data-act="open">Open</button>`
      + (canEdit ? `<button data-act="rename">Rename</button>` : "")
      + (amOwner ? `<button data-act="share">Share</button>` : "")
      + (amOwner ? `<div class="rmenu-label">Move to space</div>`
          + spaces.map((s) => `<button data-space="${s.id}">${escapeHtml(s.name)}${b.space_id === s.id ? " ✓" : ""}</button>`).join("")
          + `<button data-space="">No space${!b.space_id ? " ✓" : ""}</button>` : "")
      + (amOwner ? `<button data-act="delete" class="danger">Delete</button>` : "");
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect();
    m.style.left = Math.min(r.left - 120, window.innerWidth - 180) + "px"; m.style.top = (r.bottom + 6) + "px";
    m.querySelectorAll("button").forEach((x) => x.onclick = async (e) => {
      e.stopPropagation(); closeMenu();
      if (x.dataset.space !== undefined) {
        const sid = x.dataset.space || null;
        const { error } = await sb.from("boards").update({ space_id: sid }).eq("id", b.id);
        if (error) return alert(error.message); b.space_id = sid; render(); return;
      }
      const act = x.dataset.act;
      if (act === "open") location.href = `board.html?id=${b.id}`;
      else if (act === "share") openMembers(sb, b.id);
      else if (act === "rename") { const t = prompt("Rename board:", b.title); if (t) { await sb.from("boards").update({ title: t }).eq("id", b.id); b.title = t; render(); } }
      else if (act === "delete") { if (confirm(`Delete “${b.title}”? This cannot be undone.`)) { const { error } = await sb.from("boards").delete().eq("id", b.id); if (error) return alert(error.message); const i = all.indexOf(b); if (i >= 0) all.splice(i, 1); render(); } }
    });
  }
  function closeMenu(){ const m = document.getElementById("rmenu"); if (m) m.remove(); }
  document.addEventListener("click", closeMenu);
}

function relDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const days = Math.floor((new Date().setHours(0,0,0,0) - new Date(iso).setHours(0,0,0,0)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return days + " days ago";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

async function createBoard(user) {
  const title = prompt("New board name:", "Untitled board");
  if (title === null) return;
  const { data, error } = await sb.from("boards")
    .insert({ title: title || "Untitled board", owner_id: user.id, kind: "canvas",
              status: "in_progress", doc: starterDoc(title || "Untitled") })
    .select("id").single();
  if (error) { alert("Create failed: " + error.message); return; }
  location.href = `board.html?id=${data.id}`;
}

function escapeHtml(s){return (s||"").replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
