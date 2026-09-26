// AI image generation behind a provider adapter (brief §G). One provider shape is implemented: the
// OpenAI-compatible Images API (POST {base}/images/generations → data[0].b64_json). It is OFF until
// IMAGE_API_KEY + IMAGE_MODEL are set — the UI then says "Requires setup" and generates nothing.
// Not live-verified in this build. Output always lands as a DRAFT, internal, labelled AI generated.
import { metered } from "./ai";
import { uploadAsset } from "./assets";
import { WorkError, type WorkActor } from "./work";
import { can, isStaffRole } from "@/lib/leados/rbac";

export function imageGenStatus(): { ready: boolean; provider: string; reason: string } {
  const ready = Boolean(process.env.IMAGE_API_KEY && process.env.IMAGE_MODEL);
  return { ready, provider: process.env.IMAGE_MODEL ?? "not configured", reason: ready ? "" : "No image provider is configured (IMAGE_API_KEY, IMAGE_MODEL). Upload images made elsewhere in the meantime." };
}

const BLOCKED = /\b(logo of|trademark|in the style of|celebrity|nude|nsfw)\b/i;

/** Prompt rules shared by the staff panel and the client AI Studio. Returns the cleaned prompt. */
export function checkImagePrompt(prompt: string): string {
  const status = imageGenStatus();
  if (!status.ready) throw new WorkError(status.reason);
  const text = prompt.trim().slice(0, 1500);
  if (text.length < 10) throw new WorkError("Describe the image in a sentence or two.");
  if (BLOCKED.test(text)) throw new WorkError("Remove brand names, real people and “in the style of” references — rights cannot be cleared for those.");
  return text;
}

/** The provider call alone — no permission, metering or storage. Callers own those. */
export async function renderImage(text: string): Promise<Buffer> {
  {
    const res = await fetch(`${(process.env.IMAGE_API_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "")}/images/generations`, {
      method: "POST", headers: { Authorization: `Bearer ${process.env.IMAGE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.IMAGE_MODEL, prompt: text, n: 1, size: process.env.IMAGE_SIZE ?? "1024x1024" }), signal: AbortSignal.timeout(180_000),
    }).catch(() => { throw new WorkError("The image provider did not answer — nothing was generated."); });
    if (!res.ok) throw new WorkError(`The image provider refused the request (${res.status}) — nothing was generated.`);
    const b64 = ((await res.json()) as { data?: { b64_json?: string }[] }).data?.[0]?.b64_json;
    if (!b64) throw new WorkError("The image provider returned no image — nothing was generated.");
    return Buffer.from(b64, "base64");
  }
}

export async function generateImageAsset(actor: WorkActor, prompt: string) {
  if (!isStaffRole(actor.role) || !can(actor.role, "work.execute")) throw new WorkError("Forbidden.");
  const text = checkImagePrompt(prompt), status = imageGenStatus();
  // Catalyst production work: recorded as catalyst_internal (metered's default) — never the client's wallet
  const bytes = await metered(actor.orgId, "image_generation", () => renderImage(text), { modality: "image", userId: actor.userId });
  return uploadAsset(actor, { name: `AI draft — ${text.slice(0, 60)}.png`, mime: "image/png", bytes, category: "production", origin: "ai_generated", clientVisible: false, sourceNote: `Generated with ${status.provider}. Prompt: ${text.slice(0, 400)}`, rightsNote: "AI generated — review the provider’s terms before commercial use." });
}
