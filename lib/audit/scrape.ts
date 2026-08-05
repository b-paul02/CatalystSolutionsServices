// Site scraper for Stage 0. Homepage + up to 4 key pages, robots.txt respected,
// 10s timeout per fetch, graceful failure (returns whatever it got).

export type ScrapedPage = { path: string; title: string; text: string };
export type ScrapeResult = {
  ok: boolean;
  url: string;
  pages: ScrapedPage[];
  signals: {
    hasAnalytics: boolean;
    hasBlog: boolean;
    hasBooking: boolean;
    hasEcommerce: boolean;
    hasSchema: boolean;
    hasMetaDescription: boolean;
    https: boolean;
    formCount: number;
    maxFormFields: number;
    homepageWordCount: number;
  };
  error?: string;
};

const UA = "CatalystGrowthAudit/1.0 (+https://catalystsolutionservices.com/growth-audit)";

async function get(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "text/html,*/*" },
    signal: AbortSignal.timeout(10_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return await res.text();
}

// ponytail: minimal robots.txt parse — Disallow rules under "User-agent: *" only.
function parseRobots(txt: string): string[] {
  const disallow: string[] = [];
  let applies = false;
  for (const raw of txt.split("\n")) {
    const line = raw.replace(/#.*/, "").trim();
    const [k, ...rest] = line.split(":");
    const v = rest.join(":").trim();
    if (/^user-agent$/i.test(k)) applies = v === "*";
    else if (applies && /^disallow$/i.test(k) && v) disallow.push(v);
  }
  return disallow;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(nbsp|#160);/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
}

export async function scrapeSite(inputUrl: string): Promise<ScrapeResult> {
  const url = inputUrl.match(/^https?:\/\//) ? inputUrl : `https://${inputUrl}`;
  const origin = new URL(url).origin;
  const result: ScrapeResult = {
    ok: false,
    url,
    pages: [],
    signals: {
      hasAnalytics: false, hasBlog: false, hasBooking: false, hasEcommerce: false,
      hasSchema: false, hasMetaDescription: false, https: url.startsWith("https"),
      formCount: 0, maxFormFields: 0, homepageWordCount: 0,
    },
  };

  let disallow: string[] = [];
  try {
    disallow = parseRobots(await get(`${origin}/robots.txt`));
  } catch {} // no robots.txt = everything allowed

  const allowed = (path: string) => !disallow.some((d) => path.startsWith(d));

  let homeHtml: string;
  try {
    homeHtml = await get(url);
  } catch (e) {
    result.error = `Could not fetch ${url}: ${(e as Error).message}`;
    return result;
  }
  result.ok = true;

  const title = (homeHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  result.pages.push({ path: "/", title, text: htmlToText(homeHtml) });

  // signals from raw homepage HTML
  result.signals.hasAnalytics = /gtag\(|googletagmanager|google-analytics|fbq\(|clarity\(|plausible|hotjar/i.test(homeHtml);
  result.signals.hasBooking = /calendly|cal\.com|acuity|book(ing)?[\s-]?(a[\s-]?)?(call|demo|appointment)/i.test(homeHtml);
  result.signals.hasEcommerce = /shopify|woocommerce|add[\s-]?to[\s-]?cart|\/cart\b/i.test(homeHtml);
  result.signals.hasBlog = /href="[^"]*\/(blog|news|articles|insights)\b/i.test(homeHtml);
  result.signals.hasSchema = /application\/ld\+json/i.test(homeHtml);
  result.signals.hasMetaDescription = /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}/i.test(homeHtml);
  result.signals.homepageWordCount = result.pages[0].text.split(/\s+/).length;
  const forms = homeHtml.match(/<form[\s\S]*?<\/form>/gi) ?? [];
  result.signals.formCount = forms.length;
  result.signals.maxFormFields = Math.max(0, ...forms.map((f) => (f.match(/<(input|textarea|select)\b(?![^>]*type=["'](hidden|submit|button))/gi) ?? []).length));

  // key internal pages
  const hrefs = [...homeHtml.matchAll(/href="([^"#?]+)"/gi)].map((m) => m[1]);
  const wanted = /about|service|product|pricing|price|plans|contact|blog/i;
  const paths = new Set<string>();
  for (const h of hrefs) {
    try {
      const u = new URL(h, origin);
      if (u.origin === origin && wanted.test(u.pathname) && u.pathname !== "/") paths.add(u.pathname);
    } catch {}
  }
  for (const path of [...paths].slice(0, 4)) {
    if (!allowed(path)) continue;
    try {
      const html = await get(origin + path);
      result.pages.push({
        path,
        title: (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim(),
        text: htmlToText(html),
      });
      if (/gtag\(|googletagmanager/i.test(html)) result.signals.hasAnalytics = true;
    } catch {} // skip failing pages
  }
  return result;
}
