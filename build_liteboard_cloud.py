# Generates web/liteboard_cloud.html: the standalone LiteBoard canvas engine,
# patched so it loads/saves its `doc` from Supabase (per-board, RLS-gated) instead
# of localStorage. Run: python build_liteboard_cloud.py
import os, re

PRISTINE = r"D:\Claude test\miscellaneous\Skip-Bo Art Style\LiteBoard_src\LiteBoard.html"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web", "liteboard_cloud.html")

with open(PRISTINE, "r", encoding="utf-8") as f:
    app = f.read()

# Cloud build: the board page already shows the project icon + name, so strip the
# redundant "Lb LiteBoard" brand and the "v11" build label from the inner canvas toolbar.
app = re.sub(r'<b><img[^>]*>LiteBoard</b>', '', app)
app = re.sub(r'<span id="lbver"[^>]*>v11</span>', '', app)

# Crash-proofing: isolate each card/frame build so one corrupt object can't blank the whole canvas.
app = app.replace(
    "(B().frames||[]).forEach(function(f){canvas.insertBefore(buildFrame(f),ink);});",
    "(B().frames||[]).forEach(function(f){try{canvas.insertBefore(buildFrame(f),ink);}catch(e){console.warn('skip frame',e);}});")
app = app.replace(
    "B().cards.forEach(function(c){canvas.insertBefore(buildCard(c),ink);});",
    "B().cards.forEach(function(c){try{canvas.insertBefore(buildCard(c),ink);}catch(e){console.warn('skip card',e);}});")

# Block PDFs from being added to the board (drop + upload both go through addMediaFile).
app = app.replace(
    "if(!isVid&&!isImg&&!isPdf)return;",
    "if(isPdf){if(typeof toast==='function')toast('PDFs cannot be added to the board');return;}if(!isVid&&!isImg)return;")
app = app.replace('accept="image/*,video/*,application/pdf,.pdf"', 'accept="image/*,video/*"')

# Make the grid move with the view: the grid is the viewport's fixed CSS background, so panning an
# EMPTY board moved only the (empty) canvas layer and felt frozen. Pan/zoom the grid background too.
app = app.replace(
    "function applyView(){const v=B().view;canvas.style.transform=`translate(${v.x}px,${v.y}px) scale(${v.k})`}",
    "function applyView(){const v=B().view;canvas.style.transform=`translate(${v.x}px,${v.y}px) scale(${v.k})`;var _g=110*v.k;vp.style.backgroundPosition=v.x+'px '+v.y+'px';vp.style.backgroundSize=_g+'px '+_g+'px';}")

# Cloud model: saving is automatic (silent background save to Supabase), so the standalone's
# disk-based Save / Save As / Load buttons are removed. HTML import + Archive (export) stay.
app = app.replace(
    '<span class="grp"><button class="btn gold" onclick="save()" title="Save to current file">\U0001F4BE Save</button><button class="btn" onclick="saveAs()">Save As</button><button class="btn" onclick="loadFile()">\U0001F4C2 Load</button>',
    '<span class="grp">')

# Animated-GIF cards get a small play/pause toggle (bottom-left). Pause snapshots the current
# frame to a canvas (Storage serves CORS *, so crossOrigin avoids tainting); play restores the GIF.
app = app.replace(
    "type==='image'&&c.src){const im=document.createElement('img');im.loading='lazy';im.decoding='async';im.src=c.src;im.draggable=false;el.appendChild(im);}",
    "type==='image'&&c.src){const im=document.createElement('img');im.loading='lazy';im.decoding='async';im.draggable=false;var _s=(c.src||'').toLowerCase();var _gif=c.gif||_s.indexOf('data:image/gif')===0||_s.indexOf('.gif')>0;if(_gif)im.crossOrigin='anonymous';im.src=c.src;el.appendChild(im);if(_gif){var _pp=document.createElement('button');_pp.type='button';_pp.title='Play / pause animation';_pp.textContent='\\u23f8';_pp.dataset.paused='0';_pp.style.cssText='position:absolute;left:6px;bottom:6px;width:24px;height:24px;border:none;border-radius:50%;background:rgba(20,20,22,.62);color:#fff;font-size:11px;cursor:pointer;z-index:6;padding:0;display:flex;align-items:center;justify-content:center;';_pp.addEventListener('mousedown',function(e){e.stopPropagation();});_pp.addEventListener('click',function(e){e.stopPropagation();e.preventDefault();if(_pp.dataset.paused==='1'){im.src=c.src;_pp.textContent='\\u23f8';_pp.dataset.paused='0';}else{try{var cv=document.createElement('canvas');cv.width=im.naturalWidth||im.clientWidth||320;cv.height=im.naturalHeight||im.clientHeight||320;cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);im.src=cv.toDataURL('image/png');_pp.textContent='\\u25b6';_pp.dataset.paused='1';}catch(err){console.warn('gif pause failed',err);}}});el.appendChild(_pp);}}")

# Grid-arrange dropped/uploaded images (Miro-style) instead of a diagonal cascade.
app = app.replace(
    "const pt=toCanvas(e.clientX,e.clientY);let i=0;[...e.dataTransfer.files].forEach(f=>{addMediaFile(f,pt.x+i*30,pt.y+i*30);i++;});",
    "const pt=toCanvas(e.clientX,e.clientY);const fs=[...e.dataTransfer.files];const cols=Math.max(1,Math.ceil(Math.sqrt(fs.length))),GX=256,GY=320;fs.forEach(function(f,i){addMediaFile(f,pt.x+(i%cols)*GX,pt.y+Math.floor(i/cols)*GY);});")
app = app.replace(
    "const v=B().view;[...this.files].forEach((f,i)=>addMediaFile(f,-v.x/v.k+120+i*30,-v.y/v.k+120+i*30));this.value='';",
    "const v=B().view;const fs=[...this.files];const cols=Math.max(1,Math.ceil(Math.sqrt(fs.length))),GX=256,GY=320,bx=-v.x/v.k+120,by=-v.y/v.k+120;fs.forEach(function(f,i){addMediaFile(f,bx+(i%cols)*GX,by+Math.floor(i/cols)*GY);});this.value='';")

# Media to Storage (Miro-style): uploaded/dropped images go to a bucket and only the URL is stored,
# instead of embedding base64 in the doc. Falls back to embedding if Storage isn't reachable.
app = app.replace(
    "if(isImg){downscaleImage(f,1600,function(durl){B().cards.push({id:uid(),type:'image',x,y,title:f.name.slice(0,28),src:durl,harvest:''});persist();render();});return;}",
    "if(isImg){if(/gif/i.test(f.type)){if(f.size>20971520){if(typeof toast==='function')toast('GIF too large (max 20MB)');return;}var _g=function(s){B().cards.push({id:uid(),type:'image',x,y,w:240,h:300,title:f.name.slice(0,28),src:s,gif:true,harvest:''});persist();render();};if(window.__cloudUpload){window.__cloudUpload(f,f.name).then(_g).catch(function(e){console.warn('gif upload failed, embedding',e);var r=new FileReader();r.onload=function(ev){_g(ev.target.result);};r.readAsDataURL(f);});}else{var r=new FileReader();r.onload=function(ev){_g(ev.target.result);};r.readAsDataURL(f);}return;}downscaleImage(f,1600,function(durl){function _embed(){B().cards.push({id:uid(),type:'image',x,y,w:240,h:300,title:f.name.slice(0,28),src:durl,harvest:''});persist();render();}if(window.__cloudUpload){fetch(durl).then(function(r){return r.blob();}).then(function(b){return window.__cloudUpload(b,f.name);}).then(function(url){B().cards.push({id:uid(),type:'image',x,y,w:240,h:300,title:f.name.slice(0,28),src:url,harvest:''});persist();render();}).catch(function(e){console.warn('storage upload failed, embedding instead',e);_embed();});}else{_embed();}});return;}")

# 1) The boot IIFE runs synchronously at parse time and reads localStorage.
#    Turn it into window.__bootLiteBoard(), to be called once the cloud doc is fetched.
BOOT_OLD = ("(function(){try{const s=localStorage.getItem('adp_lb_doc_v2');doc=s?JSON.parse(s):defaultDoc();}"
            "catch(e){doc=defaultDoc();}normalize();lastSnap=histSnap();render();})();")
BOOT_NEW = ("window.__bootLiteBoard=function(){try{doc=(window.__CLOUD_DOC&&window.__CLOUD_DOC.pages&&window.__CLOUD_DOC.pages.length)"
            "?window.__CLOUD_DOC:defaultDoc();}catch(e){doc=defaultDoc();}normalize();lastSnap=histSnap();render();};")
assert app.count(BOOT_OLD) == 1, f"boot IIFE anchor not found exactly once (found {app.count(BOOT_OLD)})"
app = app.replace(BOOT_OLD, BOOT_NEW)

# 2) autosave() wrote to localStorage; route it to the cloud saver instead.
AUTOSAVE_OLD = ("function autosave(){try{if(_hasBigMedia())return;var s=snap();if(s.length>3000000){return;}"
                "localStorage.setItem('adp_lb_doc_v2',s);}catch(e){}}")
AUTOSAVE_NEW = "function autosave(){try{if(window.__cloudSave)window.__cloudSave(doc);}catch(e){}}"
assert app.count(AUTOSAVE_OLD) == 1, f"autosave anchor not found exactly once (found {app.count(AUTOSAVE_OLD)})"
app = app.replace(AUTOSAVE_OLD, AUTOSAVE_NEW)

# 3) Bootstrap module: fetch the board doc from Supabase, wire debounced save, boot the app.
BOOTSTRAP = """
<script>
/* Realtime (M3): presence cursors + live document sync over Supabase Realtime.
   Operation model: whole-doc broadcast + last-write-wins (right-sized for this stage;
   CRDT/Yjs is the future hardening for heavy simultaneous same-object editing). */
window.__initRealtime = function(sb, boardId, me, myName, canEdit){
  if (typeof vp === "undefined" || typeof B !== "function" || typeof toCanvas !== "function") {
    console.warn("realtime: canvas globals not ready"); return;
  }
  var COLORS = ["#0071e3","#ff3b30","#34c759","#ff9500","#af52de","#ff2d55","#5ac8fa","#ffcc00"];
  var hsh=0; for (var i=0;i<me.length;i++) hsh=(hsh*31+me.charCodeAt(i))|0;
  var myColor = COLORS[Math.abs(hsh)%COLORS.length];

  var layer = document.createElement("div");
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:90;overflow:hidden";
  document.body.appendChild(layer);
  var peers = {};
  function ensurePeer(uid,color,nm){
    if (peers[uid]) return peers[uid];
    var d = document.createElement("div");
    d.style.cssText = "position:absolute;left:-999px;top:-999px;will-change:left,top;transition:left .09s linear,top .09s linear";
    d.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))"><path d="M4 2l16 8.5-7.2 1.2L9 19z" fill="'+color+'" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg><span style="position:absolute;left:18px;top:12px;background:'+color+';color:#fff;font:600 11px/1.5 -apple-system,sans-serif;padding:1px 7px;border-radius:9px;white-space:nowrap">'+nm+'</span>';
    layer.appendChild(d);
    return (peers[uid] = { el:d, bx:0, by:0, t:Date.now() });
  }
  function place(){
    var r = vp.getBoundingClientRect(), v = B().view;
    for (var uid in peers){ var p = peers[uid];
      var sx = p.bx*v.k + v.x + r.left, sy = p.by*v.k + v.y + r.top;
      var off = (sx < r.left-30 || sx > r.right+30 || sy < r.top-30 || sy > r.bottom+30);
      p.el.style.display = off ? "none" : "block";
      p.el.style.left = sx + "px"; p.el.style.top = sy + "px";
    }
    requestAnimationFrame(place);
  }
  requestAnimationFrame(place);

  // presence -> parent topbar avatars (no in-canvas badge); follow support
  var followId = null;
  function postPresence(){
    var st = channel.presenceState(), users = [];
    for (var k in st){ var meta = (st[k] && st[k][0]) || {}; users.push({ id:k, name:meta.name||"guest", color:meta.color||"#8e8e93", me:(k===me) }); }
    try { window.parent.postMessage({ type:"lb-presence", users:users }, "*"); } catch(e){}
  }
  window.addEventListener("message", function(ev){
    var d = ev.data || {};
    if (d.type === "lb-follow") followId = d.userId;
    else if (d.type === "lb-unfollow") followId = null;
    else if (d.type === "lb-request-presence") postPresence();
  });

  var applyingRemote = false;
  var channel = sb.channel("board:"+boardId, { config: { broadcast:{ self:false }, presence:{ key: me } } });

  channel.on("broadcast", { event:"cursor" }, function(m){
    var p = m.payload; if (!p || p.id===me) return;
    var pr = ensurePeer(p.id, p.color||myColor, p.name||"guest");
    pr.bx = p.bx; pr.by = p.by; pr.t = Date.now();
  });
  // Granular apply: update only changed objects in place (no full re-render / image reload),
  // and never clobber an object the local user is currently editing.
  var __sigs = {};
  function posEl(el, o){ el.style.left=o.x+"px"; el.style.top=o.y+"px"; if(o.w)el.style.width=o.w+"px"; if(o.h)el.style.height=o.h+"px"; }
  function reconcile(o, isFrame){
    var el = canvas.querySelector('[data-id="'+o.id+'"]');
    var rest = JSON.stringify(Object.assign({}, o, { x:0, y:0, w:0, h:0 }));  // signature ignoring geometry
    if (!el){ el = isFrame ? buildFrame(o) : buildCard(o); canvas.insertBefore(el, ink); posEl(el,o); __sigs[o.id]=rest; return; }
    posEl(el, o);                                  // geometry is always a cheap move/resize
    if (__sigs[o.id] === rest) return;             // nothing else changed
    if (el.contains(document.activeElement)){ __sigs[o.id]=rest; return; }  // user is editing it — leave it alone
    el.replaceWith(isFrame ? buildFrame(o) : buildCard(o));   // content changed — rebuild just this node
    __sigs[o.id]=rest;
  }
  function applyDocGranular(inc){
    if (!inc || !inc.pages || !inc.pages.length) return;
    var keepCur = doc.cur, keepView = (B() ? B().view : null);
    doc = inc;
    doc.cur = (doc.pages[keepCur]) ? keepCur : Math.min(keepCur, doc.pages.length-1);
    if (keepView && doc.pages[doc.cur]) doc.pages[doc.cur].view = keepView;
    if (typeof normalize === "function") normalize();
    var page = doc.pages[doc.cur];
    if (page && page.kind) {            // sheet page (task list etc.) — re-render whole sheet live,
      var ae = document.activeElement;  // but never while THIS user is typing in a cell
      var editing = ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable) && ae.closest && ae.closest("#sheet");
      if (!editing && typeof render === "function") render();
      if (typeof histSnap === "function") lastSnap = histSnap();
      return;
    }
    var cards = page.cards||[], frames = page.frames||[];
    var want = {}; frames.forEach(function(f){ want[f.id]=1; }); cards.forEach(function(c){ want[c.id]=1; });
    canvas.querySelectorAll(".card,.frame").forEach(function(el){ if(!want[el.dataset.id]){ el.remove(); delete __sigs[el.dataset.id]; } });
    frames.forEach(function(f){ reconcile(f, true); });
    cards.forEach(function(c){ reconcile(c, false); });
    if (typeof renderInk==="function") renderInk();
    if (typeof applyView==="function") applyView();
    if (typeof renderTabs==="function") renderTabs();
    if (typeof applySel==="function") applySel();
    if (typeof histSnap==="function") lastSnap = histSnap();
  }
  channel.on("broadcast", { event:"doc" }, function(m){
    var p = m.payload; if (!p || p.id===me || !p.doc || !p.doc.pages || !p.doc.pages.length) return;
    applyingRemote = true;
    try { applyDocGranular(p.doc); }
    catch(e){ console.warn("realtime apply failed, full render:", e); if (typeof render==="function") render(); }
    applyingRemote = false;
  });
  channel.on("broadcast", { event:"drag" }, function(m){
    var p = m.payload; if (!p || p.id===me || !p.items) return;
    var all = B().cards.concat(B().frames || []);
    for (var i=0;i<p.items.length;i++){ var it = p.items[i];
      var el = canvas.querySelector('[data-id="'+it.id+'"]');
      if (el){ el.style.left = it.x+"px"; el.style.top = it.y+"px"; }
      for (var j=0;j<all.length;j++){ if (all[j].id===it.id){ all[j].x=it.x; all[j].y=it.y; break; } }
    }
  });
  channel.on("presence", { event:"sync" }, function(){
    var st = channel.presenceState(), ids = Object.keys(st), online = {};
    ids.forEach(function(k){ online[k]=1; });
    for (var uid in peers){ if (!online[uid]) { peers[uid].el.remove(); delete peers[uid]; } }
    postPresence();
  });
  channel.on("broadcast", { event:"view" }, function(m){
    var p = m.payload; if (!p || !followId || p.id !== followId) return;
    var r = vp.getBoundingClientRect(), v = B().view;
    v.k = p.vk; v.x = r.width/2 - p.vcx*p.vk; v.y = r.height/2 - p.vcy*p.vk;
    if (typeof applyView === "function") applyView();
  });
  channel.subscribe(function(status){
    if (status === "SUBSCRIBED") { channel.track({ id: me, name: myName, color: myColor }); postPresence(); }
  });
  // broadcast my viewport so followers can track what I'm looking at
  setInterval(function(){
    var r = vp.getBoundingClientRect(), v = B().view;
    channel.send({ type:"broadcast", event:"view", payload:{ id:me, vcx:(r.width/2 - v.x)/v.k, vcy:(r.height/2 - v.y)/v.k, vk:v.k } });
  }, 250);

  var lastSent = 0;
  vp.addEventListener("mousemove", function(e){
    var now = Date.now(); if (now - lastSent < 55) return; lastSent = now;
    var b = toCanvas(e.clientX, e.clientY);
    channel.send({ type:"broadcast", event:"cursor", payload:{ id:me, name:myName, color:myColor, bx:b.x, by:b.y } });
  });

  // stream object positions WHILE dragging, so others see them glide (Miro feel)
  var dragging = false, lastDrag = 0;
  vp.addEventListener("pointerdown", function(){ dragging = true;
    if (followId){ followId = null; try { window.parent.postMessage({ type:"lb-followStopped" }, "*"); } catch(e){} }
  }, true);
  window.addEventListener("pointerup", function(){ dragging = false; }, true);
  vp.addEventListener("pointermove", function(){
    if (!dragging || !canEdit || applyingRemote) return;
    if (typeof selectedIds === "undefined" || !selectedIds || !selectedIds.size) return;
    var now = Date.now(); if (now - lastDrag < 40) return; lastDrag = now;
    var items = [];
    B().cards.forEach(function(c){ if (selectedIds.has(c.id)) items.push({ id:c.id, x:c.x, y:c.y }); });
    (B().frames||[]).forEach(function(f){ if (selectedIds.has(f.id)) items.push({ id:f.id, x:f.x, y:f.y }); });
    if (items.length) channel.send({ type:"broadcast", event:"drag", payload:{ id:me, items:items } });
  });

  if (canEdit){
    var bt = null, bp = null;
    window.__cloudBroadcast = function(d){
      if (applyingRemote) return;          // never echo a remote-applied change
      bp = d; if (bt) return;
      bt = setTimeout(function(){ bt = null;
        try { var s = JSON.stringify(bp); if (s.length < 200000) channel.send({ type:"broadcast", event:"doc", payload:{ id:me, doc:bp } }); } catch(e){}
      }, 250);
    };
  }
  setInterval(function(){ var now=Date.now(); for (var uid in peers){ if (now-peers[uid].t > 20000){ peers[uid].el.remove(); delete peers[uid]; } } }, 5000);

  // ---- viewport virtualization (#2): hide off-screen cards/frames so the browser skips their
  // layout/paint and their images don't load until panned into view. Nodes stay in the DOM, so
  // selection / realtime / editing all keep working; selected or focused nodes are never hidden.
  function __objById(idv){ var a=B().cards||[]; for(var i=0;i<a.length;i++) if(a[i].id===idv) return a[i]; var f=B().frames||[]; for(var j=0;j<f.length;j++) if(f[j].id===idv) return f[j]; return null; }
  function cullCards(){
    try {
      if (!B() || B().kind) return;                 // sheets aren't a canvas
      var r = vp.getBoundingClientRect(), v = B().view, m = 700;   // 700px board-space buffer
      var x0 = -v.x/v.k - m, y0 = -v.y/v.k - m, x1 = x0 + r.width/v.k + 2*m, y1 = y0 + r.height/v.k + 2*m;
      var nodes = canvas.querySelectorAll(".card,.frame");
      for (var i=0;i<nodes.length;i++){ var el = nodes[i];
        if (el.classList.contains("sel") || el.contains(document.activeElement)) { el.style.display=""; continue; }
        var o = __objById(el.dataset.id); if (!o) { el.style.display=""; continue; }
        var w = o.w || 220, h = o.h || el.offsetHeight || 180;
        el.style.display = (o.x > x1 || o.x + w < x0 || o.y > y1 || o.y + h < y0) ? "none" : "";
      }
    } catch(e){}
  }
  window.__cullCards = cullCards;
  var _origApplyView = window.applyView, _cullT = 0;
  window.applyView = function(){ if (_origApplyView) _origApplyView.apply(this, arguments); if (_cullT) return; _cullT = setTimeout(function(){ _cullT = 0; cullCards(); }, 90); };
  setTimeout(cullCards, 300);

  // one-time: move any EMBEDDED (base64) images to Storage so a pre-Storage board gets light + can save.
  if (canEdit && window.__cloudUpload) {
    setTimeout(async function(){
      try {
        var imgs = [];
        (doc.pages||[]).forEach(function(p){ (p.cards||[]).forEach(function(c){ if (c.type==="image" && typeof c.src==="string" && c.src.indexOf("data:image")===0) imgs.push(c); }); });
        if (!imgs.length) return;
        var tag = document.createElement("div");
        tag.style.cssText = "position:fixed;bottom:12px;left:12px;z-index:99999;background:#0071e3;color:#fff;font:600 12px -apple-system,sans-serif;padding:6px 12px;border-radius:999px";
        tag.textContent = "optimizing " + imgs.length + " image(s)\\u2026"; document.body.appendChild(tag);
        var done = 0;
        for (var i=0;i<imgs.length;i++){ var c = imgs[i];
          try { var blob = await (await fetch(c.src)).blob(); c.src = await window.__cloudUpload(blob, c.title||"img"); done++; tag.textContent = "optimizing " + done + "/" + imgs.length + " image(s)\\u2026"; }
          catch(e){ console.warn("migrate image failed", e); }
        }
        tag.remove();
        if (done){ try { if (typeof persist==="function") persist(); if (typeof render==="function") render(); } catch(e){}
          var ok = document.createElement("div");
          ok.style.cssText = "position:fixed;bottom:12px;left:12px;z-index:99999;background:#34c759;color:#fff;font:600 12px -apple-system,sans-serif;padding:6px 12px;border-radius:999px";
          ok.textContent = done + " image(s) moved to storage \\u2014 board is lighter"; document.body.appendChild(ok);
          setTimeout(function(){ ok.remove(); }, 4000);
        }
      } catch(e){ console.warn("image migration pass failed", e); }
    }, 1500);
  }
};
</script>
<script src="supabase.js"></script>
<script type="module">
import { SUPABASE_URL, SUPABASE_ANON_KEY, DEV_AUTOLOGIN, DEV_EMAIL, DEV_PASSWORD } from "./config.js";
const { createClient } = window.supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const id = new URLSearchParams(location.search).get("id");
function fail(msg){ document.body.innerHTML = '<p style="padding:24px;font:14px -apple-system,sans-serif;color:#86868b">'+msg+'</p>'; }
function banner(text, color){ const b=document.createElement('div'); b.textContent=text;
  b.style.cssText='position:fixed;top:10px;right:12px;z-index:99999;background:'+color+';color:#fff;font:12px -apple-system,sans-serif;font-weight:600;padding:5px 12px;border-radius:999px;box-shadow:0 2px 8px rgba(0,0,0,.2)';
  document.body.appendChild(b); return b; }
// crash-proofing: never let an uncaught error kill the canvas silently
window.addEventListener("error", function(e){ try{ console.warn("LiteBoard error:", e.message); }catch(_){} });
window.addEventListener("unhandledrejection", function(e){ try{ console.warn("LiteBoard rejection:", (e.reason&&e.reason.message)||e.reason); }catch(_){} });
(async () => {
  if (!id) return fail("No board id.");
  let { data: { session } } = await sb.auth.getSession();
  if (!session && DEV_AUTOLOGIN) {
    await sb.auth.signInWithPassword({ email: DEV_EMAIL, password: DEV_PASSWORD });
    session = (await sb.auth.getSession()).data.session;
  }
  if (!session) return fail("Not signed in.");
  const me = session.user.id;
  const { data: board, error } = await sb.from("boards").select("id,doc,owner_id").eq("id", id).single();
  if (error || !board) return fail("Board not found, or you don't have access.");
  let canEdit = board.owner_id === me;
  if (!canEdit) {
    const { data: m } = await sb.from("board_members").select("role").eq("board_id", id).eq("user_id", me).maybeSingle();
    canEdit = m?.role === "editor";
  }
  window.__CLOUD_DOC = (board.doc && board.doc.pages && board.doc.pages.length) ? board.doc : undefined;
  if (canEdit) {
    // Upload media to Supabase Storage and return a URL (Miro-style: keep the board light).
    window.__cloudUpload = async (blob, name) => {
      const safe = (name || "img").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 40);
      const path = id + "/" + Date.now() + "_" + Math.random().toString(36).slice(2, 8) + "_" + safe;
      const { error } = await sb.storage.from("board-media").upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });
      if (error) throw error;
      return sb.storage.from("board-media").getPublicUrl(path).data.publicUrl;
    };
    // Silent background save (Miro-style): debounced, async, coalesced, with retry.
    // No success UI. A small notice appears ONLY if a save fails, so work is never lost silently.
    let timer = null, pending = null, saving = false, errTag = null;
    function thumbFromDoc(dc){ try { var p = dc.pages && dc.pages[dc.cur||0]; if(!p||!p.cards) return null;
      var urls=[]; for(var i=0;i<p.cards.length && urls.length<4;i++){ var c=p.cards[i]; if(c.type==="image"&&c.src&&(/^https?:/.test(c.src)||c.src.length<150000)) urls.push(c.src); } return urls.length ? JSON.stringify(urls) : null; } catch(e){ return null; } }
    const flush = async () => {
      if (saving || pending === null) return;
      const d = JSON.parse(JSON.stringify(pending)); pending = null; saving = true;
      try { if (JSON.stringify(d).length > 8000000) { saving = false; if (!errTag) errTag = banner("board too large to save \\u2014 remove some heavy media", "#ff3b30"); console.warn("doc exceeds 8MB, skipping save"); return; } } catch (_) {}
      const { error } = await sb.from("boards").update({ doc: d, thumbnail: thumbFromDoc(d) }).eq("id", id);
      saving = false;
      if (error) {
        console.warn("LiteBoard save failed, retrying:", error.message);
        pending = d;
        if (!errTag) errTag = banner("can\\u2019t save \\u2014 retrying", "#ff3b30");
        setTimeout(flush, 3000);
      } else {
        if (errTag) { errTag.remove(); errTag = null; }
        // #4: throttled version-history snapshot (~1 per 2 min of editing); fire-and-forget
        try { var _nt = Date.now(); if (!window.__lastHist || _nt - window.__lastHist > 120000) { window.__lastHist = _nt; sb.from("board_history").insert({ board_id: id, doc: d, saved_by: me }); } } catch(e){}
        if (pending !== null) flush();
      }
    };
    window.__cloudSave = (doc) => {
      if (window.__cloudBroadcast) window.__cloudBroadcast(doc); // live realtime push (M3)
      pending = doc;
      if (timer) return;
      timer = setTimeout(() => { timer = null; flush(); }, 1000);
    };
  } else {
    window.__cloudSave = () => {};
    banner("view only", "#8e8e93");
  }
  try { window.__bootLiteBoard && window.__bootLiteBoard(); }
  catch (e) { console.warn("board render failed:", e); banner("Couldn't fully load this board — try reloading", "#ff9500"); }
  const myName = (session.user.email || "someone").split("@")[0];
  if (window.__initRealtime) window.__initRealtime(sb, id, me, myName, canEdit);
})();
</script>
"""
assert app.count("</body>") >= 1, "no </body> found"
app = app.replace("</body>", BOOTSTRAP + "</body>", 1)

with open(OUT, "w", encoding="utf-8") as f:
    f.write(app)
print("OK: wrote", OUT, f"({len(app)} bytes)")
