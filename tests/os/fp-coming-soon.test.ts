// "Coming soon" entries are announcements only: never a runnable, priced or entitled tool.
import { describe, expect, it } from "vitest";
import { COMING_SOON, TOOLS, toolByKey } from "@/lib/os/studio";
import { PROPOSED_RATES } from "@/lib/os/pricing";

describe("AI Studio coming soon", () => {
  it("AI video is announced in the Video group and is not a tool, not priced", () => {
    const v = COMING_SOON.find((c) => c.key === "ai_video")!;
    expect(v.group).toBe("Video");
    expect(toolByKey("ai_video")).toBeUndefined();
    expect(TOOLS.some((t) => t.key === "ai_video")).toBe(false);
    expect((PROPOSED_RATES as Record<string, unknown>).ai_video).toBeUndefined();
  });
  it("the script tools stay available as text tools", () => {
    for (const k of ["youtube_script", "short_script"]) expect(toolByKey(k)?.kind).toBe("text");
  });
});
