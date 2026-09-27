import { NextRequest, NextResponse } from "next/server";

// DEVELOPMENT-ONLY stand-in for an OpenAI-compatible chat endpoint, so the AI Studio flow (quote → run → settle → save)
// can be walked in a browser without a paid provider. It does not exist in production, needs an explicit flag, and
// every draft it returns says it is a test draft. Point LLM_BASE_URL at <origin>/api/dev/llm (scripts/dev-verify.mjs).
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production" || process.env.GROWTHOS_DEV_LLM !== "1") return new NextResponse(null, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { messages?: { role: string; content: string }[] };
  const system = body.messages?.find((m) => m.role === "system")?.content ?? "";
  const user = body.messages?.find((m) => m.role === "user")?.content ?? "";
  if (/FORCE_PROVIDER_ERROR/.test(user)) return new NextResponse("forced failure", { status: 400 });
  const topic = /"topic":"([^"]{0,120})/.exec(user)?.[1] ?? "your topic";
  let content: unknown;
  if (system.includes('"items":[')) content = { items: [0, 2, 4, 7, 9].map((d, i) => ({ dayOffset: d, channel: i % 2 ? "x" : "linkedin", persona: "Owner", topic: `[TEST] Calendar idea ${i + 1}`, hook: "Test hook", format: "post", cta: "Book a consult" })) };
  else if (system.includes('"narrative"')) content = { narrative: "[TEST NARRATIVE] Results are summarised from the stored figures only.", suggestions: [] };
  else content = { title: `[TEST DRAFT] ${topic}`, body: `[TEST DRAFT - local stand-in model] A short post about ${topic}. Replace this with a real provider before any client sees it.`, parts: /thread|"parts" = the thread/i.test(system) ? ["[TEST] Post one about " + topic, "[TEST] Post two", "[TEST] Post three", "[TEST] Post four"] : [], meta: { title: "", description: "" }, notes: ["Test draft from the local stand-in model"] };
  const text = JSON.stringify(content);
  return NextResponse.json({ choices: [{ message: { content: text } }], usage: { prompt_tokens: Math.ceil((system.length + user.length) / 4), completion_tokens: Math.ceil(text.length / 4) } });
}
