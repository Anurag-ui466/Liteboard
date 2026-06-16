// Proof of #3 foundation: a true Yjs CRDT syncing over Supabase Realtime broadcast,
// converging under CONCURRENT edits from two independent clients.
import * as Y from "yjs";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, DEV_EMAIL, DEV_PASSWORD } from "./web/config.js";

const b64 = (u8) => Buffer.from(u8).toString("base64");
const unb64 = (s) => new Uint8Array(Buffer.from(s, "base64"));

// A minimal Yjs <-> Supabase-broadcast provider: broadcast local updates, apply remote ones,
// and do an initial state exchange so a joiner catches up.
function makeClient(name, channelName) {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const doc = new Y.Doc();
  const ch = sb.channel(channelName, { config: { broadcast: { self: false } } });
  doc.on("update", (update, origin) => {
    if (origin === "remote") return;                       // don't echo applied-remote updates
    ch.send({ type: "broadcast", event: "yupd", payload: { u: b64(update) } });
  });
  ch.on("broadcast", { event: "yupd" }, (m) => { Y.applyUpdate(doc, unb64(m.payload.u), "remote"); });
  ch.on("broadcast", { event: "ysync" }, (m) => { Y.applyUpdate(doc, unb64(m.payload.u), "remote"); });
  return { sb, doc, ch, name,
    async connect() {
      await new Promise((res) => ch.subscribe((s) => s === "SUBSCRIBED" && res()));
      // share full state so peers converge on join
      ch.send({ type: "broadcast", event: "ysync", payload: { u: b64(Y.encodeStateAsUpdate(doc)) } });
    } };
}

const CH = "yjs-selftest-" + Math.floor(Math.random() * 1e6).toString(36);
const A = makeClient("A", CH), B = makeClient("B", CH);
await A.sb.auth.signInWithPassword({ email: DEV_EMAIL, password: DEV_PASSWORD });
await B.sb.auth.signInWithPassword({ email: DEV_EMAIL, password: DEV_PASSWORD });
await A.connect(); await B.connect();
await new Promise((r) => setTimeout(r, 600));

// CONCURRENT edits: A and B each add a card to the same shared array at ~the same time.
A.doc.getArray("cards").push([{ id: "a1", t: "from A" }]);
B.doc.getArray("cards").push([{ id: "b1", t: "from B" }]);
// also a concurrent map edit on the same key (last-writer wins in Yjs, but no crash/divergence)
A.doc.getMap("meta").set("title", "A title");
B.doc.getMap("meta").set("title", "B title");

await new Promise((r) => setTimeout(r, 1500));

const aCards = A.doc.getArray("cards").toJSON().map((c) => c.id).sort();
const bCards = B.doc.getArray("cards").toJSON().map((c) => c.id).sort();
const aTitle = A.doc.getMap("meta").get("title");
const bTitle = B.doc.getMap("meta").get("title");

let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} — ${m}`); };
ok(aCards.length === 2 && bCards.length === 2, `both clients have BOTH cards (no lost edit) — A=${JSON.stringify(aCards)} B=${JSON.stringify(bCards)}`);
ok(JSON.stringify(aCards) === JSON.stringify(bCards), "card arrays CONVERGED to identical state");
ok(aTitle === bTitle, `concurrent map edit converged (both '${aTitle}') — no divergence`);
console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
