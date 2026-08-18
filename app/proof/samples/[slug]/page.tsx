import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Icon from "@/components/Icon";
import CTASection from "@/components/CTASection";
import { sampleBySlug, samples, fictionalNote, type SampleBlock } from "@/lib/proof";

export function generateStaticParams() {
  return samples.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const s = sampleBySlug[slug];
  return s ? { title: `Sample: ${s.title}`, description: s.summary } : { title: "Sample Deliverable" };
}

function Block({ b }: { b: SampleBlock }) {
  switch (b.kind) {
    case "callout":
      return (
        <div className="rounded-xl border border-[rgba(168,85,247,0.25)] bg-[rgba(124,58,237,0.08)] px-5 py-4 text-[13.5px] leading-[1.6] text-[var(--color-brand-soft)]">
          <Icon name="info" className="mr-2 align-[-3px] text-[16px]" />
          {b.text}
        </div>
      );
    case "kpis":
      return (
        <div>
          {b.title && <h3 className="mb-3 text-[16px] font-bold text-white">{b.title}</h3>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {b.items.map((k) => (
              <div key={k.label} className="card p-5">
                <div className="text-[22px] font-extrabold text-white">{k.value}</div>
                {k.delta && (
                  <div className={`mt-0.5 text-[12.5px] font-semibold ${k.down ? "text-[#6EE7B7]" : "text-[#6EE7B7]"}`}>
                    <Icon name={k.down ? "trending_down" : "trending_up"} className="mr-1 align-[-3px] text-[14px]" />
                    {k.delta}
                  </div>
                )}
                <div className="mt-1.5 text-[12.5px] leading-[1.45] text-[var(--color-faint)]">{k.label}</div>
              </div>
            ))}
          </div>
        </div>
      );
    case "table":
      return (
        <div>
          {b.title && <h3 className="mb-3 text-[16px] font-bold text-white">{b.title}</h3>}
          <div className="overflow-x-auto rounded-xl border border-[var(--color-line)]">
            <table className="w-full min-w-[520px] text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-[var(--color-line)] bg-white/[0.03]">
                  {b.head.map((h) => (
                    <th key={h} className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--color-faint)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, i) => (
                  <tr key={i} className="border-b border-white/[0.04] last:border-0">
                    {r.map((c, j) => (
                      <td key={j} className={`px-4 py-3 ${j === 0 ? "font-medium text-white" : c.startsWith("▲") ? "font-semibold text-[#6EE7B7]" : "text-[var(--color-muted)]"}`}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    case "bars":
      return (
        <div>
          <h3 className="mb-1.5 text-[16px] font-bold text-white">{b.title}</h3>
          {b.note && <p className="mb-4 text-[13px] leading-[1.55] text-[var(--color-faint)]">{b.note}</p>}
          <div className="flex flex-col gap-3.5">
            {b.items.map((it) => (
              <div key={it.label}>
                <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                  <span className="text-[var(--color-muted)]">{it.label}</span>
                  <span className="font-bold text-white">{it.value}</span>
                </div>
                <div className="h-[9px] overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-brand-strong),var(--color-brand))]" style={{ width: `${it.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    case "prose":
      return (
        <div>
          {b.title && <h3 className="mb-4 text-[22px] font-extrabold leading-[1.25] tracking-[-0.02em] text-white">{b.title}</h3>}
          <div className="flex flex-col gap-4">
            {b.paras.map((p, i) => (
              <p key={i} className="text-[14.5px] leading-[1.75] text-[var(--color-muted)]">{p}</p>
            ))}
          </div>
        </div>
      );
    case "list":
      return (
        <div>
          <h3 className="mb-3 text-[16px] font-bold text-white">{b.title}</h3>
          <ul className="flex flex-col gap-2.5">
            {b.items.map((it) => (
              <li key={it} className="flex items-start gap-2.5 text-[13.5px] leading-[1.6] text-[var(--color-muted)]">
                <span className="mt-[3px] flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px] bg-[rgba(52,211,153,0.14)] text-[#6EE7B7]"><Icon name="check" className="text-[12px]" /></span>
                {it}
              </li>
            ))}
          </ul>
        </div>
      );
    case "emails":
      return (
        <div className="flex flex-col gap-4">
          {b.items.map((e) => (
            <div key={e.subject} className="card p-5">
              <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-brand-soft)]">{e.day}</div>
              <div className="mb-2.5 text-[15px] font-bold text-white">
                <Icon name="mail" className="mr-2 align-[-3px] text-[17px] text-[var(--color-brand-soft)]" />
                {e.subject}
              </div>
              {e.body.map((p, i) => (
                <p key={i} className="mb-2 text-[13.5px] leading-[1.65] text-[var(--color-muted)] last:mb-0">{p}</p>
              ))}
            </div>
          ))}
        </div>
      );
    case "posts":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          {b.items.map((p) => (
            <div key={p.hook} className="card flex flex-col p-5">
              <div className="mb-2.5 inline-flex items-center gap-1.5 self-start rounded-full border border-[var(--color-line)] bg-white/[0.03] px-2.5 py-1 text-[11.5px] font-medium text-[var(--color-muted)]">
                <Icon name="tag" className="text-[13px]" />
                {p.channel}
              </div>
              <div className="mb-2 text-[15px] font-bold leading-[1.35] text-white">{p.hook}</div>
              <p className="mb-3 text-[13px] leading-[1.6] text-[var(--color-muted)]">{p.body}</p>
              <div className="mt-auto text-[12.5px] font-semibold text-[var(--color-brand-soft)]">{p.cta}</div>
            </div>
          ))}
        </div>
      );
  }
}

export default async function SamplePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = sampleBySlug[slug];
  if (!doc) notFound();

  const others = samples.filter((s) => s.slug !== slug).slice(0, 3);

  return (
    <>
      <section className="relative overflow-hidden px-5 pb-10 pt-14 sm:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_70%_0%,rgba(124,58,237,0.22),transparent_62%)]" />
        <div className="relative mx-auto max-w-[860px]">
          <nav className="mb-7 flex items-center gap-2 text-[13px] text-[var(--color-faint)]" aria-label="Breadcrumb">
            <Link href="/proof" className="hover:text-[var(--color-brand-soft)]">Proof</Link>
            <Icon name="chevron_right" className="text-[16px]" />
            <span className="text-[var(--color-brand-soft)]">Sample deliverable</span>
          </nav>
          <span className="badge mb-5"><Icon name={doc.icon} className="text-[15px]" />{doc.type}</span>
          <h1 className="mb-3 text-[clamp(1.9rem,5vw,40px)] font-extrabold leading-[1.12] tracking-[-0.025em] text-white">{doc.title}</h1>
          <p className="mb-3 text-[14px] font-semibold text-[var(--color-brand-soft)]">{doc.brand} · {doc.industry}</p>
          <p className="max-w-[680px] text-[15px] leading-[1.65] text-[var(--color-muted)]">{doc.summary}</p>
        </div>
      </section>

      <section className="px-5 pb-14 sm:px-8">
        <div className="mx-auto flex max-w-[860px] flex-col gap-9">
          {doc.blocks.map((b, i) => <Block key={i} b={b} />)}
          <p className="border-t border-white/5 pt-5 text-[12.5px] leading-[1.6] text-[var(--color-faint)]">
            <Icon name="theater_comedy" className="mr-1.5 align-[-3px] text-[15px] text-[var(--color-brand-soft)]" />
            {fictionalNote}
          </p>
        </div>
      </section>

      <section className="border-t border-white/5 px-5 py-12 sm:px-8">
        <div className="mx-auto max-w-[1240px]">
          <h2 className="mb-6 text-2xl font-bold tracking-[-0.02em] text-white">More Samples</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((s) => (
              <Link key={s.slug} href={`/proof/samples/${s.slug}`} className="card-i flex items-center justify-between gap-3.5">
                <div>
                  <div className="text-[14.5px] font-semibold text-white">{s.title}</div>
                  <div className="mt-0.5 text-[12.5px] text-[var(--color-faint)]">{s.brand}</div>
                </div>
                <Icon name="arrow_forward" className="text-[20px] text-[var(--color-brand-soft)]" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CTASection
        eyebrow="This could be your report"
        heading="Want This Level of Clarity About Your Own Numbers?"
        copy="Every program includes reporting like this from month one. Start with a free growth audit and see your baseline."
        button="Book a Call"
      />
    </>
  );
}
