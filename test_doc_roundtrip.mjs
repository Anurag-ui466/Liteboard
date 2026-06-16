// Proves the canvas persistence path: write a real LiteBoard `doc` (with a nested
// card) to boards.doc, read it back, and confirm it survived intact.
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./web/config.js";
const ts = Date.now();
const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
await c.auth.signUp({ email: `lbdoc${ts}@gmail.com`, password: "Test!2345" });
const { data: { session } } = await c.auth.getSession();
const me = session.user.id;

const { data: board } = await c.from("boards")
  .insert({ title: "Doc round-trip", owner_id: me, doc: { cur: 0, panels: [], pages: [] } })
  .select("id").single();

// Simulate the canvas autosave: a doc with a panel, a page, and a sticky note card.
const doc = {
  cur: 0,
  panels: [{ id: "pl1", name: "Concept" }],
  pages: [{ name: "Page 1", panelId: "pl1", view: { x: 40, y: 20, k: 0.8 },
            strokes: [], zones: [], frames: [],
            cards: [{ id: "c1", type: "note", x: 120, y: 90, title: "Mood", note: "warm dusk palette", color: "#262320" }] }],
  production: { people: [], vendors: [], assets: [], tasks: [], settings: { unit: "days" } },
};
const { error: ue } = await c.from("boards").update({ doc }).eq("id", board.id);

const { data: read } = await c.from("boards").select("doc").eq("id", board.id).single();
const card = read?.doc?.pages?.[0]?.cards?.[0];

let pass = 0, fail = 0;
const ok = (cond, m) => { (cond ? pass++ : fail++); console.log(`${cond ? "PASS" : "FAIL"} — ${m}`); };
ok(!ue, "doc update succeeded");
ok(read?.doc?.panels?.[0]?.name === "Concept", "panel round-tripped");
ok(read?.doc?.pages?.length === 1, "page round-tripped");
ok(card?.note === "warm dusk palette" && card?.type === "note", "nested card content round-tripped");
console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
