import { NextRequest, NextResponse } from "next/server";

// Public embed scripts (plan §2): ES5-safe, < 3 KB, no cookies, cached an hour. The workspace/form id rides in a data
// attribute. WP-12 "form": renders the hosted form in an iframe sized by postMessage from the page itself.
const SCRIPTS: Record<string, (origin: string) => string> = {
  form: (origin) => `(function(){var s=document.currentScript;if(!s)return;var id=s.getAttribute("data-form");if(!id)return;var o=${JSON.stringify(origin)};var f=document.createElement("iframe");f.src=o+"/app/c/"+encodeURIComponent(id)+"?embed=1";f.title="Form";f.setAttribute("loading","lazy");f.style.width="100%";f.style.border="0";f.style.minHeight="520px";f.style.display="block";s.parentNode.insertBefore(f,s);window.addEventListener("message",function(e){if(e.origin!==o)return;var d=e.data||{};if(d.type==="cgo-form-height"&&d.id===id&&d.height>0){f.style.height=Math.ceil(d.height)+"px";f.style.minHeight="0";}});})();`,
};

export async function GET(req: NextRequest, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  const make = SCRIPTS[kind.replace(/\.js$/, "")];
  if (!make) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(make(req.nextUrl.origin), { headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}
