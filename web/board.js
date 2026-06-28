import { SUPABASE_URL, SUPABASE_ANON_KEY, DEV_AUTOLOGIN, DEV_EMAIL, DEV_PASSWORD } from "./config.js";
import { openMembers } from "./members.js";
const { createClient } = window.supabase;

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const app = document.getElementById("app");
const id = new URLSearchParams(location.search).get("id");

// crash-proofing: any uncaught error shows a recoverable message instead of a blank/stuck page
function showFatal(msg) {
  if (app) app.innerHTML = `<div class="wrap"><div class="empty">Something went wrong:<br/><b>${msg}</b><br/><br/>
    <button class="newbtn" onclick="location.reload()">Reload</button>
    <a href="index.html" style="margin-left:12px;color:var(--accent)">← Dashboard</a></div></div>`;
}
window.addEventListener("error", (e) => showFatal(e.message || "Unexpected error"));
window.addEventListener("unhandledrejection", (e) => showFatal((e.reason && e.reason.message) || String(e.reason)));
const STATUSES = ["draft", "in_progress", "in_review", "approved"];
let MY_ID = null, followingId = null, lastUsers = [];

async function main() {
  let { data: { session } } = await sb.auth.getSession();
  if (!session && DEV_AUTOLOGIN) {
    await sb.auth.signInWithPassword({ email: DEV_EMAIL, password: DEV_PASSWORD });
    session = (await sb.auth.getSession()).data.session;
  }
  if (!session) { location.href = "index.html"; return; }
  const me = session.user.id;

  const { data: board, error } = await sb.from("boards")
    .select("id,title,kind,status,owner_id,icon").eq("id", id).single();
  if (error || !board) {
    app.innerHTML = `<div class="wrap"><div class="empty">Board not found, or you don't have access.
      <br/><a href="index.html">← Back to your boards</a></div></div>`;
    return;
  }
  const amOwner = board.owner_id === me;
  let canEdit = amOwner;
  if (!amOwner) {
    const { data: m } = await sb.from("board_members").select("role").eq("board_id", id).eq("user_id", me).maybeSingle();
    canEdit = m?.role === "editor";
  }

  app.innerHTML = `
    <div class="topbar">
      <button class="brandlink" id="projicon" title="${canEdit ? "Project icon — click to change" : "Back to dashboard"}">${iconHtml(board.icon)}</button>
      <input type="file" id="iconfile" accept="image/png,image/jpeg,image/webp" style="display:none"/>
      <div class="brand" id="bname" style="font-size:15px${canEdit ? ";cursor:text" : ""}" ${canEdit ? 'title="Click to rename"' : ""}>${escapeHtml(board.title)}</div>
      <span class="badge s-${board.status}" id="badge">${board.status.replace("_"," ")}</span>
      <div class="spacer"></div>
      <div id="avatars" class="avatars"></div>
      ${canEdit ? `<select id="status" style="width:auto;padding:6px 10px">${STATUSES.map(s=>`<option value="${s}" ${s===board.status?"selected":""}>${s.replace("_"," ")}</option>`).join("")}</select>` : ""}
      <button class="newbtn" id="share">${amOwner ? "Share" : "Members"}</button>
      <div class="who">${amOwner ? "owner" : (canEdit ? "editor" : "viewer")}</div>
    </div>
    <iframe id="canvas" src="liteboard_cloud.html?id=${encodeURIComponent(id)}&_=${Date.now()}"
      style="width:100%;height:calc(100vh - 55px);border:0;display:block;background:#f5f5f7"></iframe>`;

  document.getElementById("share").onclick = () => openMembers(sb, id);

  // project icon — click to change (editors) or go to dashboard
  const iconBtn = document.getElementById("projicon");
  const iconFile = document.getElementById("iconfile");
  iconBtn.onclick = (e) => { e.stopPropagation(); if (!canEdit) { location.href = "index.html"; return; } openIconMenu(iconBtn, iconFile); };
  iconFile.onchange = () => {
    const f = iconFile.files[0]; iconFile.value = "";
    if (!f) return;
    downscaleIcon(f, async (dataUri) => {
      const { error } = await sb.from("boards").update({ icon: dataUri }).eq("id", id);
      if (error) return alert("Couldn't set icon: " + error.message);
      iconBtn.innerHTML = iconHtml(dataUri);
    });
  };

  // editable project name (editors)
  if (canEdit) {
    const nameEl = document.getElementById("bname");
    nameEl.onclick = () => { nameEl.contentEditable = "true"; nameEl.focus(); try { getSelection().selectAllChildren(nameEl); } catch (e) {} };
    nameEl.onblur = async () => {
      nameEl.contentEditable = "false";
      const t = (nameEl.textContent || "").trim() || "Untitled board";
      nameEl.textContent = t; document.title = t + " · LiteBoard";
      await sb.from("boards").update({ title: t }).eq("id", id);
    };
    nameEl.onkeydown = (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); nameEl.blur(); }
      if (ev.key === "Escape") { nameEl.textContent = board.title; nameEl.blur(); }
    };
  }

  if (canEdit) {
    document.getElementById("status").onchange = async (e) => {
      const status = e.target.value;
      const { error } = await sb.from("boards").update({ status }).eq("id", id);
      if (error) return alert("Update failed: " + error.message);
      const b = document.getElementById("badge");
      b.className = "badge s-" + status; b.textContent = status.replace("_", " ");
    };
  }

  // --- live presence avatars + follow (Google-Docs style) ---
  MY_ID = me;
  const iframe = document.getElementById("canvas");
  const avEl = document.getElementById("avatars");
  window.addEventListener("message", (ev) => {
    const d = ev.data || {};
    if (d.type === "lb-presence") { lastUsers = d.users || []; renderAvatars(avEl, iframe); }
    else if (d.type === "lb-followStopped") { followingId = null; renderAvatars(avEl, iframe); }
  });
  iframe.addEventListener("load", () => { try { iframe.contentWindow.postMessage({ type: "lb-request-presence" }, "*"); } catch (e) {} });
  // a click anywhere on the board chrome stops following (canvas clicks stop it from inside the iframe)
  document.addEventListener("click", () => { closeCallout(); if (followingId) stopFollow(iframe, avEl); });

  watchEngineVersion();
}

// An open board tab keeps its in-memory engine until reloaded, so a freshly deployed
// liteboard_cloud.html won't take effect on tabs left open. Watch the engine file's
// Last-Modified and offer a one-click reload when it changes (on load, every 60s, and
// whenever the tab regains focus / becomes visible).
function watchEngineVersion() {
  const ENGINE_URL = "liteboard_cloud.html";
  let loaded = null, polling = false;
  async function stamp() {
    try {
      const r = await fetch(ENGINE_URL + "?v=" + Date.now(), { method: "HEAD", cache: "no-store" });
      return r.headers.get("last-modified") || r.headers.get("etag") || null;
    } catch (e) { return null; }
  }
  function showReloadBar() {
    if (document.getElementById("lb-update")) return;
    const bar = document.createElement("div");
    bar.id = "lb-update";
    bar.style.cssText = "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:100000;background:#0071e3;color:#fff;font:600 13px -apple-system,system-ui,sans-serif;padding:9px 14px;border-radius:999px;box-shadow:0 6px 24px rgba(0,0,0,.25);display:flex;gap:12px;align-items:center";
    const txt = document.createElement("span"); txt.textContent = "A newer version of LiteBoard is available.";
    const btn = document.createElement("button"); btn.textContent = "Reload";
    btn.style.cssText = "background:#fff;color:#0071e3;border:none;border-radius:999px;font:700 12px -apple-system,sans-serif;padding:5px 13px;cursor:pointer";
    btn.onclick = () => location.reload();
    bar.appendChild(txt); bar.appendChild(btn); document.body.appendChild(bar);
  }
  async function check() {
    if (polling) return; polling = true;
    const v = await stamp(); polling = false;
    if (v == null) return;
    if (loaded === null) { loaded = v; return; }   // first call sets the baseline
    if (v !== loaded) showReloadBar();
  }
  check();
  setInterval(check, 60000);
  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
  window.__lbVer = { stamp, check, showReloadBar };   // test hook
}

function renderAvatars(avEl, iframe) {
  if (!avEl) return;
  avEl.innerHTML = (lastUsers || []).map((u) => {
    const ini = (u.name || "?").trim().charAt(0).toUpperCase();
    return `<button class="avatar${u.id===followingId?" following":""}" data-uid="${u.id}" data-name="${escapeHtml(u.name)}" data-me="${u.me?1:0}" style="background:${u.color}" title="${escapeHtml(u.name)}${u.me?" (you)":""}">${ini}</button>`;
  }).join("");
  avEl.querySelectorAll(".avatar").forEach((a) => a.onclick = (e) => { e.stopPropagation(); showCallout(a, iframe, avEl); });
}
function showCallout(a, iframe, avEl) {
  closeCallout();
  const uid = a.dataset.uid, name = a.dataset.name, isMe = a.dataset.me === "1", isFoll = uid === followingId;
  const c = document.createElement("div");
  c.className = "follow-callout"; c.id = "followcallout";
  c.innerHTML = `<div class="fc-name">${escapeHtml(name)}${isMe?" (you)":""}</div>` +
    (isMe ? `<div class="fc-sub">This is you</div>` : `<button class="fc-btn">${isFoll?"Stop following":"Follow"}</button>`);
  document.body.appendChild(c);
  const r = a.getBoundingClientRect();
  c.style.left = Math.min(r.left, window.innerWidth - 190) + "px";
  c.style.top = (r.bottom + 8) + "px";
  if (!isMe) c.querySelector(".fc-btn").onclick = (e) => {
    e.stopPropagation();
    if (isFoll) stopFollow(iframe, avEl); else startFollow(uid, iframe, avEl);
    closeCallout();
  };
}
function startFollow(uid, iframe, avEl) { followingId = uid; try { iframe.contentWindow.postMessage({ type: "lb-follow", userId: uid }, "*"); } catch (e) {} renderAvatars(avEl, iframe); }
function stopFollow(iframe, avEl) { if (!followingId) return; followingId = null; try { iframe.contentWindow.postMessage({ type: "lb-unfollow" }, "*"); } catch (e) {} renderAvatars(avEl, iframe); }
function closeCallout() { const c = document.getElementById("followcallout"); if (c) c.remove(); }

function iconHtml(icon) { return icon ? `<img src="${icon}" class="proj-img" alt="project icon">` : `<span class="lb-logo">Lb</span>`; }
function openIconMenu(btn, fileInput) {
  closeCallout();
  const hasIcon = !!btn.querySelector("img.proj-img");   // a custom icon is currently set
  const c = document.createElement("div"); c.className = "rmenu"; c.id = "followcallout";
  c.innerHTML = `<button data-act="change">Change icon…</button>${hasIcon ? `<button data-act="remove" class="danger">Remove icon</button>` : ""}<button data-act="history">Version history</button><button data-act="dash">Back to dashboard</button>`;
  document.body.appendChild(c);
  const r = btn.getBoundingClientRect(); c.style.left = r.left + "px"; c.style.top = (r.bottom + 8) + "px";
  c.querySelector('[data-act="change"]').onclick = (e) => { e.stopPropagation(); closeCallout(); fileInput.click(); };
  c.querySelector('[data-act="history"]').onclick = (e) => { e.stopPropagation(); closeCallout(); openHistory(id); };
  c.querySelector('[data-act="dash"]').onclick = (e) => { e.stopPropagation(); location.href = "index.html"; };
  const rm = c.querySelector('[data-act="remove"]');
  if (rm) rm.onclick = async (e) => { e.stopPropagation(); closeCallout(); const { error } = await sb.from("boards").update({ icon: null }).eq("id", id); if (error) return alert("Couldn't remove icon: " + error.message); btn.innerHTML = iconHtml(null); };
}
function downscaleIcon(file, cb) {
  const img = new Image();
  img.onload = () => {
    const S = 72, cv = document.createElement("canvas"); cv.width = S; cv.height = S;
    const ctx = cv.getContext("2d");
    const m = Math.min(img.width, img.height), sx = (img.width - m) / 2, sy = (img.height - m) / 2;
    ctx.drawImage(img, sx, sy, m, m, 0, 0, S, S);
    cb(cv.toDataURL("image/png"));
  };
  img.onerror = () => alert("Couldn't read that image.");
  const rd = new FileReader(); rd.onload = (e) => (img.src = e.target.result); rd.readAsDataURL(file);
}

function escapeHtml(s){return (s||"").replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
async function openHistory(boardId) {
  closeCallout();
  const ov = document.createElement("div"); ov.className = "mm-overlay"; ov.id = "histov";
  ov.innerHTML = `<div class="mm-modal"><div class="mm-head"><b>Version history</b><button class="mm-x" aria-label="Close">✕</button></div>
    <div class="mm-hint">Restore points are saved automatically as the board is edited. Restoring keeps your current version in history too.</div>
    <div class="mm-list" id="histlist">Loading…</div></div>`;
  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if (e.target === ov) ov.remove(); });
  ov.querySelector(".mm-x").onclick = () => ov.remove();
  const list = ov.querySelector("#histlist");
  const { data: rows, error } = await sb.from("board_history").select("id,created_at,saved_by").eq("board_id", boardId).order("created_at", { ascending: false }).limit(30);
  if (error) { list.innerHTML = `<div class="mm-empty">Version history isn't set up yet.</div>`; return; }
  if (!rows || !rows.length) { list.innerHTML = `<div class="mm-empty">No saved versions yet — they appear as the board is edited.</div>`; return; }
  const ids = [...new Set(rows.map((r) => r.saved_by).filter(Boolean))];
  const { data: profs } = await sb.from("profiles").select("id,email,full_name").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const nm = {}; (profs || []).forEach((p) => (nm[p.id] = p.full_name || (p.email || "").split("@")[0]));
  list.innerHTML = rows.map((r) => `<div class="mm-row">
    <span class="mm-who">${new Date(r.created_at).toLocaleString()}<span class="mm-sub">${escapeHtml(nm[r.saved_by] || "someone")}</span></span>
    <span class="mm-right"><button class="mm-restore" data-restore="${r.id}">Restore</button></span></div>`).join("");
  list.querySelectorAll("[data-restore]").forEach((b) => b.onclick = async () => {
    if (!confirm("Restore this version? Your current board is saved to history first, so this is undoable.")) return;
    const { data: cur } = await sb.from("boards").select("doc").eq("id", boardId).single();
    if (cur) await sb.from("board_history").insert({ board_id: boardId, doc: cur.doc, saved_by: MY_ID });
    const { data: snap } = await sb.from("board_history").select("doc").eq("id", b.dataset.restore).single();
    if (!snap) { alert("Couldn't load that version."); return; }
    const { error: ue } = await sb.from("boards").update({ doc: snap.doc }).eq("id", boardId);
    if (ue) { alert("Restore failed: " + ue.message); return; }
    location.reload();
  });
}

main().catch((e) => showFatal((e && e.message) || String(e)));
