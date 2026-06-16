// Headless verification of the M1 foundation: auth + the board access model (RLS).
// Proves the AD -> Art Lead handoff: owner sees/edits; non-member is blocked;
// once shared as editor, the lead can see + edit; viewer can see but not edit.
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./web/config.js";

const ts = Date.now();
const mk = () => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const pw = "Test!2345";
let pass = 0, fail = 0;
const ok = (c, m) => { (c ? pass++ : fail++); console.log(`${c ? "PASS" : "FAIL"} — ${m}`); };

async function signUp(tag) {
  const c = mk();
  const email = `lb${tag}${ts}@gmail.com`;
  let { data, error } = await c.auth.signUp({ email, password: pw, options: { data: { full_name: tag } } });
  if (error) throw new Error(`signUp ${tag}: ${error.message}`);
  if (!data.session) {
    const r = await c.auth.signInWithPassword({ email, password: pw });
    if (r.error) throw new Error(`Email confirmation appears ENABLED — disable it in Auth settings. (${r.error.message})`);
  }
  const { data: u } = await c.auth.getUser();
  return { c, id: u.user.id, email };
}

const ad   = await signUp("ad");    // Art Director (owner)
const lead = await signUp("lead");  // Art Lead
const other= await signUp("other"); // unrelated artist
console.log(`\nusers: ad=${ad.id.slice(0,8)} lead=${lead.id.slice(0,8)} other=${other.id.slice(0,8)}\n`);

// AD creates a board
const { data: board, error: ce } = await ad.c.from("boards")
  .insert({ title: "Kitchen Reskin — Scoping", owner_id: ad.id, kind: "scoping", status: "in_progress",
            doc: { cur: 0, panels: [], pages: [] } })
  .select("id,title").single();
ok(!ce && board?.id, `AD creates a board ${ce ? "("+ce.message+")" : ""}`);
const bid = board.id;

// AD sees own board
{ const { data } = await ad.c.from("boards").select("id").eq("id", bid);
  ok(data?.length === 1, "AD sees own board"); }

// Unrelated user does NOT see it (RLS)
{ const { data } = await other.c.from("boards").select("id").eq("id", bid);
  ok((data?.length || 0) === 0, "Unrelated user cannot see the board (RLS blocks)"); }

// Lead cannot see it yet
{ const { data } = await lead.c.from("boards").select("id").eq("id", bid);
  ok((data?.length || 0) === 0, "Art Lead cannot see board before handoff"); }

// --- THE HANDOFF: AD shares the board with the Lead as editor ---
{ const { error } = await ad.c.from("board_members").insert({ board_id: bid, user_id: lead.id, role: "editor" });
  ok(!error, `AD hands off: adds Lead as editor ${error ? "("+error.message+")" : ""}`); }

// Lead now sees it
{ const { data } = await lead.c.from("boards").select("id,title").eq("id", bid);
  ok(data?.length === 1, "Art Lead now sees the shared board"); }

// Lead can EDIT it (update doc/status)
{ const { data, error } = await lead.c.from("boards").update({ status: "in_review" }).eq("id", bid).select("status");
  ok(!error && data?.[0]?.status === "in_review", `Art Lead (editor) can update the board ${error ? "("+error.message+")" : ""}`); }

// Non-member still cannot edit
{ const { data } = await other.c.from("boards").update({ status: "done" }).eq("id", bid).select("id");
  ok((data?.length || 0) === 0, "Unrelated user cannot edit the board"); }

// AD adds 'other' as viewer -> can see but NOT edit
{ await ad.c.from("board_members").insert({ board_id: bid, user_id: other.id, role: "viewer" });
  const { data: seen } = await other.c.from("boards").select("id").eq("id", bid);
  ok(seen?.length === 1, "Viewer can see the board (tracking)");
  const { data: edited } = await other.c.from("boards").update({ title: "hacked" }).eq("id", bid).select("id");
  ok((edited?.length || 0) === 0, "Viewer CANNOT edit the board"); }

// Only the owner manages sharing: lead (editor) cannot add members
{ const { error } = await lead.c.from("board_members").insert({ board_id: bid, user_id: other.id, role: "editor" });
  ok(!!error, "Editor cannot manage sharing (only owner can)"); }

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
