// CONTRACT tests for the adapters added in the completion build: fixtures shaped like the providers' documented
// responses (docs checked 2026-09-21). Proves the requests we would send — it is NOT live verification.
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdapterError, adapterFor, type PublishInput } from "@/lib/os/adapters";
import { mediaLink, verifyMediaLink } from "@/lib/os/storage";
import { liveMediaRefs, mergeMediaRefs } from "@/lib/os/publishing";

process.env.LINKEDIN_POLL_MS = "1";

type Call = { url: string; method: string; body: unknown };
const calls: Call[] = [];
function mockFetch(responder: (c: Call, n: number) => { status?: number; json?: unknown }) {
  calls.length = 0;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const c: Call = { url: String(url), method: init.method ?? "GET", body: typeof init.body === "string" ? JSON.parse(init.body) : init.body };
    calls.push(c);
    const r = responder(c, calls.length);
    return new Response(r.json === undefined ? null : JSON.stringify(r.json), { status: r.status ?? 200 });
  });
}
afterEach(() => { vi.unstubAllGlobals(); delete process.env.MEDIA_PUBLIC_ORIGIN; });
const input = (over: Partial<PublishInput> = {}): PublishInput => ({ token: "tok", account: { externalAccountId: "1", accountType: "user", config: { username: "acme" } }, format: "post", title: null, text: "Hello", parts: [], media: [], donePartIds: [], ...over });
const image = { kind: "image", mime: "image/png", sizeBytes: 4, publicUrl: null, bytes: async () => Buffer.from("abcd") };

describe("X media", () => {
  it("uploads (initialize → append → finalize) before posting, then attaches the media id to the post", async () => {
    mockFetch((c) => (c.url.endsWith("/initialize") ? { json: { data: { id: "m1" } } } : c.url.endsWith("/2/tweets") ? { status: 201, json: { data: { id: "t1" } } } : { json: { data: {} } }));
    const r = await adapterFor("x", "x")!.publish(input({ media: [image] }));
    expect(calls.map((c) => c.url.replace("https://api.x.com/2/", ""))).toEqual(["media/upload/initialize", "media/upload/m1/append", "media/upload/m1/finalize", "tweets"]);
    expect(calls[0].body).toEqual({ media_type: "image/png", total_bytes: 4, media_category: "tweet_image" });
    expect(calls[3].body).toEqual({ text: "Hello", media: { media_ids: ["m1"] } });
    expect(r.externalId).toBe("t1");
  });
  it("an upload failure is safe to retry: nothing was posted", async () => {
    mockFetch((c) => (c.url.endsWith("/initialize") ? { status: 500 } : { json: {} }));
    const e = (await adapterFor("x", "x")!.publish(input({ media: [image] })).catch((x) => x)) as AdapterError;
    expect([e.kind, calls.some((c) => c.url.endsWith("/2/tweets"))]).toEqual(["retryable", false]);
  });
});

describe("X thread with media, LinkedIn multi-image / document / video", () => {
  it("X thread: media is uploaded once and rides on the FIRST post only; a resumed thread does not upload again", async () => {
    mockFetch((c, n) => (c.url.endsWith("/initialize") ? { json: { data: { id: "m1" } } } : c.url.endsWith("/2/tweets") ? { status: 201, json: { data: { id: `t${n}` } } } : { json: { data: {} } }));
    await adapterFor("x", "x")!.publish(input({ format: "thread", parts: ["one", "two"], media: [image] }));
    const posts = calls.filter((c) => c.url.endsWith("/2/tweets")).map((c) => c.body as { media?: unknown });
    expect([Boolean(posts[0].media), Boolean(posts[1].media)]).toEqual([true, false]);
    calls.length = 0;
    await adapterFor("x", "x")!.publish(input({ format: "thread", parts: ["one", "two"], media: [image], donePartIds: ["t-already"] }));
    expect(calls.some((c) => c.url.includes("/media/upload"))).toBe(false);
  });

  const li = { externalAccountId: "urn:li:organization:1", accountType: "organization", config: {} };
  const ok201 = (id: string) => new Response(null, { status: 201, headers: { "x-restli-id": id } });
  function mockLinkedIn(extra: (url: string, init: RequestInit) => Response | undefined) {
    calls.length = 0;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
      calls.push({ url: String(url), method: init.method ?? "GET", body: typeof init.body === "string" ? JSON.parse(init.body) : init.body });
      return extra(String(url), init) ?? (String(url).endsWith("/rest/posts") ? ok201("urn:li:share:9") : new Response(null, { status: 201 }));
    });
  }

  it("multi-image: each image registered + uploaded, then ONE post with content.multiImage (2–20 images enforced)", async () => {
    let n = 0;
    mockLinkedIn((url) => (url.includes("images?action=initializeUpload") ? Response.json({ value: { uploadUrl: `https://www.linkedin.com/dms-uploads/i${++n}`, image: `urn:li:image:${n}` } }) : undefined));
    const r = await adapterFor("linkedin", "linkedin")!.publish(input({ format: "multi_image", account: li, media: [image, image, image] }));
    expect(r.externalId).toBe("urn:li:share:9");
    expect((calls.at(-1)!.body as { content: unknown }).content).toEqual({ multiImage: { images: [{ id: "urn:li:image:1" }, { id: "urn:li:image:2" }, { id: "urn:li:image:3" }] } });
    const e = (await adapterFor("linkedin", "linkedin")!.publish(input({ format: "multi_image", account: li, media: [image] })).catch((x) => x)) as AdapterError;
    expect(e.kind).toBe("definite");
  });

  it("document: register → PUT → wait AVAILABLE → post with title; a wrong file type never reaches LinkedIn", async () => {
    const pdf = { kind: "document", mime: "application/pdf", sizeBytes: 9, publicUrl: null, bytes: async () => Buffer.from("%PDF-1.7 ") };
    mockLinkedIn((url) => (url.includes("documents?action=initializeUpload") ? Response.json({ value: { uploadUrl: "https://www.linkedin.com/dms-uploads/d1", document: "urn:li:document:D1" } }) : url.includes("/rest/documents/") ? Response.json({ status: "AVAILABLE" }) : undefined));
    await adapterFor("linkedin", "linkedin")!.publish(input({ format: "document", title: "Five signs you need a check-up", account: li, media: [pdf] }));
    expect(calls.map((c) => `${c.method} ${c.url.replace("https://api.linkedin.com/rest/", "").replace("https://www.linkedin.com/", "")}`)).toEqual(["POST documents?action=initializeUpload", "PUT dms-uploads/d1", "GET documents/urn%3Ali%3Adocument%3AD1", "POST posts"]);
    expect((calls.at(-1)!.body as { content: unknown }).content).toEqual({ media: { title: "Five signs you need a check-up", id: "urn:li:document:D1" } });
    calls.length = 0;
    const e = (await adapterFor("linkedin", "linkedin")!.publish(input({ format: "document", account: li, media: [{ ...pdf, mime: "text/plain" }] })).catch((x) => x)) as AdapterError;
    expect([e.kind, calls.length]).toEqual(["definite", 0]);
  });

  it("video: multipart upload collects each part's ETag, finalises with them in order, waits, then posts; still-processing is retryable and posts nothing", async () => {
    const mp4 = { kind: "video", mime: "video/mp4", sizeBytes: 100_000, publicUrl: null, bytes: async () => Buffer.alloc(100_000, 1) };
    const instructions = [{ uploadUrl: "https://www.linkedin.com/dms-uploads/v/p1", firstByte: 0, lastByte: 59_999 }, { uploadUrl: "https://www.linkedin.com/dms-uploads/v/p2", firstByte: 60_000, lastByte: 99_999 }];
    let status = "AVAILABLE";
    mockLinkedIn((url) => (url.includes("videos?action=initializeUpload") ? Response.json({ value: { video: "urn:li:video:V1", uploadToken: "tok", uploadInstructions: instructions } })
      : url.includes("/dms-uploads/v/") ? new Response(null, { status: 200, headers: { etag: `"etag-${url.slice(-2)}"` } })
      : url.includes("action=finalizeUpload") ? new Response(null, { status: 200 })
      : url.includes("/rest/videos/") ? Response.json({ status }) : undefined));
    await adapterFor("linkedin", "linkedin")!.publish(input({ format: "video", title: "Clinic tour", account: li, media: [mp4] }));
    const parts = calls.filter((c) => c.url.includes("/dms-uploads/v/")).map((c) => (c.body as Uint8Array).length);
    expect(parts).toEqual([60_000, 40_000]);
    expect(calls.find((c) => c.url.includes("finalizeUpload"))!.body).toEqual({ finalizeUploadRequest: { video: "urn:li:video:V1", uploadToken: "tok", uploadedPartIds: ["etag-p1", "etag-p2"] } });
    expect((calls.at(-1)!.body as { content: unknown }).content).toEqual({ media: { title: "Clinic tour", id: "urn:li:video:V1" } });
    status = "PROCESSING_FAILED";
    calls.length = 0;
    const e = (await adapterFor("linkedin", "linkedin")!.publish(input({ format: "video", account: li, media: [mp4] })).catch((x) => x)) as AdapterError;
    expect([e.kind, calls.some((c) => c.url.endsWith("/rest/posts"))]).toEqual(["definite", false]);
  });
});

describe("retries keep the ORIGINAL upload (no second upload, no duplicate post)", () => {
  const li = { externalAccountId: "urn:li:organization:1", accountType: "organization", config: {} };
  const pdf = { kind: "document", mime: "application/pdf", sizeBytes: 9, publicUrl: null, bytes: async () => Buffer.from("%PDF-1.7 ") };

  it("LinkedIn still processing ⇒ retryable, nothing posted, the document URN travels with the error; the retry only re-checks that URN", async () => {
    let status = "PROCESSING";
    const respond = (url: string): Response => (url.includes("documents?action=initializeUpload") ? Response.json({ value: { uploadUrl: "https://www.linkedin.com/dms-uploads/d1", document: "urn:li:document:ORIGINAL" } })
      : url.includes("/rest/documents/") ? Response.json({ status }) : url.endsWith("/rest/posts") ? new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:1" } }) : new Response(null, { status: 201 }));
    calls.length = 0;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => { calls.push({ url: String(url), method: init.method ?? "GET", body: typeof init.body === "string" ? JSON.parse(init.body) : init.body }); return respond(String(url)); });
    const e = (await adapterFor("linkedin", "linkedin")!.publish(input({ format: "document", title: "Guide", account: li, media: [pdf] })).catch((x) => x)) as AdapterError;
    expect([e.kind, e.mediaRefs, calls.some((c) => c.url.endsWith("/rest/posts"))]).toEqual(["retryable", { 0: "urn:li:document:ORIGINAL" }, false]);
    status = "AVAILABLE"; calls.length = 0;
    const r = await adapterFor("linkedin", "linkedin")!.publish(input({ format: "document", title: "Guide", account: li, media: [pdf], mediaRefs: e.mediaRefs }));
    expect(calls.map((c) => c.method + " " + c.url.split("/rest/")[1])).toEqual(["GET documents/urn%3Ali%3Adocument%3AORIGINAL", "POST posts"]); // no initializeUpload, no PUT
    expect((calls.at(-1)!.body as { content: { media: { id: string } } }).content.media.id).toBe("urn:li:document:ORIGINAL");
    expect(r.externalId).toBe("urn:li:share:1");
    status = "PROCESSING_FAILED"; calls.length = 0;
    const dead = (await adapterFor("linkedin", "linkedin")!.publish(input({ format: "document", account: li, media: [pdf], mediaRefs: e.mediaRefs })).catch((x) => x)) as AdapterError;
    expect([dead.kind, calls.some((c) => c.url.endsWith("/rest/posts"))]).toEqual(["definite", false]); // bounded: a person takes over
  });

  it("X: the post is refused AFTER the media upload (429) ⇒ the media id is kept; the retry does not upload again; a resumed thread keeps its parts", async () => {
    mockFetch((c) => (c.url.endsWith("/initialize") ? { json: { data: { id: "m-original" } } } : c.url.endsWith("/2/tweets") ? { status: 429 } : { json: { data: {} } }));
    const e = (await adapterFor("x", "x")!.publish(input({ format: "thread", parts: ["one", "two"], media: [image] })).catch((x) => x)) as AdapterError;
    expect([e.kind, e.mediaRefs, e.partIds]).toEqual(["retryable", { 0: "m-original" }, []]);
    mockFetch((c, n) => (c.url.endsWith("/2/tweets") ? { status: 201, json: { data: { id: `t${n}` } } } : { status: 500 }));
    const r = await adapterFor("x", "x")!.publish(input({ format: "thread", parts: ["one", "two"], media: [image], mediaRefs: e.mediaRefs }));
    expect(calls.every((c) => c.url.endsWith("/2/tweets"))).toBe(true);
    expect(calls[0].body).toEqual({ text: "one", media: { media_ids: ["m-original"] } });
    expect(r.partIds).toEqual(["t1", "t2"]);
  });

  it("remembered uploads expire after 20 hours and are replaced, not trusted", () => {
    const t0 = new Date("2026-09-21T00:00:00Z");
    const stored = mergeMediaRefs(null, { 0: "m1" }, t0);
    expect(liveMediaRefs(stored, t0.getTime() + 19 * 3_600_000)).toEqual({ 0: "m1" });
    expect(liveMediaRefs(stored, t0.getTime() + 21 * 3_600_000)).toEqual({});
    const again = mergeMediaRefs(stored, { 0: "m1", 1: "m2" }, new Date(t0.getTime() + 3_600_000));
    expect(JSON.parse(again)[0].at).toBe(t0.toISOString()); // the ORIGINAL upload time is preserved for the same id
    expect(liveMediaRefs("{not json")).toEqual({});
  });
});

describe("analytics adapters", () => {
  it("LinkedIn: organization post → lifetime share statistics; a member profile yields nothing (restricted scope), never zeros", async () => {
    mockFetch(() => ({ json: { elements: [{ totalShareStatistics: { impressionCount: 5287, uniqueImpressionsCount: 3100, clickCount: 78, likeCount: 14, commentCount: 24, shareCount: 5, engagement: 0.02 } }] } }));
    const rows = await adapterFor("linkedin", "linkedin")!.metrics!("tok", "urn:li:share:7132", { externalAccountId: "urn:li:organization:2414183", accountType: "organization", config: {} });
    expect(calls[0].url).toBe("https://api.linkedin.com/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=urn%3Ali%3Aorganization%3A2414183&shares=List(urn%3Ali%3Ashare%3A7132)");
    expect(Object.fromEntries(rows.map((r) => [r.metric, r.value]))).toEqual({ impressions: 5287, reach: 3100, link_clicks: 78, likes: 14, comments: 24, shares: 5 });
    expect(rows.every((r) => r.kind === "lifetime")).toBe(true); // lifetime totals: the snapshot layer takes the latest, never sums days
    mockFetch(() => ({ json: {} }));
    expect(await adapterFor("linkedin", "linkedin")!.metrics!("tok", "urn:li:share:1", { externalAccountId: "urn:li:person:abc", accountType: "member", config: {} })).toEqual([]);
    expect(calls).toHaveLength(0);
  });
  it("Facebook: only metrics still valid on the current Graph version are requested", async () => {
    mockFetch(() => ({ json: { data: [{ name: "post_media_view", values: [{ value: 900 }] }, { name: "post_clicks", values: [{ value: 40 }] }, { name: "post_reactions_like_total", values: [{ value: 12 }] }] } }));
    const rows = await adapterFor("meta", "facebook")!.metrics!("tok", "123_456");
    expect(calls[0].url).toContain("/123_456/insights?metric=post_media_view,post_clicks,post_reactions_like_total&period=lifetime");
    expect(calls[0].url).not.toContain("post_impressions");
    expect(Object.fromEntries(rows.map((r) => [r.metric, r.value]))).toEqual({ views: 900, link_clicks: 40, likes: 12 });
  });
  it("Instagram: a metric the provider omits is absent, not zero; reach stays a non-additive metric", async () => {
    mockFetch(() => ({ json: { data: [{ name: "reach", total_value: { value: 640 } }, { name: "likes", values: [{ value: 31 }] }, { name: "saved", values: [{}] }] } }));
    const rows = await adapterFor("meta", "instagram")!.metrics!("tok", "1789");
    expect(calls[0].url).not.toContain("impressions"); // deprecated for media made after 2 July 2024
    expect(Object.fromEntries(rows.map((r) => [r.metric, r.value]))).toEqual({ reach: 640, likes: 31 });
  });
  it("a refused insights call is classified, never reported as data", async () => {
    mockFetch(() => ({ status: 403 }));
    const e = (await adapterFor("meta", "instagram")!.metrics!("tok", "1789").catch((x) => x)) as AdapterError;
    expect([e.kind, e.httpStatus]).toEqual(["definite", 403]);
  });
});

describe("time-limited media links", () => {
  it("no public https origin ⇒ no link; with one, the link verifies until it expires and cannot be re-pointed", () => {
    expect(mediaLink("ver1")).toBeNull();
    process.env.MEDIA_PUBLIC_ORIGIN = "http://localhost:3000";
    expect(mediaLink("ver1")).toBeNull();
    process.env.MEDIA_PUBLIC_ORIGIN = "https://app.example.com";
    const now = Date.now(), u = new URL(mediaLink("ver1", now)!);
    const exp = u.searchParams.get("exp"), sig = u.searchParams.get("sig");
    expect(u.pathname).toBe("/api/os/media/ver1");
    expect(verifyMediaLink("ver1", exp, sig, now)).toBe(true);
    expect(verifyMediaLink("ver2", exp, sig, now)).toBe(false); // another asset
    expect(verifyMediaLink("ver1", String(Number(exp) + 9999), sig, now)).toBe(false); // extended expiry
    expect(verifyMediaLink("ver1", exp, sig, now + 31 * 60_000)).toBe(false); // expired
    expect(verifyMediaLink("ver1", null, null, now)).toBe(false);
  });
});
