import Icon from "@/components/Icon";
import { chatConfigs, waConfigs, dashConfigs, scoreConfigs, demosFor, type DemoKind } from "@/lib/demos";
import ChatDemo from "./ChatDemo";
import WhatsAppDemo from "./WhatsAppDemo";
import LeadScoreDemo from "./LeadScoreDemo";
import DashboardDemo from "./DashboardDemo";

const HEADINGS: Record<DemoKind, { icon: string; title: string; desc: string; tier: string }> = {
  chat: {
    icon: "support_agent",
    title: "AI assistant — try it",
    desc: "The 24×7 assistant that answers questions and books people in while you sleep. Ask it anything.",
    tier: "Included from Tier 3, or available as an add-on.",
  },
  whatsapp: {
    icon: "chat",
    title: "Speed-to-lead — watch it run",
    desc: "An enquiry arrives out of hours. Watch what happens next, with no human involved.",
    tier: "Included from Tier 2, or available as the WhatsApp AI Bot add-on.",
  },
  score: {
    icon: "fact_check",
    title: "AI qualification — build a test enquiry",
    desc: "Choose the attributes of an incoming enquiry and watch it get scored and routed in real time.",
    tier: "Included at Tier 3; available standalone as an AI agent workflow.",
  },
  dashboard: {
    icon: "monitoring",
    title: "Your dashboard — explore it",
    desc: "What you see when you log in: what came in, what it cost, and what it produced. Filter it yourself.",
    tier: "Dashboards are included from Tier 2 up.",
  },
};

/** Renders the live demos that represent a given industry program. */
export default function IndustryDemos({ industry }: { industry: string }) {
  const kinds = demosFor[industry] ?? ["dashboard"];
  const available = kinds.filter((k) =>
    k === "chat" ? chatConfigs[industry] : k === "whatsapp" ? waConfigs[industry] : k === "score" ? scoreConfigs[industry] : dashConfigs[industry]
  );
  if (!available.length) return null;

  return (
    <div className={`grid gap-8 ${available.length > 1 ? "lg:grid-cols-2" : "mx-auto max-w-[720px]"}`}>
      {available.map((kind) => {
        const h = HEADINGS[kind];
        return (
          <div key={kind} id={`demo-${kind}`} className="scroll-mt-24">
            <div className="mb-4 flex items-start gap-3.5">
              <span className="icon-chip h-[44px] w-[44px] shrink-0 text-[23px]"><Icon name={h.icon} /></span>
              <div>
                <h3 className="text-[17px] font-bold text-white">{h.title}</h3>
                <p className="mt-1 text-[13.5px] leading-[1.6] text-[var(--color-muted)]">{h.desc}</p>
              </div>
            </div>
            {kind === "chat" && <ChatDemo config={chatConfigs[industry]} />}
            {kind === "whatsapp" && <WhatsAppDemo config={waConfigs[industry]} />}
            {kind === "score" && <LeadScoreDemo config={scoreConfigs[industry]} />}
            {kind === "dashboard" && <DashboardDemo config={dashConfigs[industry]} />}
            <p className="mt-3 text-[12.5px] text-[var(--color-faint)]">
              <Icon name="shopping_bag" className="mr-1.5 align-[-3px] text-[14px] text-[var(--color-brand-soft)]" />
              {h.tier}
            </p>
          </div>
        );
      })}
    </div>
  );
}
