// Verifies the dashboard's access-management backend: owner grants, changes role, revokes;
// non-owners cannot manage. All through RLS with the publishable key.
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./web/config.js";
const ts = Date.now(), pw = "Test!2345";
const mk = () => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} — ${m}`); };
async function user(tag){ const c = mk(); await c.auth.signUp({ email:`lb${tag}${ts}@gmail.com`, password:pw });
  const { data } = await c.auth.getUser(); return { c, id:data.user.id }; }

const owner = await user("own"), mate = await user("mate"), intruder = await user("intr");
const { data: board } = await owner.c.from("boards").insert({ title:"Team Board", owner_id:owner.id, doc:{cur:0,pages:[]} }).select("id").single();
const bid = board.id;
const sees = async (u) => ((await u.c.from("boards").select("id").eq("id", bid)).data||[]).length === 1;

// GRANT editor
{ const { error } = await owner.c.from("board_members").insert({ board_id:bid, user_id:mate.id, role:"editor" });
  ok(!error, "owner grants editor access"); }
ok(await sees(mate), "member now sees the board");
{ const { data } = await mate.c.from("boards").update({ status:"in_review" }).eq("id", bid).select("id");
  ok((data||[]).length === 1, "editor can edit the board"); }

// owner can read the full member roster
{ const { data } = await owner.c.from("board_members").select("user_id,role").eq("board_id", bid);
  ok((data||[]).length === 1 && data[0].role === "editor", "owner sees the members roster"); }

// CHANGE role -> viewer
{ const { error } = await owner.c.from("board_members").update({ role:"viewer" }).eq("board_id", bid).eq("user_id", mate.id);
  ok(!error, "owner changes role to viewer"); }
{ const { data } = await mate.c.from("boards").update({ title:"nope" }).eq("id", bid).select("id");
  ok((data||[]).length === 0, "after downgrade, viewer can NO LONGER edit"); }
ok(await sees(mate), "viewer can still see the board");

// non-owner CANNOT manage sharing
{ const { error } = await intruder.c.from("board_members").insert({ board_id:bid, user_id:intruder.id, role:"editor" });
  ok(!!error, "non-member cannot grant themselves access (RLS)"); }

// REVOKE
{ const { error } = await owner.c.from("board_members").delete().eq("board_id", bid).eq("user_id", mate.id);
  ok(!error, "owner revokes access"); }
ok(!(await sees(mate)), "revoked member no longer sees the board");

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
