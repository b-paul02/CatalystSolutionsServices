// Site scraper for Stage 0 + the automated check battery. Homepage + up to 4 key pages,
// robots.txt respected, 10s timeout per fetch, graceful failure (returns whatever it got).

export type ScrapedPage = {
  path: string;
  title: string;
  text: string;
  hasMetaDescription: boolean;
  h1Count: number;
};

export type ScrapeResult = {
  ok: boolean;
  url: string;
  checkedAt: string; // ISO date of the scan
  pages: ScrapedPage[];
  signals: {
    // presence
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
    // technical foundations
    hasRobotsTxt: boolean;
    hasSitemap: boolean;
    hasCanonical: boolean;
    hasOgTags: boolean;
    hasFavicon: boolean;
    hasViewport: boolean;
    titleLength: number;
    metaDescriptionLength: number;
    homepageH1Count: number;
    imagesMissingAlt: number; // homepage sample
    imageCount: number;
    mixedContent: boolean;
    // response headers (homepage)
    hstsHeader: boolean;
    noSniffHeader: boolean;
    // cross-page
    duplicateTitles: number; // pages sharing an identical title
    pagesMissingMetaDescription: number;
    brokenLinks: string[]; // sampled internal links returning >=400
  };
  error?: string;
};

const UA = "CatalystGrowthAudit/1.0 (+https://catalystsolutionservices.com/growth-audit)";

async function get(url: string): Promise<{ html: string; headers: Headers }> {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "text/html,*/*" },
    signal: AbortSignal.timeout(10_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return { html: await res.text(), headers: res.headers };
}

// ponytail: minimal robots.txt parse — Disallow rules under "User-agent: *" only.
function parseRobots(txt: string): { disallow: string[]; sitemaps: string[] } {
  const disallow: string[] = [];
  const sitemaps: string[] = [];
  let applies = false;
  for (const raw of txt.split("\n")) {
    const line = raw.replace(/#.*/, "").trim();
    const [k, ...rest] = line.split(":");
    const v = rest.join(":").trim();
    if (/^user-agent$/i.test(k)) applies = v === "*";
    else if (applies && /^disallow$/i.test(k) && v) disallow.push(v);
    else if (/^sitemap$/i.test(k) && v) sitemaps.push(v);
  }
  return { disallow, sitemaps };
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

function pageFacts(html: string, path: string): ScrapedPage {
  return {
    path,
    title: (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim(),
    text: htmlToText(html),
    hasMetaDescription: /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}/i.test(html),
    h1Count: (html.match(/<h1[\s>]/gi) ?? []).length,
  };
}

export async function scrapeSite(inputUrl: string): Promise<ScrapeResult> {
  const url = inputUrl.match(/^https?:\/\//) ? inputUrl : `https://${inputUrl}`;
  const origin = new URL(url).origin;
  const result: ScrapeResult = {
    ok: false,
    url,
    checkedAt: new Date().toISOString().slice(0, 10),
    pages: [],
    signals: {
      hasAnalytics: false, hasBlog: false, hasBooking: false, hasEcommerce: false,
      hasSchema: false, hasMetaDescription: false, https: url.startsWith("https"),
      formCount: 0, maxFormFields: 0, homepageWordCount: 0,
      hasRobotsTxt: false, hasSitemap: false, hasCanonical: false, hasOgTags: false,
      hasFavicon: false, hasViewport: false, titleLength: 0, metaDescriptionLength: 0,
      homepageH1Count: 0, imagesMissingAlt: 0, imageCount: 0, mixedContent: false,
      hstsHeader: false, noSniffHeader: false,
      duplicateTitles: 0, pagesMissingMetaDescription: 0, brokenLinks: [],
    },
  };
  const s = result.signals;

  let disallow: string[] = [];
  let robotsSitemaps: string[] = [];
  try {
    const robots = parseRobots((await get(`${origin}/robots.txt`)).html);
    disallow = robots.disallow;
    robotsSitemaps = robots.sitemaps;
    s.hasRobotsTxt = true;
  } catch {} // no robots.txt = everything allowed

  const allowed = (path: string) => !disallow.some((d) => path.startsWith(d));

  let homeHtml: string;
  try {
    const home = await get(url);
    homeHtml = home.html;
    s.hstsHeader = home.headers.has("strict-transport-security");
    s.noSniffHeader = (home.headers.get("x-content-type-options") ?? "").toLowerCase().includes("nosniff");
  } catch (e) {
    result.error = `Could not fetch ${url}: ${(e as Error).message}`;
    return result;
  }
  result.ok = true;

  result.pages.push(pageFacts(homeHtml, "/"));
  const homePage = result.pages[0];

  // homepage signals
  s.hasAnalytics = /gtag\(|googletagmanager|google-analytics|fbq\(|clarity\(|plausible|hotjar/i.test(homeHtml);
  s.hasBooking = /calendly|cal\.com|acuity|book(ing)?[\s-]?(a[\s-]?)?(call|demo|appointment)/i.test(homeHtml);
  s.hasEcommerce = /shopify|woocommerce|add[\s-]?to[\s-]?cart|\/cart\b/i.test(homeHtml);
  s.hasBlog = /href="[^"]*\/(blog|news|articles|insights)\b/i.test(homeHtml);
  s.hasSchema = /application\/ld\+json/i.test(homeHtml);
  s.hasMetaDescription = homePage.hasMetaDescription;
  s.metaDescriptionLength = (homeHtml.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1] ?? "").length;
  s.homepageWordCount = homePage.text.split(/\s+/).length;
  s.titleLength = homePage.title.length;
  s.homepageH1Count = homePage.h1Count;
  s.hasCanonical = /<link[^>]+rel=["']canonical["']/i.test(homeHtml);
  s.hasOgTags = /<meta[^>]+property=["']og:(title|image)["']/i.test(homeHtml);
  s.hasFavicon = /<link[^>]+rel=["'][^"']*icon[^"']*["']/i.test(homeHtml);
  s.hasViewport = /<meta[^>]+name=["']viewport["']/i.test(homeHtml);
  const imgs = homeHtml.match(/<img\b[^>]*>/gi) ?? [];
  s.imageCount = imgs.length;
  s.imagesMissingAlt = imgs.filter((i) => !/\balt=["'][^"']+["']/i.test(i)).length;
  s.mixedContent = s.https && /(?:src|href)=["']http:\/\//i.test(homeHtml);
  const forms = homeHtml.match(/<form[\s\S]*?<\/form>/gi) ?? [];
  s.formCount = forms.length;
  s.maxFormFields = Math.max(0, ...forms.map((f) => (f.match(/<(input|textarea|select)\b(?![^>]*type=["'](hidden|submit|button))/gi) ?? []).length));

  // sitemap: robots declaration or conventional path
  if (robotsSitemaps.length) s.hasSitemap = true;
  else {
    try {
      const res = await fetch(`${origin}/sitemap.xml`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(10_000) });
      s.hasSitemap = res.ok;
    } catch {}
  }

  // key internal pages
  const hrefs = [...homeHtml.matchAll(/href="([^"#?]+)"/gi)].map((m) => m[1]);
  const wanted = /about|service|product|pricing|price|plans|contact|blog|course/i;
  const paths = new Set<string>();
  const allInternal = new Set<string>();
  for (const h of hrefs) {
    try {
      const u = new URL(h, origin);
      if (u.origin !== origin) continue;
      allInternal.add(u.pathname);
      if (wanted.test(u.pathname) && u.pathname !== "/") paths.add(u.pathname);
    } catch {}
  }
  for (const path of [...paths].slice(0, 4)) {
    if (!allowed(path)) continue;
    try {
      const { html } = await get(origin + path);
      result.pages.push(pageFacts(html, path));
      if (/gtag\(|googletagmanager/i.test(html)) s.hasAnalytics = true;
    } catch {} // skip failing pages
  }

  // cross-page facts
  const titles = result.pages.map((p) => p.title.toLowerCase()).filter(Boolean);
  s.duplicateTitles = titles.length - new Set(titles).size;
  s.pagesMissingMetaDescription = result.pages.filter((p) => !p.hasMetaDescription).length;

  // broken-link sample: 5 internal links not already scraped
  const sample = [...allInternal].filter((p) => p !== "/" && !paths.has(p) && allowed(p)).slice(0, 5);
  await Promise.all(sample.map(async (p) => {
    try {
      const res = await fetch(origin + p, { method: "HEAD", headers: { "user-agent": UA }, signal: AbortSignal.timeout(8_000), redirect: "follow" });
      if (res.status >= 400) s.brokenLinks.push(p);
    } catch {} // network failures aren't proof of a broken link — skip
  }));

  return result;
}
