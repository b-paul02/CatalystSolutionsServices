// Post-build sanity check: every local asset a demo page references must exist,
// and no page may load anything off-host. Run after build-demo-sites.mjs.
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = "public/demo-sites";
const walk = async (d, ext) => (await Promise.all((await readdir(d, { withFileTypes: true })).map(async (e) => {
  const p = path.join(d, e.name);
  return e.isDirectory() ? walk(p, ext) : ext.test(p) ? [p] : [];
}))).flat();

let missing = 0, offhost = 0, checked = 0;

// Backgrounds declared in stylesheets — invisible to an attribute-only scan.
for (const f of await walk(root, /\.css$/)) {
  const css = await readFile(f, "utf8");
  for (const [, ref] of css.matchAll(/url\(\s*["']?([^)"']+\.(?:png|jpe?g|gif|svg|webp|woff2?|ttf|eot))[^)]*\)/gi)) {
    if (/^(?:https?:)?\/\//.test(ref) || ref.startsWith("data:")) continue;
    checked++;
    if (!existsSync(path.resolve(path.dirname(f), ref))) { missing++; console.log("MISSING(css)", path.relative(root, f), "->", ref); }
  }
}

for (const f of await walk(root, /\.html$/)) {
  // comments hold dead template chatter the browser never fetches
  const html = (await readFile(f, "utf8")).replace(/<!--[\s\S]*?-->/g, "");
  for (const [, ref] of html.matchAll(/(?:src|href)=["']([^"'#]+\.(?:css|js|png|jpe?g|gif|svg|webp|woff2?|ico))(?:\?[^"']*)?["']/gi)) {
    if (/^(?:https?:)?\/\//.test(ref) || ref.startsWith("data:")) continue;
    checked++;
    if (!existsSync(path.resolve(path.dirname(f), ref))) { missing++; console.log("MISSING", path.relative(root, f), "->", ref); }
  }
  // inline style="background-image:url(...)"
  for (const [, ref] of html.matchAll(/url\(\s*["']?([^)"']+\.(?:png|jpe?g|gif|svg|webp))[^)]*\)/gi)) {
    if (/^(?:https?:)?\/\//.test(ref) || ref.startsWith("data:")) continue;
    checked++;
    if (!existsSync(path.resolve(path.dirname(f), ref))) { missing++; console.log("MISSING(bg)", path.relative(root, f), "->", ref); }
  }
  for (const [, host] of html.matchAll(/<(?:script|link|img|iframe)[^>]+(?:src|href)=["']https?:\/\/([^/"']+)/gi)) {
    offhost++; console.log("OFF-HOST ASSET", path.relative(root, f), "->", host);
  }
}
console.log(`\n${checked} local refs checked · ${missing} missing · ${offhost} off-host asset loads`);
process.exit(missing || offhost ? 1 : 0);
