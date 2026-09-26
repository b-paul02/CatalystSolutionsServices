// Channel adapters (GrowthOS v2, brief §H/§I). One publish + one metrics function per provider,
// plain fetch, no SDKs. Endpoints follow the providers' official docs as checked on 2026-09-21
// (links in GROWTHOS_EXTERNAL_SETUP.md). NOTHING here has been live-verified: every provider still
// needs the owner's app, approvals and a real sign-in. An adapter never reports a success the
// provider did not give, and classifies every failure so the publisher knows whether a retry is safe:
//   definite  – the provider said no (4xx). Nothing was posted. Fix and try again by hand.
//   retryable – the provider refused before doing anything (429 / 503). Safe to retry automatically.
//   uncertain – timeout, dropped connection, 5xx. The post MAY exist. Never auto-retried.
export type FailureKind = "definite" | "retryable" | "uncertain";
export class AdapterError extends Error {
  /** provider ids of media uploaded BEFORE the failure, keyed by media index — the publisher keeps them for the retry */
  mediaRefs: Record<string, string> = {};
  constructor(message: string, public kind: FailureKind, public httpStatus?: number, public partIds: string[] = []) { super(message); }
}
/** Run an adapter body; whatever media it managed to upload is attached to the error it throws. */
async function keepingRefs<T>(refs: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (e) { if (e instanceof AdapterError) e.mediaRefs = { ...refs }; throw e; }
}

export type Media = { kind: string; mime: string; sizeBytes: number; publicUrl: string | null; bytes: () => Promise<Buffer> };
export type Account = { externalAccountId: string | null; accountType: string | null; config: Record<string, unknown> };
export type PublishInput = { token: string; account: Account; format: string; title: string | null; text: string; parts: string[]; media: Media[]; donePartIds: string[]; /** uploads that already exist from an earlier attempt of THIS publication (media index → provider id) */ mediaRefs?: Record<string, string> };
export type PublishResult = { externalId: string; externalUrl: string | null; partIds: string[] };
export type MetricRow = { metric: string; kind: "daily" | "lifetime"; value: number; day?: string };

const LINKEDIN_VERSION = process.env.LINKEDIN_API_VERSION ?? "202609";
const META = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v25.0"}`;

async function call(url: string, init: RequestInit & { token?: string }, what: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, redirect: "error", headers: { ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}), ...(init.headers ?? {}) }, signal: AbortSignal.timeout(60_000) });
  } catch {
    // the request may have reached the provider — we cannot know
    throw new AdapterError(`${what}: no answer from the provider.`, "uncertain");
  }
  if (res.ok) return res;
  const kind: FailureKind = res.status === 429 || res.status === 503 ? "retryable" : res.status >= 500 ? "uncertain" : "definite";
  // never echo provider bodies (they can contain tokens); a status is enough to act on
  throw new AdapterError(`${what} failed (${res.status}).`, kind, res.status);
}
const jsonBody = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// reads before a write are safe to fail: nothing has been posted yet
const safe = async <T>(fn: () => Promise<T>): Promise<T> => {
  try { return await fn(); } catch (e) { if (e instanceof AdapterError && e.kind === "uncertain") throw new AdapterError(e.message, "retryable", e.httpStatus); throw e; }
};

// ── X ────────────────────────────────────────────────────────────────────────
async function publishX(i: PublishInput): Promise<PublishResult> {
  const refs: Record<string, string> = { ...(i.mediaRefs ?? {}) };
  return keepingRefs(refs, () => publishXInner(i, refs));
}
async function publishXInner(i: PublishInput, refs: Record<string, string>): Promise<PublishResult> {
  // media is uploaded BEFORE anything is posted, so every failure in here is safe (nothing public exists yet).
  // An upload that survived an earlier attempt is reused (X keeps an uploaded media id for 24 h; the publisher drops refs after 20 h).
  const mediaIds: string[] = [];
  if (!i.donePartIds.length) for (const [k, m] of i.media.entries()) mediaIds.push(refs[k] ??= await uploadXMedia(i.token, m));
  const posts = i.format === "thread" ? i.parts : [i.text];
  const ids = [...i.donePartIds]; // a resumed thread continues after the parts already posted
  for (let n = ids.length; n < posts.length; n++) {
    try {
      const res = await call("https://api.x.com/2/tweets", { token: i.token, ...jsonBody({ text: posts[n], ...(n === 0 && mediaIds.length ? { media: { media_ids: mediaIds } } : {}), ...(ids.length ? { reply: { in_reply_to_tweet_id: ids[ids.length - 1] } } : {}) }) }, `X post ${n + 1}/${posts.length}`);
      ids.push(((await res.json()) as { data: { id: string } }).data.id);
    } catch (e) {
      if (e instanceof AdapterError) throw new AdapterError(e.message, e.kind, e.httpStatus, ids);
      throw e;
    }
  }
  const user = typeof i.account.config.username === "string" ? i.account.config.username : "i";
  return { externalId: ids[0], externalUrl: `https://x.com/${user}/status/${ids[0]}`, partIds: ids };
}
/** X API v2 chunked upload: initialize → append (≤4 MB segments) → finalize → poll STATUS while processing. Needs the `media.write` scope. */
async function uploadXMedia(token: string, m: Media): Promise<string> {
  const bytes = await m.bytes();
  const category = m.kind === "video" ? "tweet_video" : m.mime === "image/gif" ? "tweet_gif" : "tweet_image";
  const init = await safe(() => call("https://api.x.com/2/media/upload/initialize", { token, ...jsonBody({ media_type: m.mime, total_bytes: bytes.length, media_category: category }) }, "X media upload (start)"));
  const id = ((await init.json()) as { data?: { id?: string } }).data?.id;
  if (!id) throw new AdapterError("X did not return a media id.", "definite");
  const CHUNK = 4 * 1024 * 1024;
  for (let n = 0, at = 0; at < bytes.length; n++, at += CHUNK) {
    const form = new FormData();
    form.set("segment_index", String(n));
    form.set("media", new Blob([new Uint8Array(bytes.subarray(at, at + CHUNK))], { type: m.mime }));
    await safe(() => call(`https://api.x.com/2/media/upload/${id}/append`, { token, method: "POST", body: form }, `X media upload (part ${n + 1})`));
  }
  const fin = await safe(() => call(`https://api.x.com/2/media/upload/${id}/finalize`, { token, method: "POST" }, "X media upload (finish)"));
  let info = ((await fin.json()) as { data?: { processing_info?: { state?: string; check_after_secs?: number } } }).data?.processing_info;
  for (let n = 0; info && info.state !== "succeeded" && n < 40; n++) {
    if (info.state === "failed") throw new AdapterError("X could not process the media file.", "definite");
    await new Promise((r) => setTimeout(r, Math.min(15, info?.check_after_secs ?? 3) * 1000));
    const st = await safe(() => call(`https://api.x.com/2/media/upload?command=STATUS&media_id=${id}`, { token }, "X media processing status"));
    info = ((await st.json()) as { data?: { processing_info?: { state?: string; check_after_secs?: number } } }).data?.processing_info;
  }
  if (info && info.state !== "succeeded") throw new AdapterError("X is still processing the media — nothing was posted. Try again shortly.", "retryable");
  return id;
}
async function metricsX(token: string, externalId: string): Promise<MetricRow[]> {
  const res = await call(`https://api.x.com/2/tweets/${encodeURIComponent(externalId)}?tweet.fields=public_metrics`, { token }, "X metrics");
  const m = ((await res.json()) as { data?: { public_metrics?: Record<string, number> } }).data?.public_metrics ?? {};
  const map: Record<string, string> = { impression_count: "impressions", like_count: "likes", reply_count: "comments", retweet_count: "shares", quote_count: "quotes", bookmark_count: "saves" };
  return Object.entries(map).filter(([k]) => typeof m[k] === "number").map(([k, metric]) => ({ metric, kind: "lifetime" as const, value: m[k] }));
}

// ── LinkedIn (member + organization) — Posts API, versioned ──────────────────
const liHeaders = { "LinkedIn-Version": LINKEDIN_VERSION, "X-Restli-Protocol-Version": "2.0.0" };
async function publishLinkedIn(i: PublishInput): Promise<PublishResult> {
  const refs: Record<string, string> = { ...(i.mediaRefs ?? {}) };
  return keepingRefs(refs, () => publishLinkedInInner(i, refs));
}
async function publishLinkedInInner(i: PublishInput, refs: Record<string, string>): Promise<PublishResult> {
  const author = i.account.externalAccountId;
  if (!author?.startsWith("urn:li:")) throw new AdapterError("LinkedIn author is unknown — reconnect the account.", "definite");
  // every upload below happens BEFORE the post exists, so its failures are safe to retry (nothing is public yet)
  const liJson = { "Content-Type": "application/json", ...liHeaders };
  const uploadImage = async (m: Media): Promise<string> => {
    const init = await safe(() => call("https://api.linkedin.com/rest/images?action=initializeUpload", { token: i.token, ...jsonBody({ initializeUploadRequest: { owner: author } }), headers: liJson }, "LinkedIn image registration"));
    const v = ((await init.json()) as { value: { uploadUrl: string; image: string } }).value;
    await safe(async () => call(v.uploadUrl, { token: i.token, method: "PUT", body: new Uint8Array(await m.bytes()), headers: { "Content-Type": m.mime } }, "LinkedIn image upload"));
    return v.image;
  };
  /** LinkedIn processes documents and videos asynchronously; a post that references one still PROCESSING is refused. */
  const waitAvailable = async (kind: "documents" | "videos", urn: string) => {
    for (let n = 0; n < 8; n++) {
      const r = await safe(() => call(`https://api.linkedin.com/rest/${kind}/${encodeURIComponent(urn)}`, { token: i.token, headers: liHeaders }, "LinkedIn media status"));
      const status = ((await r.json()) as { status?: string }).status;
      if (status === "AVAILABLE") return;
      if (status === "PROCESSING_FAILED") throw new AdapterError("LinkedIn could not process the file — nothing was posted.", "definite");
      await new Promise((res) => setTimeout(res, Number(process.env.LINKEDIN_POLL_MS ?? 5000))); // 8 polls ≈ 40 s by default
    }
    // the upload is kept (AdapterError.mediaRefs → CosPublication.providerMedia): the retry only re-checks its status
    throw new AdapterError("LinkedIn is still processing the file — nothing was posted. It will be tried again shortly.", "retryable");
  };
  let content: Record<string, unknown> | undefined;
  if (i.format === "multi_image") {
    if (i.media.length < 2 || i.media.length > 20 || i.media.some((m) => m.kind !== "image")) throw new AdapterError("A LinkedIn multi-image post needs 2 to 20 images.", "definite");
    const images: { id: string }[] = [];
    for (const [k, m] of i.media.entries()) images.push({ id: (refs[k] ??= await uploadImage(m)) });
    content = { multiImage: { images } };
  } else if (i.format === "document") {
    const doc = i.media[0];
    const DOCS = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.presentationml.presentation"];
    if (!doc || !DOCS.includes(doc.mime)) throw new AdapterError("A LinkedIn document post needs one PDF, PowerPoint or Word file.", "definite");
    if (doc.sizeBytes > 100 * 1024 * 1024) throw new AdapterError("LinkedIn documents are limited to 100 MB.", "definite");
    // "still processing" last time ⇒ the SAME document is checked again; it is never uploaded twice
    if (!refs[0]) {
      const init = await safe(() => call("https://api.linkedin.com/rest/documents?action=initializeUpload", { token: i.token, ...jsonBody({ initializeUploadRequest: { owner: author } }), headers: liJson }, "LinkedIn document registration"));
      const v = ((await init.json()) as { value: { uploadUrl: string; document: string } }).value;
      await safe(async () => call(v.uploadUrl, { token: i.token, method: "PUT", body: new Uint8Array(await doc.bytes()), headers: { "Content-Type": doc.mime } }, "LinkedIn document upload"));
      refs[0] = v.document;
    }
    await waitAvailable("documents", refs[0]);
    content = { media: { title: (i.title ?? "Document").slice(0, 100), id: refs[0] } };
  } else if (i.format === "video") {
    const vid = i.media[0];
    if (!vid || vid.mime !== "video/mp4") throw new AdapterError("LinkedIn video posts need one finished MP4 file from Assets.", "definite");
    if (vid.sizeBytes < 75 * 1024 || vid.sizeBytes > 500 * 1024 * 1024) throw new AdapterError("LinkedIn videos must be between 75 KB and 500 MB.", "definite");
    if (!refs[0]) {
    const bytes = await vid.bytes();
    const init = await safe(() => call("https://api.linkedin.com/rest/videos?action=initializeUpload", { token: i.token, ...jsonBody({ initializeUploadRequest: { owner: author, fileSizeBytes: bytes.length, uploadCaptions: false, uploadThumbnail: false } }), headers: liJson }, "LinkedIn video registration"));
    const v = ((await init.json()) as { value: { video: string; uploadToken: string; uploadInstructions: { uploadUrl: string; firstByte: number; lastByte: number }[] } }).value;
    const partIds: string[] = [];
    for (const part of v.uploadInstructions) {
      const r = await safe(() => call(part.uploadUrl, { method: "PUT", body: new Uint8Array(bytes.subarray(part.firstByte, part.lastByte + 1)), headers: { "Content-Type": "application/octet-stream" } }, "LinkedIn video upload"));
      const etag = r.headers.get("etag");
      if (!etag) throw new AdapterError("LinkedIn did not acknowledge a video part — nothing was posted.", "retryable");
      partIds.push(etag.replace(/^"|"$/g, ""));
    }
    await safe(() => call("https://api.linkedin.com/rest/videos?action=finalizeUpload", { token: i.token, ...jsonBody({ finalizeUploadRequest: { video: v.video, uploadToken: v.uploadToken, uploadedPartIds: partIds } }), headers: liJson }, "LinkedIn video finalisation"));
    refs[0] = v.video; // only a FINALISED upload is worth keeping
    }
    await waitAvailable("videos", refs[0]);
    content = { media: { title: (i.title ?? "").slice(0, 100) || undefined, id: refs[0] } };
  } else if (i.media[0]) content = { media: { id: (refs[0] ??= await uploadImage(i.media[0])) } };
  const res = await call("https://api.linkedin.com/rest/posts", {
    token: i.token, ...jsonBody({ author, commentary: i.text, visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, ...(content ? { content } : {}), lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false }),
    headers: { "Content-Type": "application/json", ...liHeaders },
  }, "LinkedIn post");
  const id = res.headers.get("x-restli-id");
  if (!id) throw new AdapterError("LinkedIn accepted the post but returned no id.", "uncertain");
  return { externalId: id, externalUrl: `https://www.linkedin.com/feed/update/${id}/`, partIds: [id] };
}

/**
 * Organization posts only: organizationalEntityShareStatistics (lifetime, organic only, rolling 12 months) needs
 * rw_organization_admin and an ADMINISTRATOR page role. MEMBER posts need r_member_social, which LinkedIn restricts to
 * approved partners, so a personal profile returns no rows ("not available", never zero) and is recorded by hand.
 */
async function metricsLinkedIn(token: string, externalId: string, account?: Account): Promise<MetricRow[]> {
  const org = account?.externalAccountId;
  if (!org?.startsWith("urn:li:organization:")) return [];
  const param = externalId.startsWith("urn:li:ugcPost:") ? "ugcPosts" : externalId.startsWith("urn:li:share:") ? "shares" : null;
  if (!param) return [];
  const res = await call(`https://api.linkedin.com/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(org)}&${param}=List(${encodeURIComponent(externalId)})`, { token, headers: liHeaders }, "LinkedIn post statistics");
  const el = ((await res.json()) as { elements?: { totalShareStatistics?: Record<string, number> }[] }).elements?.[0]?.totalShareStatistics;
  // LinkedIn omits posts with no activity at all; that is a real zero only for counts it would otherwise report
  const t = el ?? { impressionCount: 0, clickCount: 0, likeCount: 0, commentCount: 0, shareCount: 0 };
  const map: Record<string, string> = { impressionCount: "impressions", uniqueImpressionsCount: "reach", clickCount: "link_clicks", likeCount: "likes", commentCount: "comments", shareCount: "shares" };
  return Object.entries(map).filter(([k]) => typeof t[k] === "number").map(([k, metric]) => ({ metric, kind: "lifetime" as const, value: Math.max(0, t[k]) }));
}

// ── Meta: Facebook Page + Instagram professional account ─────────────────────
type Insight = { name: string; values?: { value?: number | Record<string, number> }[]; total_value?: { value?: number } };
const insightValue = (d: Insight): number | null => { const v = d.total_value?.value ?? d.values?.[0]?.value; return typeof v === "number" ? v : null; };

/** Page post insights, period=lifetime. Only metrics still valid on Graph v25 (post_impressions* were deprecated). Needs pages_read_engagement + ANALYZE on the Page. */
async function metricsFacebook(token: string, externalId: string): Promise<MetricRow[]> {
  const res = await call(`${META}/${encodeURIComponent(externalId)}/insights?metric=post_media_view,post_clicks,post_reactions_like_total&period=lifetime`, { token }, "Facebook post insights");
  const data = ((await res.json()) as { data?: Insight[] }).data ?? [];
  const map: Record<string, string> = { post_media_view: "views", post_clicks: "link_clicks", post_reactions_like_total: "likes" };
  return data.flatMap((d) => { const v = insightValue(d); return map[d.name] && v !== null ? [{ metric: map[d.name], kind: "lifetime" as const, value: v }] : []; });
}
/** Instagram media insights. `impressions` is gone for media made after 2 July 2024, so it is not requested. Needs instagram_manage_insights. */
async function metricsInstagram(token: string, externalId: string): Promise<MetricRow[]> {
  const res = await call(`${META}/${encodeURIComponent(externalId)}/insights?metric=reach,likes,comments,shares,saved`, { token }, "Instagram media insights");
  const data = ((await res.json()) as { data?: Insight[] }).data ?? [];
  const map: Record<string, string> = { reach: "reach", likes: "likes", comments: "comments", shares: "shares", saved: "saves" };
  return data.flatMap((d) => { const v = insightValue(d); return map[d.name] && v !== null ? [{ metric: map[d.name], kind: "lifetime" as const, value: v }] : []; });
}

async function publishFacebook(i: PublishInput): Promise<PublishResult> {
  const page = i.account.externalAccountId;
  if (!page) throw new AdapterError("Facebook Page is unknown — reconnect and pick the Page.", "definite");
  if (i.format === "video") { const refs: Record<string, string> = { ...(i.mediaRefs ?? {}) }; return keepingRefs(refs, () => publishFacebookVideo(i, page, refs)); }
  const img = i.media[0];
  if (img && !img.publicUrl) throw new AdapterError("Facebook fetches the image from a link we sign for it, which needs a public https app address (MEDIA_PUBLIC_ORIGIN or SITE_URL). This environment has none.", "definite");
  const res = await call(`${META}/${page}/${img ? "photos" : "feed"}`, { token: i.token, ...jsonBody(img ? { url: img.publicUrl, caption: i.text } : { message: i.text }) }, "Facebook Page post");
  const j = (await res.json()) as { id?: string; post_id?: string };
  const id = j.post_id ?? j.id;
  if (!id) throw new AdapterError("Facebook accepted the post but returned no id.", "uncertain");
  return { externalId: id, externalUrl: `https://www.facebook.com/${id}`, partIds: [id] };
}
/**
 * Page video (Video API "Publishing"): Resumable Upload API → file handle → POST graph-video /{page}/videos → poll status.
 * Two identities survive a retry: refs["0"] = the uploaded file handle (never upload twice) and refs.video = the video the
 * Page already accepted (never post twice — a later attempt only checks its processing state).
 */
const META_VIDEO = META.replace("graph.facebook.com", "graph-video.facebook.com");
async function publishFacebookVideo(i: PublishInput, page: string, refs: Record<string, string>): Promise<PublishResult> {
  const m = i.media[0], app = process.env.META_APP_ID;
  if (!refs.video) {
    if (!app) throw new AdapterError("Facebook video needs the Meta app id (META_APP_ID) — setup is not finished.", "definite");
    if (m.mime !== "video/mp4") throw new AdapterError("Facebook Page video must be an MP4 file.", "definite");
    if (m.sizeBytes > 500 * 1024 * 1024) throw new AdapterError("This video is larger than 500 MB — publish it on Facebook directly and record the link.", "definite");
    if (!refs["0"]) {
      // nothing is public during an upload, so an unanswered request is safe to try again
      const start = await safe(() => call(`${META}/${app}/uploads?file_name=video.mp4&file_length=${m.sizeBytes}&file_type=video/mp4`, { token: i.token, method: "POST" }, "Facebook upload session"));
      const session = ((await start.json()) as { id?: string }).id;
      if (!session?.startsWith("upload:")) throw new AdapterError("Facebook did not open an upload session.", "retryable");
      const up = await safe(async () => call(`${META}/${session}`, { method: "POST", headers: { Authorization: `OAuth ${i.token}`, file_offset: "0" }, body: new Uint8Array(await m.bytes()) }, "Facebook video upload"));
      const h = ((await up.json()) as { h?: string }).h;
      if (!h) throw new AdapterError("Facebook accepted the upload but returned no file handle.", "retryable");
      refs["0"] = h;
    }
    // THE write: an unanswered request here is `uncertain` (call) and is never retried — a person checks the Page
    const res = await call(`${META_VIDEO}/${page}/videos`, { token: i.token, ...jsonBody({ title: i.title ?? "", description: i.text, fbuploader_video_file_chunk: refs["0"] }) }, "Facebook Page video");
    const id = ((await res.json()) as { id?: string }).id;
    if (!id) throw new AdapterError("Facebook accepted the video but returned no id.", "uncertain");
    refs.video = id;
  }
  for (let n = 0; n < 12; n++) {
    const s = await safe(() => call(`${META}/${refs.video}?fields=status,permalink_url`, { token: i.token }, "Facebook video status"));
    const j = (await s.json()) as { status?: { video_status?: string }; permalink_url?: string };
    if (j.status?.video_status === "ready") return { externalId: refs.video, externalUrl: j.permalink_url ? `https://www.facebook.com${j.permalink_url.replace(/^https?:\/\/[^/]+/, "")}` : null, partIds: [refs.video] };
    if (j.status?.video_status === "error") throw new AdapterError("Facebook could not process this video. Check the file and the Page, then schedule it again.", "definite");
    if (n < 11) await new Promise((r) => setTimeout(r, Number(process.env.FB_VIDEO_POLL_MS ?? 5_000)));
  }
  throw new AdapterError("Facebook has the video and is still processing it — we will check again shortly. It is not uploaded or posted a second time.", "retryable");
}
async function publishInstagram(i: PublishInput): Promise<PublishResult> {
  const ig = i.account.externalAccountId;
  if (!ig) throw new AdapterError("Instagram account is unknown — reconnect and pick the account.", "definite");
  if (i.media.some((m) => !m.publicUrl)) throw new AdapterError("Instagram fetches media from a link we sign for it, which needs a public https app address (MEDIA_PUBLIC_ORIGIN or SITE_URL). This environment has none.", "definite");
  // containers are drafts on Instagram's side: creating them publishes nothing, so failures here are safe
  const container = async (m: Media, extra: Record<string, unknown>) => {
    const r = await safe(() => call(`${META}/${ig}/media`, { token: i.token, ...jsonBody({ ...(m.kind === "video" ? { video_url: m.publicUrl, media_type: i.format === "reel" ? "REELS" : "VIDEO" } : { image_url: m.publicUrl }), ...extra }) }, "Instagram media container"));
    return ((await r.json()) as { id: string }).id;
  };
  let creation: string;
  if (i.format === "carousel") {
    const children: string[] = [];
    for (const m of i.media) children.push(await container(m, { is_carousel_item: true }));
    const r = await safe(() => call(`${META}/${ig}/media`, { token: i.token, ...jsonBody({ media_type: "CAROUSEL", children: children.join(","), caption: i.text }) }, "Instagram carousel container"));
    creation = ((await r.json()) as { id: string }).id;
  } else creation = await container(i.media[0], { caption: i.text });
  for (let n = 0; n < 30; n++) { // video containers process asynchronously
    const s = await safe(() => call(`${META}/${creation}?fields=status_code`, { token: i.token }, "Instagram container status"));
    const code = ((await s.json()) as { status_code?: string }).status_code;
    if (code === "FINISHED") break;
    if (code === "ERROR" || code === "EXPIRED") throw new AdapterError(`Instagram could not process the media (${code}).`, "definite");
    if (n === 29) throw new AdapterError("Instagram is still processing the media — try again shortly.", "retryable");
    await new Promise((r) => setTimeout(r, 5_000));
  }
  const pub = await call(`${META}/${ig}/media_publish`, { token: i.token, ...jsonBody({ creation_id: creation }) }, "Instagram publish");
  const id = ((await pub.json()) as { id?: string }).id;
  if (!id) throw new AdapterError("Instagram accepted the post but returned no id.", "uncertain");
  let url: string | null = null;
  try { url = ((await (await call(`${META}/${id}?fields=permalink`, { token: i.token }, "Instagram permalink")).json()) as { permalink?: string }).permalink ?? null; } catch { /* the post is live; the link can be added later */ }
  return { externalId: id, externalUrl: url, partIds: [id] };
}

// ── YouTube: resumable upload (long-form and Shorts are the same API; a Short is a short vertical video) ──
async function publishYouTube(i: PublishInput): Promise<PublishResult> {
  const v = i.media[0];
  if (!v || v.kind !== "video") throw new AdapterError("YouTube needs a finished video file — a script is not a video.", "definite");
  const meta = { snippet: { title: (i.title ?? "").slice(0, 100), description: i.text.slice(0, 5000) }, status: { privacyStatus: (i.account.config.privacyStatus as string) ?? "private", selfDeclaredMadeForKids: false } };
  const start = await safe(() => call("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", { token: i.token, method: "POST", body: JSON.stringify(meta), headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Length": String(v.sizeBytes), "X-Upload-Content-Type": v.mime } }, "YouTube upload session"));
  const session = start.headers.get("location");
  if (!session) throw new AdapterError("YouTube did not return an upload session.", "retryable");
  // ponytail: one PUT (fine up to a few hundred MB on a long-running worker); chunk + resume via Content-Range when files outgrow that
  const put = await call(session, { token: i.token, method: "PUT", body: new Uint8Array(await v.bytes()), headers: { "Content-Type": v.mime, "Content-Length": String(v.sizeBytes) } }, "YouTube upload");
  const id = ((await put.json()) as { id?: string }).id;
  if (!id) throw new AdapterError("YouTube accepted the upload but returned no video id.", "uncertain");
  return { externalId: id, externalUrl: i.format === "short" ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`, partIds: [id] };
}
async function metricsYouTube(token: string, externalId: string): Promise<MetricRow[]> {
  const out: MetricRow[] = [];
  const res = await call(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(externalId)}`, { token }, "YouTube statistics");
  const s = ((await res.json()) as { items?: { statistics?: Record<string, string> }[] }).items?.[0]?.statistics ?? {};
  for (const [k, metric] of [["viewCount", "views"], ["likeCount", "likes"], ["commentCount", "comments"]] as const) if (s[k] != null) out.push({ metric, kind: "lifetime", value: Number(s[k]) });
  // watch metrics come from the Analytics API and need the yt-analytics.readonly scope; absence is "unavailable", not zero
  try {
    const end = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10), startDay = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const a = await call(`https://youtubeanalytics.googleapis.com/v2/reports?ids=channel%3D%3DMINE&startDate=${startDay}&endDate=${end}&metrics=views,estimatedMinutesWatched,averageViewDuration&dimensions=day&filters=video%3D%3D${encodeURIComponent(externalId)}`, { token }, "YouTube analytics");
    for (const [day, , minutes] of ((await a.json()) as { rows?: [string, number, number, number][] }).rows ?? []) out.push({ metric: "watch_time_minutes", kind: "daily", value: minutes, day });
  } catch (e) { if (!(e instanceof AdapterError)) throw e; }
  return out;
}

// ── WordPress (application password; account.config = {site,user}) ───────────
async function publishWordPress(i: PublishInput): Promise<PublishResult> {
  const site = String(i.account.config.site ?? "").replace(/\/+$/, "");
  if (!/^https:\/\//.test(site)) throw new AdapterError("WordPress site address is missing — reconnect the blog.", "definite");
  const res = await fetch(`${site}/wp-json/wp/v2/posts`, { method: "POST", redirect: "error", headers: { Authorization: `Basic ${i.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ title: i.title, content: i.text, status: "publish" }), signal: AbortSignal.timeout(60_000) }).catch(() => { throw new AdapterError("WordPress: no answer from the site.", "uncertain"); });
  if (!res.ok) throw new AdapterError(`WordPress publish failed (${res.status}).`, res.status === 429 || res.status === 503 ? "retryable" : res.status >= 500 ? "uncertain" : "definite", res.status);
  const j = (await res.json()) as { id?: number; link?: string };
  if (!j.id) throw new AdapterError("WordPress accepted the post but returned no id.", "uncertain");
  return { externalId: String(j.id), externalUrl: j.link ?? null, partIds: [String(j.id)] };
}

// ── explicit TEST adapter — never available in production, never counted as live ──
const testState = { posted: new Map<string, string[]>(), retried: new Set<string>() , lastMediaRefs: {} as Record<string, string> };
async function publishTest(i: PublishInput): Promise<PublishResult> {
  const mode = String(i.account.config.mode ?? "ok");
  const posts = i.format === "thread" ? i.parts : [i.text];
  const ids = [...i.donePartIds];
  const acct = i.account.externalAccountId ?? "";
  // like a real provider: the (pretend) media upload succeeds, THEN the post is refused — the upload id must survive the retry
  if (mode === "retryable_once" && !testState.retried.has(acct)) { testState.retried.add(acct); const e = new AdapterError("Test provider is busy (503).", "retryable", 503); if (i.media.length) e.mediaRefs = { 0: `test_media_${acct}` }; throw e; }
  testState.lastMediaRefs = { ...(i.mediaRefs ?? {}) };
  if (mode === "uncertain") throw new AdapterError("Test provider: no answer.", "uncertain");
  if (mode === "definite") throw new AdapterError("Test provider rejected the post (400).", "definite", 400);
  for (let n = ids.length; n < posts.length; n++) {
    if (mode === "partial" && n === 1 && !i.donePartIds.length) throw new AdapterError("Test provider failed after the first part (400).", "definite", 400, ids);
    ids.push(`test_${Math.random().toString(36).slice(2, 10)}`);
  }
  testState.posted.set(ids[0], posts);
  return { externalId: ids[0], externalUrl: `https://test.invalid/post/${ids[0]}`, partIds: ids };
}
export const testAdapterPosts = () => testState.posted;
export const testAdapterLastMediaRefs = () => testState.lastMediaRefs;
export const testAdapterEnabled = () => process.env.NODE_ENV !== "production" && process.env.GROWTHOS_TEST_ADAPTER === "1";

// ── registry ─────────────────────────────────────────────────────────────────
type Adapter = { publish: (i: PublishInput) => Promise<PublishResult>; metrics?: (token: string, externalId: string, account?: Account) => Promise<MetricRow[]>; formats: string[] };
const ADAPTERS: Record<string, Adapter> = {
  "x:x": { publish: publishX, metrics: metricsX, formats: ["post", "thread"] },
  "linkedin:linkedin": { publish: publishLinkedIn, metrics: metricsLinkedIn, formats: ["post", "multi_image", "document", "video"] },
  "meta:facebook": { publish: publishFacebook, metrics: metricsFacebook, formats: ["post", "video"] },
  "meta:instagram": { publish: publishInstagram, metrics: metricsInstagram, formats: ["post", "carousel", "reel"] },
  "youtube:youtube": { publish: publishYouTube, metrics: metricsYouTube, formats: ["long_video", "short"] },
  "wordpress:blog": { publish: publishWordPress, formats: ["article"] },
};
const TEST: Adapter = { publish: publishTest, metrics: async () => [{ metric: "impressions", kind: "lifetime", value: 1200 }, { metric: "link_clicks", kind: "lifetime", value: 48 }], formats: ["post", "thread", "article", "carousel", "reel", "long_video", "short", "multi_image", "document", "video"] };

export function adapterFor(provider: string, channel: string): Adapter | null {
  if (provider === "test") return testAdapterEnabled() ? TEST : null;
  return ADAPTERS[`${provider}:${channel}`] ?? null;
}

/** GA4 Data API: sessions and key events per campaign per day. Website traffic — never Search Console clicks. */
export async function ga4CampaignReport(token: string, propertyId: string, days = 28): Promise<{ day: string; campaign: string; medium: string; sessions: number; keyEvents: number }[]> {
  const res = await call(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, {
    token, ...jsonBody({ dateRanges: [{ startDate: `${days}daysAgo`, endDate: "yesterday" }], dimensions: [{ name: "date" }, { name: "sessionCampaignName" }, { name: "sessionMedium" }], metrics: [{ name: "sessions" }, { name: "keyEvents" }], limit: 10000 }),
  }, "Google Analytics report");
  const rows = ((await res.json()) as { rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[] }).rows ?? [];
  return rows.map((r) => ({ day: r.dimensionValues[0].value.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3"), campaign: r.dimensionValues[1].value, medium: r.dimensionValues[2].value, sessions: Number(r.metricValues[0].value), keyEvents: Number(r.metricValues[1].value) }));
}
