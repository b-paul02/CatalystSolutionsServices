// Channel adapter CONTRACT tests: fetch is replaced by fixtures shaped like the providers' documented
// responses. This proves the requests we would send and how we classify answers — it is NOT live
// verification. Every provider stays "Externally blocked" until a real account round-trip is done.
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdapterError, adapterFor, ga4CampaignReport, type PublishInput } from "@/lib/os/adapters";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
const calls: Call[] = [];
function mockFetch(responder: (c: Call, n: number) => { status?: number; json?: unknown; headers?: Record<string, string> } | "network") {
  calls.length = 0;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const raw = init.body;
    const c: Call = { url: String(url), method: init.method ?? "GET", headers: Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>)), body: typeof raw === "string" ? JSON.parse(raw) : raw };
    calls.push(c);
    const r = responder(c, calls.length);
    if (r === "network") throw new TypeError("fetch failed");
    return new Response(r.json === undefined ? null : JSON.stringify(r.json), { status: r.status ?? 200, headers: r.headers });
  });
}
afterEach(() => vi.unstubAllGlobals());

const input = (over: Partial<PublishInput> = {}): PublishInput => ({ token: "tok", account: { externalAccountId: "acct", accountType: "user", config: {} }, format: "post", title: null, text: "Hello world", parts: [], media: [], donePartIds: [], ...over });
const image = { kind: "image", mime: "image/png", sizeBytes: 4, publicUrl: "https://cdn.example.com/a.png", bytes: async () => Buffer.from("abcd") };
const video = { kind: "video", mime: "video/mp4", sizeBytes: 4, publicUrl: "https://cdn.example.com/a.mp4", bytes: async () => Buffer.from("abcd") };

describe("X", () => {
  it("posts a thread as a reply chain and returns every part id", async () => {
    mockFetch((_c, n) => ({ status: 201, json: { data: { id: `t${n}` } } }));
    const r = await adapterFor("x", "x")!.publish(input({ format: "thread", parts: ["one", "two", "three"], account: { externalAccountId: "1", accountType: "user", config: { username: "acme" } } }));
    expect(calls.map((c) => c.url)).toEqual(Array(3).fill("https://api.x.com/2/tweets"));
    expect(calls[0].headers.Authorization).toBe("Bearer tok");
    expect(calls.map((c) => c.body)).toEqual([{ text: "one" }, { text: "two", reply: { in_reply_to_tweet_id: "t1" } }, { text: "three", reply: { in_reply_to_tweet_id: "t2" } }]);
    expect(r).toEqual({ externalId: "t1", externalUrl: "https://x.com/acme/status/t1", partIds: ["t1", "t2", "t3"] });
  });
  it("a failure mid-thread reports the parts already live, and a resume never re-posts them", async () => {
    mockFetch((_c, n) => (n === 2 ? { status: 403 } : { status: 201, json: { data: { id: `t${n}` } } }));
    const err = (await adapterFor("x", "x")!.publish(input({ format: "thread", parts: ["one", "two", "three"] })).catch((e) => e)) as AdapterError;
    expect([err.kind, err.httpStatus, err.partIds]).toEqual(["definite", 403, ["t1"]]);
    mockFetch((_c, n) => ({ status: 201, json: { data: { id: `r${n}` } } }));
    const r = await adapterFor("x", "x")!.publish(input({ format: "thread", parts: ["one", "two", "three"], donePartIds: ["t1"] }));
    expect(calls).toHaveLength(2);
    expect((calls[0].body as { reply: unknown }).reply).toEqual({ in_reply_to_tweet_id: "t1" });
    expect(r.partIds).toEqual(["t1", "r1", "r2"]);
  });
  it("classifies answers: 429/503 retryable, other 5xx and network drops uncertain, 4xx definite", async () => {
    for (const [status, kind] of [[429, "retryable"], [503, "retryable"], [500, "uncertain"], [400, "definite"], [401, "definite"]] as const) {
      mockFetch(() => ({ status }));
      expect(((await adapterFor("x", "x")!.publish(input()).catch((e) => e)) as AdapterError).kind).toBe(kind);
    }
    mockFetch(() => "network");
    const e = (await adapterFor("x", "x")!.publish(input()).catch((x) => x)) as AdapterError;
    expect(e.kind).toBe("uncertain");
    expect(e.message).not.toContain("tok"); // tokens never leak into errors
  });
  it("reads public metrics as lifetime totals", async () => {
    mockFetch(() => ({ json: { data: { public_metrics: { impression_count: 900, like_count: 12, reply_count: 3, retweet_count: 4, quote_count: 1, bookmark_count: 2 } } } }));
    const rows = await adapterFor("x", "x")!.metrics!("tok", "123");
    expect(calls[0].url).toBe("https://api.x.com/2/tweets/123?tweet.fields=public_metrics");
    expect(rows).toContainEqual({ metric: "impressions", kind: "lifetime", value: 900 });
    expect(rows.every((r) => r.kind === "lifetime")).toBe(true);
  });
});

describe("LinkedIn (member and company page share one Posts API)", () => {
  it("creates a versioned post for the chosen author and reads the id from x-restli-id", async () => {
    mockFetch(() => ({ status: 201, headers: { "x-restli-id": "urn:li:share:77" } }));
    const r = await adapterFor("linkedin", "linkedin")!.publish(input({ account: { externalAccountId: "urn:li:organization:5515715", accountType: "organization", config: {} } }));
    expect(calls[0].url).toBe("https://api.linkedin.com/rest/posts");
    expect(calls[0].headers["LinkedIn-Version"]).toMatch(/^\d{6}$/);
    expect(calls[0].headers["X-Restli-Protocol-Version"]).toBe("2.0.0");
    expect(calls[0].body).toMatchObject({ author: "urn:li:organization:5515715", commentary: "Hello world", visibility: "PUBLIC", lifecycleState: "PUBLISHED", distribution: { feedDistribution: "MAIN_FEED" } });
    expect(r.externalId).toBe("urn:li:share:77");
  });
  it("uploads an image first; a failed upload is safe to retry because nothing was posted", async () => {
    mockFetch((c) => (c.url.includes("initializeUpload") ? { json: { value: { uploadUrl: "https://www.linkedin.com/dms-uploads/x", image: "urn:li:image:abc" } } } : c.method === "PUT" ? { status: 201 } : { status: 201, headers: { "x-restli-id": "urn:li:share:78" } }));
    await adapterFor("linkedin", "linkedin")!.publish(input({ account: { externalAccountId: "urn:li:person:p1", accountType: "member", config: {} }, media: [image] }));
    expect(calls.map((c) => c.method)).toEqual(["POST", "PUT", "POST"]);
    expect(calls[0].body).toEqual({ initializeUploadRequest: { owner: "urn:li:person:p1" } });
    expect((calls[2].body as { content: unknown }).content).toEqual({ media: { id: "urn:li:image:abc" } });
    mockFetch((c) => (c.url.includes("initializeUpload") ? "network" : { status: 201 }));
    expect(((await adapterFor("linkedin", "linkedin")!.publish(input({ account: { externalAccountId: "urn:li:person:p1", accountType: "member", config: {} }, media: [image] })).catch((e) => e)) as AdapterError).kind).toBe("retryable");
  });
  it("an accepted post without an id is uncertain, never success", async () => {
    mockFetch(() => ({ status: 201 }));
    expect(((await adapterFor("linkedin", "linkedin")!.publish(input({ account: { externalAccountId: "urn:li:person:p1", accountType: "member", config: {} } })).catch((e) => e)) as AdapterError).kind).toBe("uncertain");
  });
});

describe("Meta", () => {
  it("Facebook Page: text to /feed, image to /photos by public address", async () => {
    mockFetch(() => ({ json: { id: "PAGE_1" } }));
    await adapterFor("meta", "facebook")!.publish(input({ account: { externalAccountId: "PAGE", accountType: "page", config: {} } }));
    expect(calls[0].url).toMatch(/^https:\/\/graph\.facebook\.com\/v\d+\.\d\/PAGE\/feed$/);
    expect(calls[0].body).toEqual({ message: "Hello world" });
    mockFetch(() => ({ json: { id: "PH", post_id: "PAGE_2" } }));
    const r = await adapterFor("meta", "facebook")!.publish(input({ account: { externalAccountId: "PAGE", accountType: "page", config: {} }, media: [image] }));
    expect(calls[0].url).toContain("/PAGE/photos");
    expect(calls[0].body).toEqual({ url: image.publicUrl, caption: "Hello world" });
    expect(r.externalId).toBe("PAGE_2");
  });
  it("Instagram carousel: child containers → carousel container → status → publish", async () => {
    let id = 0;
    mockFetch((c) => (c.url.endsWith("/media") ? { json: { id: `c${++id}` } } : c.url.includes("status_code") ? { json: { status_code: "FINISHED" } } : c.url.endsWith("/media_publish") ? { json: { id: "IG_POST" } } : { json: { permalink: "https://www.instagram.com/p/abc/" } }));
    const r = await adapterFor("meta", "instagram")!.publish(input({ format: "carousel", account: { externalAccountId: "IGID", accountType: "ig_business", config: {} }, media: [image, image] }));
    expect(calls.slice(0, 3).map((c) => c.body)).toEqual([{ image_url: image.publicUrl, is_carousel_item: true }, { image_url: image.publicUrl, is_carousel_item: true }, { media_type: "CAROUSEL", children: "c1,c2", caption: "Hello world" }]);
    expect(calls.find((c) => c.url.endsWith("/media_publish"))!.body).toEqual({ creation_id: "c3" });
    expect(r).toMatchObject({ externalId: "IG_POST", externalUrl: "https://www.instagram.com/p/abc/" });
  });
  it("Instagram Reel uses REELS; media without a public address is refused before any call", async () => {
    mockFetch((c) => (c.url.endsWith("/media") ? { json: { id: "c1" } } : c.url.includes("status_code") ? { json: { status_code: "FINISHED" } } : { json: { id: "IG_REEL" } }));
    await adapterFor("meta", "instagram")!.publish(input({ format: "reel", account: { externalAccountId: "IGID", accountType: "ig_business", config: {} }, media: [video] }));
    expect(calls[0].body).toEqual({ video_url: video.publicUrl, media_type: "REELS", caption: "Hello world" });
    mockFetch(() => ({ json: {} }));
    const e = (await adapterFor("meta", "instagram")!.publish(input({ account: { externalAccountId: "IGID", accountType: "ig_business", config: {} }, media: [{ ...image, publicUrl: null }] })).catch((x) => x)) as AdapterError;
    expect([e.kind, calls.length]).toEqual(["definite", 0]);
    expect(e.message).toContain("public https app address"); // assets stay private: providers get a signed, expiring link or nothing
  });
});

describe("YouTube", () => {
  it("opens a resumable session then sends the bytes; a Short gets the Shorts link; no file = no upload", async () => {
    mockFetch((c) => (c.url.includes("uploadType=resumable") ? { headers: { location: "https://www.googleapis.com/upload/session/1" } } : { status: 201, json: { id: "VID123" } }));
    const r = await adapterFor("youtube", "youtube")!.publish(input({ format: "short", title: "Tip in 30s", text: "Description", account: { externalAccountId: "UC1", accountType: "channel", config: { privacyStatus: "private" } }, media: [video] }));
    expect(calls[0].url).toBe("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status");
    expect(calls[0].headers["X-Upload-Content-Type"]).toBe("video/mp4");
    expect(calls[0].body).toMatchObject({ snippet: { title: "Tip in 30s", description: "Description" }, status: { privacyStatus: "private" } });
    expect([calls[1].method, calls[1].url]).toEqual(["PUT", "https://www.googleapis.com/upload/session/1"]);
    expect(r.externalUrl).toBe("https://www.youtube.com/shorts/VID123");
    mockFetch(() => ({ json: {} }));
    const e = (await adapterFor("youtube", "youtube")!.publish(input({ format: "long_video", title: "T", text: "Full script…" })).catch((x) => x)) as AdapterError;
    expect([e.kind, calls.length]).toEqual(["definite", 0]);
    expect(e.message).toContain("script is not a video");
  });
  it("statistics are lifetime; watch time is daily; a missing analytics scope means absent, not zero", async () => {
    mockFetch((c) => (c.url.includes("youtubeanalytics") ? { status: 403 } : { json: { items: [{ statistics: { viewCount: "321", likeCount: "9", commentCount: "2" } }] } }));
    const rows = await adapterFor("youtube", "youtube")!.metrics!("tok", "VID123");
    expect(rows).toEqual([{ metric: "views", kind: "lifetime", value: 321 }, { metric: "likes", kind: "lifetime", value: 9 }, { metric: "comments", kind: "lifetime", value: 2 }]);
    mockFetch((c) => (c.url.includes("youtubeanalytics") ? { json: { rows: [["2026-09-01", 40, 95.5, 143]] } } : { json: { items: [{ statistics: {} }] } }));
    expect(await adapterFor("youtube", "youtube")!.metrics!("tok", "VID123")).toEqual([{ metric: "watch_time_minutes", kind: "daily", value: 95.5, day: "2026-09-01" }]);
  });
});

describe("WordPress and GA4", () => {
  it("WordPress publishes through the REST API with the stored credential", async () => {
    mockFetch(() => ({ status: 201, json: { id: 42, link: "https://blog.example.com/why-a-consult/" } }));
    const r = await adapterFor("wordpress", "blog")!.publish(input({ format: "article", title: "Why a consult", text: "<p>Body</p>", token: "dXNlcjpwYXNz", account: { externalAccountId: "https://blog.example.com", accountType: "site", config: { site: "https://blog.example.com/" } } }));
    expect(calls[0].url).toBe("https://blog.example.com/wp-json/wp/v2/posts");
    expect(calls[0].headers.Authorization).toBe("Basic dXNlcjpwYXNz");
    expect(calls[0].body).toEqual({ title: "Why a consult", content: "<p>Body</p>", status: "publish" });
    expect(r).toEqual({ externalId: "42", externalUrl: "https://blog.example.com/why-a-consult/", partIds: ["42"] });
  });
  it("GA4 reports sessions per campaign per day — website traffic, never search clicks", async () => {
    mockFetch(() => ({ json: { rows: [{ dimensionValues: [{ value: "20260901" }, { value: "spring-consult-drive" }, { value: "social" }], metricValues: [{ value: "31" }, { value: "4" }] }] } }));
    const rows = await ga4CampaignReport("tok", "123456");
    expect(calls[0].url).toBe("https://analyticsdata.googleapis.com/v1beta/properties/123456:runReport");
    expect((calls[0].body as { metrics: { name: string }[] }).metrics.map((m) => m.name)).toEqual(["sessions", "keyEvents"]);
    expect(rows).toEqual([{ day: "2026-09-01", campaign: "spring-consult-drive", medium: "social", sessions: 31, keyEvents: 4 }]);
  });
});
