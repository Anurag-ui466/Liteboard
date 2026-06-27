// Reusable "Share / manage access" modal. Used from the dashboard and the board page.
// Backend ops are gated by RLS: only the board owner can add / change role / revoke.
function esc(s){ return (s||"").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

export async function openMembers(sb, boardId) {
  const { data: { session } } = await sb.auth.getSession();
  const me = session?.user?.id;
  const { data: board } = await sb.from("boards").select("title,owner_id").eq("id", boardId).single();
  if (!board) { alert("Couldn't open sharing — no access to this board."); return; }
  const amOwner = board.owner_id === me;
  const link = new URL("board.html?id=" + boardId, location.href).href;

  const ov = document.createElement("div");
  ov.className = "mm-overlay";
  ov.innerHTML = `<div class="mm-modal" role="dialog" aria-modal="true">
    <div class="mm-head"><b>Share “${esc(board.title)}”</b><button class="mm-x" aria-label="Close">✕</button></div>
    <div class="mm-link"><input class="mm-linkurl" type="text" readonly value="${esc(link)}" title="Board link"/><button class="mm-copy">Copy link</button></div>
    ${amOwner ? `<div class="mm-add">
        <input class="mm-email" type="email" placeholder="teammate@email.com" autocomplete="off"/>
        <select class="mm-role"><option value="editor">can edit</option><option value="viewer">can view</option></select>
        <button class="mm-addbtn">Add</button>
      </div><div class="mm-hint">They need a LiteBoard account first. “can edit” = collaborate · “can view” = read-only tracking.</div>`
      : `<div class="mm-hint">You have access to this board. Only the owner can manage sharing.</div>`}
    <div class="mm-list">Loading…</div>
  </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
  ov.querySelector(".mm-x").onclick = close;
  const listEl = ov.querySelector(".mm-list");

  const copyBtn = ov.querySelector(".mm-copy"), linkInput = ov.querySelector(".mm-linkurl");
  linkInput.onclick = () => linkInput.select();
  copyBtn.onclick = async () => {
    try { await navigator.clipboard.writeText(link); }
    catch (e) { linkInput.select(); try { document.execCommand("copy"); } catch (_) {} }
    const t = copyBtn.textContent; copyBtn.textContent = "Copied!"; copyBtn.classList.add("ok");
    setTimeout(() => { copyBtn.textContent = t; copyBtn.classList.remove("ok"); }, 1500);
  };

  function row(uid, role, pmap, isOwner) {
    const p = pmap[uid] || {};
    const who = esc(p.full_name || p.email || uid.slice(0, 8));
    const sub = p.email && p.full_name ? `<span class="mm-sub">${esc(p.email)}</span>` : "";
    let right;
    if (isOwner) right = `<span class="mm-tag owner">owner</span>`;
    else if (amOwner) right = `<select class="mm-rolesel" data-uid="${uid}">
        <option value="editor"${role==="editor"?" selected":""}>can edit</option>
        <option value="viewer"${role==="viewer"?" selected":""}>can view</option></select>
        <button class="mm-rm" data-uid="${uid}" title="Revoke access">Revoke</button>`;
    else right = `<span class="mm-tag">${role}</span>`;
    return `<div class="mm-row"><span class="mm-who">${who}${uid===me?' <span class="mm-you">you</span>':""}${sub}</span><span class="mm-right">${right}</span></div>`;
  }

  async function load() {
    const { data: members } = await sb.from("board_members").select("user_id,role").eq("board_id", boardId);
    const ids = [board.owner_id, ...((members||[]).map(m => m.user_id))];
    const { data: profs } = await sb.from("profiles").select("id,email,full_name").in("id", ids);
    const pmap = {}; (profs||[]).forEach(p => pmap[p.id] = p);
    const rows = [row(board.owner_id, "owner", pmap, true)];
    (members||[]).filter(m => m.user_id !== board.owner_id).forEach(m => rows.push(row(m.user_id, m.role, pmap, false)));
    listEl.innerHTML = rows.join("");
    listEl.querySelectorAll(".mm-rolesel").forEach(sel => sel.onchange = async () => {
      const { error } = await sb.from("board_members").update({ role: sel.value }).eq("board_id", boardId).eq("user_id", sel.dataset.uid);
      if (error) alert("Couldn't change role: " + error.message);
      load();
    });
    listEl.querySelectorAll(".mm-rm").forEach(btn => btn.onclick = async () => {
      const { error } = await sb.from("board_members").delete().eq("board_id", boardId).eq("user_id", btn.dataset.uid);
      if (error) alert("Couldn't revoke: " + error.message);
      load();
    });
  }

  if (amOwner) {
    const add = ov.querySelector(".mm-addbtn"), email = ov.querySelector(".mm-email"), roleSel = ov.querySelector(".mm-role");
    const doAdd = async () => {
      const e = email.value.trim(); if (!e) return;
      const { data: prof } = await sb.from("profiles").select("id").eq("email", e).maybeSingle();
      if (!prof) { alert("No LiteBoard account with that email yet — they need to sign up once."); return; }
      if (prof.id === board.owner_id) { alert("That's the owner."); return; }
      const { error } = await sb.from("board_members").upsert({ board_id: boardId, user_id: prof.id, role: roleSel.value });
      if (error) { alert("Couldn't add: " + error.message); return; }
      email.value = ""; load();
    };
    add.onclick = doAdd;
    email.onkeydown = (ev) => { if (ev.key === "Enter") doAdd(); };
  }
  load();
}
