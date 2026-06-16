// Resolve Pinterest pin/board pages -> og:image (i.pinimg.com) URLs, verify, output up to 20.
const KNOWN_GOOD = [
  "https://i.pinimg.com/736x/c6/54/26/c654261e0d3499cf2aa1ac6815f3d77a.jpg",
  "https://i.pinimg.com/736x/46/e6/be/46e6bee1967d374f81b0a7f0b9a9c05d.jpg",
  "https://i.pinimg.com/736x/7c/6e/92/7c6e929689d74c5edbada148991e0aa3.jpg",
  "https://i.pinimg.com/736x/d6/f2/9a/d6f29aec4145bbcb2c20a6f05f790580.jpg",
  "https://i.pinimg.com/736x/98/b5/e7/98b5e76cce36f8410e1c574bf142399d.jpg",
  "https://i.pinimg.com/736x/69/9a/52/699a52591d8f7c1cc86d0fd8aa20b85d.jpg",
  "https://i.pinimg.com/736x/da/2b/f9/da2bf97a9befa18b88da86d1c46ae3e1.jpg",
  "https://i.pinimg.com/736x/ab/fd/ec/abfdec69442a0b826a4325364d5a288a.jpg",
  "https://i.pinimg.com/736x/78/b7/4b/78b74b2c1b4a84221704c19bf99c3269.jpg",
  "https://i.pinimg.com/736x/db/5e/68/db5e68b73049160f13bd09ff732e72ef.jpg",
  "https://i.pinimg.com/736x/a7/2c/c8/a72cc840f02dd1118f79bf40341e2670.jpg",
  "https://i.pinimg.com/736x/24/8e/41/248e41ab620230d963d4ab474bb90bcf.jpg",
  "https://i.pinimg.com/736x/0a/42/d0/0a42d0d7c3784b891580e0b1360d65ab.jpg",
  "https://i.pinimg.com/736x/3c/eb/5d/3ceb5da1108c8f536f6289ce6b8e446f.jpg",
  "https://i.pinimg.com/736x/e0/06/17/e00617ec51e0c7ecdab51ff2f5d6d492.jpg",
  "https://i.pinimg.com/736x/2a/4f/6e/2a4f6ed0f149264cae946d777272825a.jpg",
  "https://i.pinimg.com/736x/37/c4/25/37c425b0e183e993a34799fe5a973732.jpg",
  "https://i.pinimg.com/736x/84/b0/93/84b093b215ac36ed3b17c6f9a0413c4f.jpg",
];
const CANDIDATES = [
  "https://www.pinterest.com/pin/304555993553188858/",
  "https://www.pinterest.com/pin/531143349806906153/",
  "https://www.pinterest.com/pin/368732288252740815/",
  "https://www.pinterest.com/pin/546131892290241321/",
  "https://www.pinterest.com/pin/899734831781679594/",
];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function ogImage(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow" });
    const html = await r.text();
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
           || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return m ? m[1].replace(/&amp;/g, "&") : null;
  } catch { return null; }
}
async function loads(url) {
  try { const r = await fetch(url, { headers: { "User-Agent": UA } });
    return r.ok && (r.headers.get("content-type") || "").startsWith("image/"); } catch { return false; }
}

const out = [...KNOWN_GOOD];
for (const p of CANDIDATES) {
  if (out.length >= 20) break;
  const img = await ogImage(p);
  if (!img || !img.includes("pinimg.com") || out.includes(img)) { console.error("skip:", p); continue; }
  if (await loads(img)) { out.push(img); console.error("ADD " + img); }
}
const final = out.slice(0, 20);
console.log("\n=== " + final.length + " image URLs ===");
console.log(JSON.stringify(final));
