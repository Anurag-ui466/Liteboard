// Append 20 Pinterest image cards to the MoodBoard and rename it.
// Runs as the helper editor account (granted access via the admin SQL step).
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, DEV_EMAIL, DEV_PASSWORD } from "./web/config.js";

const BOARD_ID = "dc4ba32e-e84c-407d-8b71-48b87f03b10d";
const URLS = ["https://i.pinimg.com/736x/c6/54/26/c654261e0d3499cf2aa1ac6815f3d77a.jpg","https://i.pinimg.com/736x/46/e6/be/46e6bee1967d374f81b0a7f0b9a9c05d.jpg","https://i.pinimg.com/736x/7c/6e/92/7c6e929689d74c5edbada148991e0aa3.jpg","https://i.pinimg.com/736x/d6/f2/9a/d6f29aec4145bbcb2c20a6f05f790580.jpg","https://i.pinimg.com/736x/98/b5/e7/98b5e76cce36f8410e1c574bf142399d.jpg","https://i.pinimg.com/736x/69/9a/52/699a52591d8f7c1cc86d0fd8aa20b85d.jpg","https://i.pinimg.com/736x/da/2b/f9/da2bf97a9befa18b88da86d1c46ae3e1.jpg","https://i.pinimg.com/736x/ab/fd/ec/abfdec69442a0b826a4325364d5a288a.jpg","https://i.pinimg.com/736x/78/b7/4b/78b74b2c1b4a84221704c19bf99c3269.jpg","https://i.pinimg.com/736x/db/5e/68/db5e68b73049160f13bd09ff732e72ef.jpg","https://i.pinimg.com/736x/a7/2c/c8/a72cc840f02dd1118f79bf40341e2670.jpg","https://i.pinimg.com/736x/24/8e/41/248e41ab620230d963d4ab474bb90bcf.jpg","https://i.pinimg.com/736x/0a/42/d0/0a42d0d7c3784b891580e0b1360d65ab.jpg","https://i.pinimg.com/736x/3c/eb/5d/3ceb5da1108c8f536f6289ce6b8e446f.jpg","https://i.pinimg.com/736x/e0/06/17/e00617ec51e0c7ecdab51ff2f5d6d492.jpg","https://i.pinimg.com/736x/2a/4f/6e/2a4f6ed0f149264cae946d777272825a.jpg","https://i.pinimg.com/736x/37/c4/25/37c425b0e183e993a34799fe5a973732.jpg","https://i.pinimg.com/736x/84/b0/93/84b093b215ac36ed3b17c6f9a0413c4f.jpg","https://i.pinimg.com/736x/7c/dc/14/7cdc142634edbb6c610f4732090cbf00.jpg","https://i.pinimg.com/736x/d7/0a/09/d70a09c9329155a99fde9596b71cfefa.jpg"];

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { error: se } = await sb.auth.signInWithPassword({ email: DEV_EMAIL, password: DEV_PASSWORD });
if (se) { console.log("signin failed:", se.message); process.exit(1); }

const { data: board, error: be } = await sb.from("boards").select("doc,title").eq("id", BOARD_ID).single();
if (be) { console.log("read failed:", be.message); process.exit(1); }

// ensure a sane doc/page structure
const doc = board.doc && board.doc.pages && board.doc.pages.length
  ? board.doc
  : { cur: 0, panels: [{ id: "mbpanel", name: "MoodBoard" }],
      pages: [{ name: "References", panelId: "mbpanel", view: { x: 40, y: 20, k: 0.55 }, strokes: [], zones: [], frames: [], cards: [] }],
      production: { people: [], vendors: [], assets: [], tasks: [], settings: {} } };
const page = doc.pages[doc.cur || 0];
page.cards = page.cards || [];

// a labelled frame so the references read as one moodboard cluster
const COLS = 5, CW = 300, CH = 360, GX = 30, GY = 60, X0 = 60, Y0 = 110;
page.frames = page.frames || [];
page.frames.push({ id: "mbframe", x: X0 - 24, y: Y0 - 70, w: COLS * (CW + GX) + 24,
  h: Math.ceil(URLS.length / COLS) * (CH + GY) + 60, label: "Supercell-style reference (Pinterest)", color: "#0071e3" });

URLS.forEach((src, i) => {
  const col = i % COLS, row = Math.floor(i / COLS);
  page.cards.push({ id: "mb" + i, type: "image", src,
    x: X0 + col * (CW + GX), y: Y0 + row * (CH + GY), w: CW, h: CH,
    title: "ref " + (i + 1) });
});

const { error: ue } = await sb.from("boards").update({ title: "MoodBoard", doc }).eq("id", BOARD_ID);
if (ue) { console.log("update failed:", ue.message); process.exit(1); }

const { data: check } = await sb.from("boards").select("title,doc").eq("id", BOARD_ID).single();
console.log("title:", check.title);
console.log("image cards on page:", check.doc.pages[doc.cur||0].cards.filter(c=>c.type==="image").length);
