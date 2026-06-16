# LiteBoard Cloud — Handoff & Context (LIVE FILE)

> Goal: turn the single-user LiteBoard into a **shared multi-team system**.
> Workflow: Art Director authors a board (moodboard → art bible → scoping → resourcing),
> **hands it off to the Art Lead** for execution, and **tracks every board live by logging in**.
> Last updated: 13 Jun 2026.

## Locked decisions
- **Backend:** Supabase (self-hostable). Postgres + Auth + Realtime + Row-Level Security.
- **Login:** Microsoft 365 / Azure AD SSO in production. Prototype uses email login (swap to the
  Azure provider in Supabase Auth at deploy — needs an app registration in the studio's MS tenant).
- **Approach:** working prototype on localhost first, then deploy to the studio server.
- **Client:** reuse the existing LiteBoard canvas engine (`Skip-Bo Art Style\LiteBoard_src\`).
  Replace its `localStorage` doc store with Supabase-backed, access-controlled, synced state.

## Access model
A board has ONE `owner` (the Art Director). Owners share via `board_members.role`:
`editor` (Art Lead / team — can edit) or `viewer` (read-only tracking). Enforced by RLS.

## Phased plan
- **M1 Foundation** — auth + `boards`/`board_members` schema + home screen (My boards / Shared with me)
  + open/save a board from Postgres (replaces localStorage). ⟵ IN PROGRESS
- **M2 Sharing & roles** — share dialog; owner/editor/viewer; viewers read-only. (The handoff.)
- **M3 Real-time sync** — Yjs + presence; concurrent editing. (Hardest milestone.)
- **M4 Tracking** — AD dashboard across all boards; structured scoping/OKR/task data + roll-up + status.
- **M5 Audit & notifications** — change history with attribution; activity feed; handoff/update alerts.
- **M6 Deploy** — Azure AD SSO; self-host Supabase + client on studio server; SSL, backups.

## Layout
- `supabase/migrations/` — DB schema (init = profiles/boards/members + RLS + triggers + realtime).
- `supabase/config.toml` — local stack config.
- (coming) `web/` — client: auth, home/launcher, board host wrapping the LiteBoard engine.

## How to run (local)
1. Start the stack (first run pulls Docker images, several minutes):
   `cd liteboard-cloud && npx supabase start`
2. Note the printed API URL + anon key (used by the web client).
3. Apply schema changes during dev: `npx supabase db reset` (re-runs all migrations).
4. Studio (DB browser / auth users): the Studio URL printed by `supabase start`.
5. Stop: `npx supabase stop`.

## Hosted Supabase (prototype backend)
- Local Docker stack was blocked (no WSL2 distro), so the prototype runs on a **hosted free Supabase project**.
- Project ref: `sgruwwqubmtnzfcwpycs` · URL `https://sgruwwqubmtnzfcwpycs.supabase.co`
- `web/config.js` holds the URL + publishable (anon) key — browser-safe, protected by RLS.
- Email confirmation is DISABLED (Auth → Sign In/Providers → Email) so prototype signups are instant.
- Both migrations applied via the dashboard SQL editor (init schema + the RLS-returning fix).
- Run the UI locally: `python -m http.server 5510 --directory web` → open http://localhost:5510
  (Claude-in-Chrome can't navigate to localhost, so the UI must be opened in a normal browser.)

## Status & next
- DONE (M1 foundation): hosted backend live; schema + RLS applied; `web/` login + home screen built;
  **access model verified end-to-end by `node test_foundation.mjs` — 11/11 pass** (owner/editor/viewer,
  the AD→Lead handoff, RLS isolation, owner-only sharing).
- GOTCHA fixed: SELECT/UPDATE owner checks must reference `owner_id` DIRECTLY (not via a helper that
  re-queries `boards`), else INSERT...RETURNING fails with a false RLS violation. See migration 20260613150000.
- DONE (M1 canvas wiring): `web/liteboard_cloud.html` = the LiteBoard standalone, patched (by
  `build_liteboard_cloud.py`) so its boot loads `doc` from Postgres and `autosave()` writes back
  (debounced 1.2s, with a save-status pill); viewers get a read-only banner. `board.html` embeds it
  in an iframe under a host bar (status dropdown + owner "Share / hand off" → add editor/viewer).
  Doc round-trip verified headlessly: `node test_doc_roundtrip.mjs` 4/4. **M1 COMPLETE.**
- DONE (silent save): removed the save pill; saving is now background/debounced/coalesced with retry,
  error-only notice. Viewers get a "view only" badge.
- DONE (M3 first cut): realtime over Supabase Realtime channel `board:<id>` — **presence cursors**
  (broadcast board-space coords, rendered via the view transform), **live doc sync** (whole-doc
  broadcast, echo-guarded via applyingRemote, size-guarded <200KB, view/selection preserved on apply),
  and an "N people here" badge. Transport verified two-client headlessly. Model = broadcast + LWW;
  Yjs/CRDT remains the future hardening for heavy simultaneous same-object editing.
  Test multi-user: open the board as your account in one window + the dev bot account
  (credentials in `web/config.local.js`, gitignored) (already an editor) in an incognito window. NOTE: same account in two tabs won't sync (guarded by id===me).
- DONE (Miro-feel pass): smoothed cursors (CSS interp), live object-drag streaming (event:'drag', position
  glide during drag), and GRANULAR APPLY for remote 'doc' events (applyDocGranular/reconcile: update only
  changed nodes via __sigs signature ignoring geometry; geometry = cheap move/resize; focused node never
  clobbered; stale nodes removed; renderInk/renderTabs refreshed). Removes full-render flicker + image reload.
  Grid/table CARDS now get live-cell feel for free. All syntax-checked; visual needs user eyeball (localhost).
- DONE (access management / dashboard): reusable Share panel `web/members.js` (openMembers) — add by
  email, change role (editor/viewer), revoke; owner-only controls (RLS-enforced), read-only roster for others.
  Wired from the dashboard (Share button on owned board cards, app.js) AND the board topbar (Share/Members).
  Lb logo in the board topbar links back to the dashboard (Miro-style); dashboard brand is also a Lb logo link.
  Lifecycle verified headlessly: `node members_test.mjs` 10/10 (grant/roster/role-change/revoke + non-owner blocked).
- DONE (presence avatars + follow): removed the "Only you here" pill. Iframe posts presence to the parent
  (postMessage 'lb-presence') and broadcasts its viewport every 250ms (event:'view'); parent topbar renders
  Google-Docs-style avatars next to the status tab. Click an avatar -> "Follow" callout; following = parent
  tells iframe (lb-follow) which matches the followed user's viewport (vcx/vcy/vk centering); ANY click
  (parent chrome OR canvas pointerdown -> lb-followStopped) stops following. Cross-frame via postMessage.
  Visual needs user eyeball (localhost).
- DONE (per-project branding): added `boards.icon` (text data-URI/URL; migration 20260613160000). Board page:
  the title is inline-editable (click → rename → saves boards.title; that's the project name); the icon is a
  default "Lb" mark that editors can replace by clicking it → menu "Change icon…" (upload image → center-cropped
  to 72px PNG data-URI → boards.icon) or "Back to dashboard". Viewers clicking the icon just navigate to dashboard.
  Custom icon also shown on dashboard cards (app.js). Icon round-trip verified.
- DONE (dev/UX fixes): (a) removed the dashboard "LiteBoard Cloud" wordmark. (b) Serve Supabase from a
  LOCAL umd bundle `web/supabase.js` (no esm.sh CDN waterfall — that was the original slow-load). (c) serve.py
  is now ThreadingHTTPServer + HTTP/1.1 + no-store headers (fixes single-thread stalls & stale cache). (d) DEV
  auto-login via config.js (DEV_AUTOLOGIN/DEV_EMAIL/DEV_PASSWORD; default bot acct) — set DEV_AUTOLOGIN=false
  to restore the login screen. (e) FIXED reload-hang: never call sb.auth.getSession()/getUser() INSIDE
  onAuthStateChange (re-enters GoTrue navigator lock → deadlock on 2nd load); use the session the callback passes.
  Run the app with `python serve.py` (or the Claude preview 'liteboard' config in .claude/launch.json).
- DONE (Miro-style dashboard redesign, app.js renderHome): left sidebar (Lb logo, search, Home/Recent/Starred
  nav, user + sign out) + main area with Filter (all/mine/shared) + Sort (updated/name) + grid/list toggle
  (persisted localStorage lb_view). List rows: icon (custom or kind-initial), title, "Modified by owner, relDate",
  status badge, owner name (from profiles), star (localStorage lb_starred), ⋮ menu (Open/Rename/Share/Delete,
  permission-gated). Verified visually in preview. relDate() helper added. Grid view also available.
- DONE (live task sheet): realtime doc receiver (applyDocGranular) now detects sheet pages (page.kind) and
  re-renders the whole #sheet via render(), but SKIPS re-render while THIS user is focused in a sheet cell
  (so live edits never clobber typing). Canvas-only change, no DB migration.
- DONE (code) Spaces + thumbnails — NEEDS MIGRATION 20260613170000_spaces_thumbnails.sql APPLIED (spaces table +
  boards.space_id + boards.thumbnail). Supabase DASHBOARD session expired mid-task so it couldn't be applied;
  user must re-auth supabase.com (or paste the SQL). app.js is RESILIENT: boards select falls back from FULL
  (with space_id,thumbnail) to BASIC if columns missing, and spaces query failure → spaces=[]; so the dashboard
  works WITHOUT the migration (features just inert). Canvas thumbFromDoc() saves first image src as boards.thumbnail.
  Dashboard: sidebar Spaces section (+ create, click to filter), grid thumbnails, ⋮ "Move to space".
- DONE: migration 20260613170000 APPLIED (user ran the SQL manually). Spaces + thumbnails verified end-to-end
  (5/5 headless: boards select w/ space_id+thumbnail, create/list space, assign board, round-trip) AND visually
  in preview (sidebar spaces Geoplay/Skip-Bo Art, MoodBoard grid thumbnail). All three requested features
  (Spaces, thumbnails, live task sheet) COMPLETE. Demo spaces are bot-owned (isolated from the real user).
- Supabase MCP added to ../../UE5.5/unreal-mcp-main/unreal-mcp-main/.mcp.json but NOT yet connected (needs
  /mcp OAuth approval); migrations currently applied via the dashboard SQL editor.
- DONE (delete UX): space rename/delete via hover ⋮ on sidebar spaceitem (delete sets member boards' space_id
  null, never deletes boards); grid cards now also carry the ⋮ rowmenu (data-menu) so Open/Rename/Share/Move/
  Delete work in BOTH grid and list views. Verified in preview (grid ⋮ + space ⋮ menus render with correct items).
- DONE (crash-proofing pass): board.js global error handlers + main().catch → recoverable UI (not stuck Loading);
  canvas boot wrapped in try/catch (banner, toolbar survives); per-card/frame render isolated via build-script
  replaces (one corrupt object skipped, not whole-canvas blank); save 8MB size-guard (no failing-retry hammer)
  + existing retry + 200KB broadcast cap; canvas window error/unhandledrejection handlers (console.warn, no
  silent death). Dashboard showFatal + auth-deadlock fix already in. All 3 script contexts node --check clean;
  board loads with no regression.
- Status options renamed: draft / in_progress / in_review / approved (was 'done'). board.js STATUSES + .s-approved CSS.
- Board status dropdown labels humanized (s.replace('_',' ')) to match dashboard badges; same boards.status field.
- ROBUSTNESS GOAL (user: "as robust as Miro or more"). Prioritized roadmap = Miro patterns:
  1) media->Storage (URLs not base64), 2) viewport virtualization (render only visible), 3) per-object delta
  sync (Yjs/CRDT), 4) op-log + snapshots, 5) server-gen thumbnails. Honest framing given: literal Miro-parity is
  a years/big-team effort; we adopt patterns in priority order.
- DONE (code, Phase 1 media->Storage): window.__cloudUpload (sb.storage 'board-media' bucket, returns public URL);
  addMediaFile image branch now uploads downscaled blob to Storage and stores the URL, FALLS BACK to embedding
  if __cloudUpload fails/missing (safe pre-bucket). Built + JS valid. NEEDS bucket+policies migration applied:
  20260614120000_storage_media.sql (storage.buckets 'board-media' public + storage.objects insert/read/delete
  policies). Apply via dashboard SQL editor or Supabase MCP. Until applied, uploads embed (current behavior, no regression).
  AFTER applying: verify by uploading an image -> card.src should be an https board-media URL, doc stays small.
- DONE + VERIFIED: storage migration applied (user ran SQL). Storage end-to-end test passed (upload ok, public
  URL 200 image/png, cleanup ok). Image uploads now go to board-media bucket; doc stores URL. Phase 1 COMPLETE.
- DONE + VERIFIED (#2 viewport virtualization): display:none culling in __initRealtime — cullCards() hides
  off-screen .card/.frame (uses obj x/y/w/h + 700px buffer; keeps .sel & focused visible); patched window.applyView
  to throttle-cull (90ms) on every view change + initial cull. Nodes STAY in DOM (selection/realtime/editing
  intact); off-screen = no paint/layout + lazy images don't load. Verified: 50-card board → 24 vis/26 hid default,
  0/50 panned away, 24/26 panned back. NOTE: this culls paint/layout (the runtime cost); it still BUILDS all nodes
  on render (true Miro skips building off-screen too — deeper refactor, coupled w/ realtime reconcile, deferred).
- DONE: drop/upload GRID-arrange images: uniform card size w:240,h:300, tight spacing GX=256,GY=320,
  cols=ceil(sqrt(n)). (build-script replaces on drop handler + filemedia onchange + addMediaFile image pushes.)
  GOTCHA fixed: don't replace_all a substring shared by both the search & replacement args of an app.replace()
  in the build script — it mutates the search string and silently breaks the match (it disabled the Storage
  upload). Search string must match pristine; size/url only in the replacement.
- DONE + VERIFIED: auto-migrate EMBEDDED (base64) images -> Storage on board open (editors only, in __initRealtime,
  1.5s after init): scans all pages' image cards for data:image src, fetch->blob->__cloudUpload->replace src with URL,
  then persist(). Shows "optimizing N/N" then "moved to storage" banner. Verified: 3 embedded -> 3 https URLs, doc
  1035 bytes. This unblocks the user's pre-Storage "too large to save" board automatically when the OWNER opens it.
- #3 CRDT — FOUNDATION PROVEN (yjs_sync_test.mjs, 3/3): real Yjs Y.Doc syncs over Supabase Realtime broadcast
  (doc.on('update')->broadcast base64; on recv Y.applyUpdate origin 'remote' to avoid echo; ysync event shares
  encodeStateAsUpdate on join). Concurrent edits CONVERGE, no lost edits, no divergence. yjs@13.6.31 installed.
  REMAINING for full #3 (staged, needs 2-real-browser testing — can't verify blind):
   a) serve a yjs browser bundle; b) BIND the LiteBoard canvas to a Y.Doc — every mutation (move/add/edit/del/
   draw) writes to Y types; remote Y updates -> reconcile canvas (reuse applyDocGranular). Replaces the whole-doc
   broadcast. This is the big 250KB-engine refactor; do it when 2-browser testing is available (or post-M6 deploy).
- #4 op-log+snapshots — FALLS OUT OF #3: Yjs updates ARE the op-log; persist Y.Doc state to Postgres
   (boards.ydoc bytea snapshot + optional board_updates append table). Build alongside the canvas binding.
- DONE + VERIFIED (#5 collage thumbnails): thumbFromDoc now returns up to 4 image URLs as a JSON array;
  dashboard thumbHtml() renders a 2x grid collage (.thumb-collage), single img if 1, placeholder if none.
  Verified 4-img collage renders. NOTE: true rendered preview needs a render service (CORS blocks client canvas
  export of cross-origin imgs); this collage is the no-infra version.
- DONE (code, #4 version history) — NEEDS MIGRATION 20260614150000_board_history.sql APPLIED (board_history table
  + RLS + prune-to-30 trigger). Canvas flush writes a throttled snapshot (~1/2min, fire-and-forget, safe pre-table).
  board.js: icon menu "Version history" -> openHistory() modal (lists snapshots w/ time+saved_by, Restore = save
  current to history then set boards.doc=snapshot.doc + reload). All syntax-valid. Verify after SQL run (snapshot
  on edit, list, restore). The full Miro op-log still comes with the #3 Yjs binding.
- DONE + VERIFIED (#4 version history): board_history migration applied (user ran SQL). 4/4 headless test passed
  (editor writes snapshot, list, restore sets boards.doc, prune keeps <=30). Live: auto-snapshot on edit +
  icon-menu "Version history" -> restore.
- ROADMAP STATUS: #1 media->Storage ✅ | #2 virtualization ✅ | #3 CRDT foundation proven (canvas binding deferred,
  needs 2-browser test) | #4 version history ✅ | #5 collage thumbnails ✅ (true rendered preview needs render service).
- NEXT: bind canvas to Yjs (#3, needs 2-browser testing) OR M6 deploy (Azure AD SSO + studio server).
  Or M4 AD tracking dashboard / M6 deploy (Azure AD SSO + studio server).
- Browser-side canvas rendering can't be auto-tested here (Chrome blocks localhost); verify by opening
  http://localhost:5510 in a normal browser.
- Toolchain: Node 26, npm 11, Docker 28 (engine needs WSL2 distro — not installed), git, supabase CLI via npx.
- WORKSTREAM (started 14 Jun): embed Lb into other tools + surface workflow content in users' private dashboards
  with provenance icons. Scope/decisions in memory `project-liteboard-embedding`. Track E (embed: E1 mode→E3
  postMessage→E5 SDK; auth is free — host is same-origin+same-Supabase). Track S (provenance): S1 schema→S2 auto-
  Space+board icons→S3 panel-tab icons→S4 pull workflow page into private board.
  ⟶ **MIGRATION PENDING APPLY: `20260614170000_sources_provenance.sql`** (sources registry + boards.source_id +
  spaces.source_id + seed of Unreal/Blender/ComfyUI/Photoshop/3D-pipeline with emoji placeholder icons). Run it in
  the Supabase SQL editor before S2 work. Auto-Space model: spaces are per-user owner-scoped, so each user gets their
  OWN auto-Space per workflow (source_id on spaces); workflow board's space_id points to that user's auto-Space.
- DONE + VERIFIED (14 Jun, media & toolbar polish — all in build_liteboard_cloud.py):
   - **PDFs blocked**: addMediaFile rejects PDFs (toast "PDFs cannot be added to the board") on drop + upload;
     picker `accept` narrowed to `image/*,video/*`. Verified present + JS valid.
   - **Animated GIFs preserved**: GIF branch in addMediaFile skips downscale/canvas (which froze them) and uploads
     the ORIGINAL file to Storage (≤20MB, else toast); falls back to embedding original data URI. GIF cards tagged
     `gif:true`. Verified: Storage serves image/gif with original bytes.
   - **GIF play/pause toggle**: image-card render adds a small bottom-left ⏸/▶ button on GIF cards (detected by
     `c.gif` flag OR src .gif/data:image/gif). Pause snapshots current frame to canvas (Storage CORS=* + crossOrigin
     anonymous → untainted toDataURL) and swaps src; play restores the GIF URL. Verified live: button renders,
     crossOrigin set, canvas snapshot exports without taint. Pause is per-view (not persisted; default = playing).
   - **Disk Save buttons removed (cloud model)**: removed standalone 💾 Save / Save As / 📂 Load from the toolbar
     (saving is the silent Supabase autosave; restore = Version History; open = dashboard). Kept ⬇ HTML import +
     📦 Archive (export). No Ctrl+S binding existed; save()/saveAs()/loadFile() remain as dead code. Verified live.
   - **Grid pans/zooms with the view**: applyView() now also sets the viewport's backgroundPosition (=v.x/v.y) and
     backgroundSize (=110*v.k). Previously the grid was a FIXED viewport CSS background while only the canvas layer
     transformed, so panning an EMPTY board felt frozen (nothing visibly moved). Verified live: pan moves the grid,
     zoom scales it.
