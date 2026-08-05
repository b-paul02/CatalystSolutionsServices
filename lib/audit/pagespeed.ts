// Google PageSpeed Insights API — free; PAGESPEED_API_KEY optional (raises quota).
// Returns null on any failure: the report simply omits performance numbers.

export type PageSpeedResult = {
  performanceScore: number; // 0–100
  lcpSeconds: number | null;
  cls: number | null;
  strategy: "mobile";
};

export async function fetchPageSpeed(url: string): Promise<PageSpeedResult | null> {
  try {
    const params = new URLSearchParams({ url, strategy: "mobile", category: "performance" });
    if (process.env.PAGESPEED_API_KEY) params.set("key", process.env.PAGESPEED_API_KEY);
    const res = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`,
      { signal: AbortSignal.timeout(45_000) } // PSI is slow; run in parallel with the analyst fan-out
    );
    if (!res.ok) return null;
    const data = await res.json();
    const lh = data.lighthouseResult;
    const score = lh?.categories?.performance?.score;
    if (typeof score !== "number") return null;
    const lcpMs = lh?.audits?.["largest-contentful-paint"]?.numericValue;
    const cls = lh?.audits?.["cumulative-layout-shift"]?.numericValue;
    return {
      performanceScore: Math.round(score * 100),
      lcpSeconds: typeof lcpMs === "number" ? Math.round(lcpMs / 100) / 10 : null,
      cls: typeof cls === "number" ? Math.round(cls * 100) / 100 : null,
      strategy: "mobile",
    };
  } catch {
    return null;
  }
}
