// Transforms downloaded open-source templates into rebranded demo sites under
// public/demo-sites/<slug>/. Run once; the OUTPUT is committed, the raw templates are not.
//
//   node scripts/build-demo-sites.mjs <templates-dir>
//
// Steps per site: copy → prune build tooling → localize CDN assets and Google Fonts
// → compress oversized images → replace identity strings → inject demo <base> guards.
// Footer attribution links are deliberately left intact (license requirement).

import { readFile, writeFile, mkdir, cp, rm, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { SITES, PRUNE, VENDOR, tierLayers } from "./demo-sites.config.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const SRC_ROOT = process.argv[2];
if (!SRC_ROOT || !existsSync(SRC_ROOT)) {
  console.error("Usage: node scripts/build-demo-sites.mjs <templates-dir>");
  process.exit(1);
}
const OUT_ROOT = path.join(process.cwd(), "public", "demo-sites");
const VENDOR_DIR = path.join(OUT_ROOT, "_vendor");

const log = (...a) => console.log(...a);

// Brand accent per site (mirrors lib/proof.ts demoSites[].accent).
const ACCENTS = {
  "lumina-dental": "#0EA5A6",
  "meridian-legal": "#B45309",
  "summit-ridge-roofing": "#EA580C",
  "northgate-it": "#2563EB",
  flowdesk: "#7C3AED",
  "harborview-realty": "#0F766E",
  "ascent-academy": "#DB2777",
  "verve-botanicals": "#65A30D",
  "anika-mehra-coaching": "#9333EA",
  loopwise: "#0891B2",
};
const siteAccent = (slug) => ACCENTS[slug] ?? "#7C3AED";

const MAP_PLACEHOLDER =
  '<div style="min-height:280px;display:flex;align-items:center;justify-content:center;background:#eef1f4;color:#7b8794;font:500 14px system-ui,sans-serif">Map — demo placeholder</div>';

/* ------------------------------- helpers ------------------------------- */

async function walk(dir, filter) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p, filter)));
    else if (!filter || filter(p)) out.push(p);
  }
  return out;
}

// Replace the *contents* of the first element matching `open` with `filler`,
// walking nested <div>s to find the real closing tag.
function emptyContainer(html, open, filler) {
  const m = html.match(open);
  if (!m) return html;
  const start = m.index + m[0].length;
  let depth = 1;
  const tag = /<div\b[^>]*>|<\/div>/gi;
  tag.lastIndex = start;
  for (let t; (t = tag.exec(html)); ) {
    depth += t[0][1] === "/" ? -1 : 1;
    if (depth === 0) return html.slice(0, start) + filler + html.slice(t.index);
  }
  return html;
}

// A stand-in for an image the template referenced but never shipped: pick the
// closest-named real file in the same folder so the layout still has a picture.
async function siblingImage(missingAbs) {
  const dir = path.dirname(missingAbs);
  if (!existsSync(dir)) return null;
  const base = path.basename(missingAbs).replace(/\d+(?=\.\w+$)/, "");
  const files = (await readdir(dir)).filter((n) => /\.(png|jpe?g|gif|webp)$/i.test(n));
  if (!files.length) return null;
  return files.find((n) => n.startsWith(base.slice(0, 6))) ?? files[0];
}

// Find a usable stand-in image for a missing path, walking up the asset tree
// (the template may reference a whole folder it never shipped).
async function anyImageNear(missingAbs) {
  const isImg = (n) => /\.(png|jpe?g|gif|webp)$/i.test(n) && !/favicon|logo|sprite|icon/i.test(n);
  for (let dir = path.dirname(missingAbs), hops = 0; hops < 3; dir = path.dirname(dir), hops++) {
    if (!existsSync(dir)) continue;
    const entries = await readdir(dir, { withFileTypes: true });
    const direct = entries.find((e) => e.isFile() && isImg(e.name));
    if (direct) return path.join(dir, direct.name);
    for (const sub of entries.filter((e) => e.isDirectory())) {
      const inner = (await readdir(path.join(dir, sub.name))).find(isImg);
      if (inner) return path.join(dir, sub.name, inner);
    }
  }
  return null;
}

const fetchBuf = async (url) => {
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120" } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return Buffer.from(await r.arrayBuffer());
};

/* --------------------------- vendor localization --------------------------- */
// Downloads the CDN files and Google Fonts once into public/demo-sites/_vendor/,
// returning a map of original URL -> local filename.

async function buildVendor(fontUrls) {
  await mkdir(path.join(VENDOR_DIR, "fonts"), { recursive: true });
  const map = new Map();

  for (const url of VENDOR) {
    const name = url.replace(/^https?:\/\//, "").replace(/[^a-z0-9.]+/gi, "-");
    const dest = path.join(VENDOR_DIR, name);
    if (!existsSync(dest)) await writeFile(dest, await fetchBuf(url));
    map.set(url, `_vendor/${name}`);

    // Font-icon CSS pulls its own font files relative to the CSS URL.
    if (name.endsWith(".css")) {
      let css = await readFile(dest, "utf8");
      const refs = [...css.matchAll(/url\(["']?([^)"']+\.(?:woff2?|ttf|eot|svg))[^)]*\)/g)];
      for (const [, ref] of refs) {
        if (ref.startsWith("data:")) continue;
        const abs = new URL(ref.split("?")[0], url).href;
        const fname = abs.split("/").pop().split("?")[0];
        const fdest = path.join(VENDOR_DIR, "fonts", fname);
        try {
          if (!existsSync(fdest)) await writeFile(fdest, await fetchBuf(abs));
          css = css.split(ref).join(`fonts/${fname}`);
        } catch {
          /* icon variants that 404 upstream — drop the rule rather than fail the build */
        }
      }
      await writeFile(dest, css);
    }
  }

  // Google Fonts: fetch the CSS (browser UA => woff2), pull each face local.
  for (const url of fontUrls) {
    const name = "gfont-" + [...url].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36) + ".css";
    const dest = path.join(VENDOR_DIR, name);
    if (!existsSync(dest)) {
      let css = await fetchBuf(url).then((b) => b.toString("utf8"));
      for (const [, ref] of [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)]) {
        const fname = ref.split("/").slice(-3).join("-");
        const fdest = path.join(VENDOR_DIR, "fonts", fname);
        if (!existsSync(fdest)) await writeFile(fdest, await fetchBuf(ref));
        css = css.split(ref).join(`fonts/${fname}`);
      }
      await writeFile(dest, css);
    }
    map.set(url, `_vendor/${name}`);
  }
  return map;
}

/* ------------------------------ image squeeze ------------------------------ */

async function compressImages(dir) {
  const imgs = await walk(dir, (p) => /\.(jpe?g|png)$/i.test(p));
  let saved = 0;
  for (const p of imgs) {
    const before = (await stat(p)).size;
    if (before < 120_000) continue; // small files aren't worth re-encoding
    try {
      const img = sharp(p).resize({ width: 1600, withoutEnlargement: true });
      const buf = /\.png$/i.test(p) ? await img.png({ quality: 80, compressionLevel: 9 }).toBuffer() : await img.jpeg({ quality: 78, mozjpeg: true }).toBuffer();
      if (buf.length < before) {
        await writeFile(p, buf);
        saved += before - buf.length;
      }
    } catch {
      /* corrupt or unsupported source image — keep the original */
    }
  }
  return saved;
}

/* --------------------------------- build --------------------------------- */

async function main() {
  // Collect every Google Fonts URL used across the templates first.
  const fontUrls = new Set();
  for (const site of SITES) {
    const src = path.join(SRC_ROOT, site.src);
    if (!existsSync(src)) continue;
    for (const f of await walk(src, (p) => p.endsWith(".html"))) {
      const html = await readFile(f, "utf8");
      for (const [, u] of html.matchAll(/["'](https?:\/\/fonts\.googleapis\.com\/css[^"']+)["']/g)) fontUrls.add(u.replace(/^http:/, "https:"));
    }
  }
  log(`Localizing ${VENDOR.length} CDN assets + ${fontUrls.size} font sets…`);
  const vendorMap = await buildVendor([...fontUrls]);

  // Tier layer: the runtime that makes each tier visibly different inside the site.
  for (const f of ["tier-layer.js", "tier-layer.css"]) {
    await cp(path.join(HERE, "tier-layer", f), path.join(VENDOR_DIR, f));
  }

  for (const site of SITES) {
    const src = path.join(SRC_ROOT, site.src);
    const out = path.join(OUT_ROOT, site.slug);
    if (!existsSync(src)) {
      log(`SKIP ${site.slug} — missing ${site.src}`);
      continue;
    }
    await rm(out, { recursive: true, force: true });
    await cp(src, out, { recursive: true });

    for (const junk of PRUNE) await rm(path.join(out, junk), { recursive: true, force: true });
    // Icon-font formats no modern browser needs — these are the bulk of some templates.
    for (const f of await walk(out, (p) => /\.(eot|svg|ttf)$/i.test(p) && /fonts?[\\/]/i.test(p))) await rm(f, { force: true });

    // Pruning the legacy icon-font formats leaves their url() entries dangling in
    // @font-face src lists, which the browser then 404s on. Drop the dead entries.
    for (const css of await walk(out, (p) => p.endsWith(".css"))) {
      const dir = path.dirname(css);
      let text = await readFile(css, "utf8");
      let touched = false;
      text = text.replace(/src\s*:\s*([^;}]+)[;]?/gi, (decl, list) => {
        if (!/url\(/i.test(list)) return decl;
        const kept = list.split(/,(?![^()]*\))/).filter((part) => {
          const m = part.match(/url\(\s*["']?([^)"']+?)\s*["']?\s*\)/i);
          if (!m || /^(?:https?:)?\/\//.test(m[1]) || m[1].startsWith("data:")) return true;
          return existsSync(path.resolve(dir, m[1].split("?")[0].split("#")[0]));
        });
        if (kept.length === list.split(/,(?![^()]*\))/).length) return decl;
        touched = true;
        return kept.length ? `src:${kept.join(",")};` : "";
      });

      // Background images the template referenced but never shipped: point them at a
      // real picture from the same asset tree so hero sections aren't left blank.
      for (const [frag, ref] of [...text.matchAll(/url\(\s*["']?([^)"']+\.(?:png|jpe?g|gif|webp))\s*["']?\s*\)/gi)].map((m) => [m[0], m[1]])) {
        if (/^(?:https?:)?\/\//.test(ref) || ref.startsWith("data:") || existsSync(path.resolve(dir, ref))) continue;
        const stand = await anyImageNear(path.resolve(dir, ref));
        if (!stand) continue;
        text = text.split(frag).join(`url("${path.relative(dir, stand).replace(/\\/g, "/")}")`);
        touched = true;
      }

      if (touched) await writeFile(css, text);
    }

    const saved = await compressImages(out);

    let pages = 0;
    for (const f of await walk(out, (p) => p.endsWith(".html"))) {
      let html = await readFile(f, "utf8");
      const depth = path.relative(out, path.dirname(f)).split(path.sep).filter(Boolean).length;
      const up = "../".repeat(depth + 1);

      // 1. point CDN references at the local copies
      for (const [url, local] of vendorMap) html = html.split(url).join(up + local);
      // fonts are local now, so preconnect/dns-prefetch hints are dead weight
      html = html.replace(/<link[^>]+rel=["'](?:preconnect|dns-prefetch)["'][^>]*>/gi, "").replace(/<link[^>]+fonts\.gstatic\.com[^>]*>/g, "");

      // 2. drop third-party calls that can't work (or shouldn't) on a demo
      html = html
        .replace(/<script[^>]+(google-analytics|googletagmanager|maps\.googleapis)[^>]*><\/script>/g, "")
        .replace(/<iframe[^>]+(maps\.google|google\.com\/maps)[^>]*>[\s\S]*?<\/iframe>/g, MAP_PLACEHOLDER)
        ;
      // Some templates ship a fully *rendered* Google Map baked into the HTML.
      // Nested divs can't be balanced with a regex, so scan for the matching close.
      html = emptyContainer(html, /<div[^>]*id=["']map(?:_canvas)?["'][^>]*>/i, MAP_PLACEHOLDER);
      html = html
        .replace(/<script[^>]*>[^<]*gtag\([\s\S]*?<\/script>/g, "")
        // template authors' own setup notes / signup prompts — dev chatter, not site content
        .replace(/<!--[^>]*?(startbootstrap|SB Forms|API token|sign up at)[\s\S]*?-->/gi, "")
        .replace(/To activate this form, sign up at\s*(<br\s*\/?>)?\s*<a[^>]*>[^<]*<\/a>/gi, "This is a demo form.");

      // 2b. catch-all: a demo page must not call any third party. Anything still
      // pointing off-host after localization is a maps/forms/analytics leftover.
      html = html
        .replace(/<script[^>]+src=["']https?:\/\/[^"']+["'][^>]*>\s*<\/script>/gi, "")
        .replace(/<link[^>]+href=["']https?:\/\/(?!fonts\.googleapis)[^"']+["'][^>]*>/gi, "")
        // remote images: baked-in map tiles and template-vendor badges
        .replace(/<img[^>]+src=["']https?:\/\/[^"']+["'][^>]*>/gi, "");
      // bare font links the earlier pass missed (http:, or a family not in the collected set)
      for (const [, u] of [...html.matchAll(/["'](https?:\/\/fonts\.googleapis\.com\/css[^"']+)["']/g)]) {
        const local = vendorMap.get(u) ?? vendorMap.get(u.replace(/^http:/, "https:"));
        if (local) html = html.split(u).join(up + local);
        else html = html.replace(new RegExp(`<link[^>]+${u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^>]*>`, "g"), "");
      }

      // 3. identity: title, meta, then the per-template brand strings
      html = html
        .replace(/<title>[\s\S]*?<\/title>/, `<title>${site.title}</title>`)
        .replace(/<meta[^>]+name=["']description["'][^>]*>/gi, `<meta name="description" content="${site.desc}">`)
        .replace(/<meta[^>]+name=["']keywords["'][^>]*>/gi, "")
        .replace(/<meta[^>]+name=["']author["'][^>]*>/gi, "");
      for (const [from, to] of site.replace) html = html.split ? html.replace(from, to) : html;

      // 4. contact details
      html = html
        .replace(/(\+?\d[\d\s().-]{7,}\d)/g, (m) => (/^\s*\d{4}\s*$/.test(m) ? m : site.contact.phone))
        .replace(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g, site.contact.email);

      // 4b. dead-end the template's own social/stock-photo links so a demo visitor
      // can't wander off to a real Twitter page. Vendor credit links stay — licensed.
      html = html.replace(
        /href=["']https?:\/\/(?:www\.)?(twitter|x|facebook|instagram|linkedin|youtube|youtu\.be|vimeo|pinterest|github|dribbble|behance|flaticon|freepik|browsehappy|icomoon|lineicons|ayroui|graygrids|themewagon|tailwindtemplates|ecommercehtml|links\.uideck|docs\.themefisher|maps\.google|google\.com\/maps)[^"']*["']/gi,
        'href="#"'
      );

      // 5. forms are illustrative on a demo — never let one post anywhere
      html = html.replace(/<form([^>]*)>/gi, (m, attrs) =>
        `<form${attrs.replace(/\s(action|method)=["'][^"']*["']/gi, "")} onsubmit="event.preventDefault();this.reset();alert('Demo site — this form is illustrative and does not send anything.')">`);

      // 5b. the maps API is gone, so its local init script now throws on load
      html = html.replace(/<script[^>]+src=["'][^"']*google-?map[^"']*["'][^>]*>\s*<\/script>/gi, "");

      // 6. several templates ship <link>/<img> refs to files they never included.
      // Drop the dead stylesheet/icon tags; swap dead images for a real sibling.
      for (const [tag, ref] of [...html.matchAll(/<(?:link|img|script)[^>]+(?:src|href)=["']([^"':#][^"'#]*\.(?:css|js|png|jpe?g|gif|svg|webp|ico))(?:\?[^"']*)?["'][^>]*>/gi)].map((m) => [m[0], m[1]])) {
        if (/^(?:https?:)?\/\//.test(ref) || existsSync(path.resolve(path.dirname(f), ref))) continue;
        const alt = /\.(png|jpe?g|gif|webp)$/i.test(ref) ? await siblingImage(path.resolve(path.dirname(f), ref)) : null;
        // siblingImage returns a bare filename — keep the ref's own folder, or the
        // substitute silently breaks a path that was only missing its last segment.
        const dir = path.posix.dirname(ref.replace(/\\/g, "/"));
        html = html.split(tag).join(alt ? tag.replace(ref, dir === "." ? alt : `${dir}/${alt}`) : "");
      }

      // 7. inject the tier layer: per-site config + shared runtime, every page.
      const layer = tierLayers[site.slug];
      if (layer) {
        const cfg = JSON.stringify({ brand: site.brand, accent: siteAccent(site.slug), ...layer }).replace(/</g, "\\u003c");
        const inject =
          `<link rel="stylesheet" href="${up}_vendor/tier-layer.css">` +
          `<script>window.__TIER_LAYER=${cfg}</script>` +
          `<script src="${up}_vendor/tier-layer.js" defer></script>`;
        html = html.includes("</body>") ? html.replace(/<\/body>/i, inject + "</body>") : html + inject;
      }

      await writeFile(f, html);
      pages++;
    }

    const size = (await walk(out)).reduce; // size reported below via du-like sum
    const total = (await Promise.all((await walk(out)).map(async (p) => (await stat(p)).size))).reduce((a, b) => a + b, 0);
    log(`✓ ${site.slug.padEnd(24)} ${String(pages).padStart(2)} pages  ${(total / 1e6).toFixed(1)}MB  (saved ${(saved / 1e6).toFixed(1)}MB on images)`);
    void size;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
