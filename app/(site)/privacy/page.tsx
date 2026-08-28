import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy" };

const sections: { title: string; body: (string | { list: string[] } | { html: true; text: string })[] }[] = [
  {
    title: "1. Information we collect",
    body: [
      "Account information. Your email address, used for sign-in and service notices.",
      "Business and project information you provide. Company name, website, industry, products, target market, brand voice, goals, and marketing budget — entered during onboarding, our growth audit, or when editing your brand profile.",
      "Connected marketing accounts. When you connect a marketing channel (LinkedIn, X, Instagram, Facebook, Google Search Console, Google Analytics, ad platforms, or your CRM), we receive OAuth access tokens and the data those platforms authorize, such as: post and page performance, follower and engagement metrics, search impressions and clicks, website session and conversion analytics, advertising spend and results, and page/account identifiers. We access only the scopes you approve, and only to provide the features described below.",
      "Leads and contacts. If you use lead capture forms, lead sourcing, CRM sync, or outreach features, we process the contact data involved (such as names, business email addresses, company details, and engagement history) on your behalf. For this data you are the data controller and Catalyst Solutions Services is your processor.",
      "Content you and the AI create. Drafts, posts, articles, images, videos, campaign plans, audit reports, and their performance data.",
      "Booking and payment information. Payments are processed by Stripe. We receive booking details and payment confirmation, but we never see or store your full card number — that data goes directly to Stripe.",
      "Usage and technical data. Log data, approximate usage metrics, and attribution data (UTM parameters, form submissions, and — where you configure payment webhooks — transaction amounts used to attribute revenue to marketing).",
    ],
  },
  {
    title: "2. How we use information",
    body: [
      { list: [
        "To operate the product and our services: analyze your marketing performance, generate baseline reports, growth audits, plans, content, and recommendations; schedule and publish content you approve; capture, score, and nurture leads; and measure results.",
        "To improve results within your workspace: the platform learns which content, channels, and campaigns perform for your business.",
        "To process bookings and payments through Stripe.",
        "To send service communications (sign-in links, audit reports, booking confirmations, and reports you enable).",
        "To secure the service and comply with law.",
      ] },
      "AI processing. We use third-party AI models (including Anthropic Claude and Google Gemini) to generate text, images, and video and to analyze your marketing data. Data sent to these providers is used to provide the service, subject to their own API terms and privacy policies.",
      "We do not sell your personal information. We do not use your data for third-party advertising.",
    ],
  },
  {
    title: "3. Google API Services disclosure",
    body: [
      { html: true, text: 'Catalyst Solutions Services\' use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" class="text-[var(--color-brand-soft)] underline hover:text-white">Google API Services User Data Policy</a>, including the Limited Use requirements. Google user data (Search Console and Analytics data) is used only to provide user-facing features you request — performance analysis, baseline reports, SEO recommendations, and dashboards — and is never sold, used for advertising, or transferred except as necessary to provide those features, for security, or to comply with law.' },
    ],
  },
  {
    title: "4. Social platform data",
    body: [
      "Data received from LinkedIn, X, and Meta (Facebook/Instagram) is used solely to provide the features you enable (publishing content you approve, reading performance of your own accounts) in accordance with each platform's developer terms. Disconnecting a channel deletes our stored tokens for it; you can also revoke access from the platform's own security settings at any time.",
    ],
  },
  {
    title: "5. How we protect data",
    body: [
      "OAuth tokens and page credentials are encrypted at rest. Access to decrypted tokens is restricted to internal service calls. Data in transit is protected with TLS. Sessions expire automatically, and sign-in links are single-use and short-lived. Payment details are handled entirely by Stripe, a PCI-DSS compliant processor.",
    ],
  },
  {
    title: "6. Sharing",
    body: [
      "We share data only with: (a) service providers who process it for us (hosting, database, payment processing via Stripe, email delivery via Resend, AI model providers), bound by confidentiality; (b) the marketing platforms you explicitly connect, to perform actions you approve; (c) authorities where legally required. Aggregated, anonymized cross-workspace insights (never your content, leads, or identifiable data) may be used to improve recommendations; you can opt out by contacting us.",
    ],
  },
  {
    title: "7. Retention and deletion",
    body: [
      "We keep your data while your account or engagement is active. You can delete individual projects, disconnect channels (which deletes their tokens), or request full account deletion at info@catalystsolutionservices.com, which we complete within 30 days except where retention is legally required. Lead data you control is deleted on your instruction as processor.",
    ],
  },
  {
    title: "8. Your rights",
    body: [
      "Depending on your location (including under GDPR and India's DPDP Act), you may have rights to access, correct, export, restrict, or delete your personal data, and to object to processing. Contact us at info@catalystsolutionservices.com; we respond within 30 days. If you are a lead or contact whose data a Catalyst Solutions Services customer processes, please contact that business directly — we will assist them in honoring your request.",
    ],
  },
  {
    title: "9. International transfers",
    body: [
      "Data may be processed on servers located outside your country. Where required, we rely on appropriate safeguards such as standard contractual clauses.",
    ],
  },
  {
    title: "10. Children",
    body: [
      "Catalyst Solutions Services is a business tool and is not directed to children under 18. We do not knowingly collect children's data.",
    ],
  },
  {
    title: "11. Changes",
    body: [
      "We will post any changes here and update the date above; material changes will be notified in-product or by email.",
    ],
  },
  {
    title: "12. Contact",
    body: [
      "Catalyst Solutions Services · info@catalystsolutionservices.com",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <section className="px-5 pb-20 pt-16 sm:px-8">
      <div className="mx-auto max-w-[760px]">
        <h1 className="mb-2 text-[clamp(2rem,5vw,44px)] font-extrabold tracking-[-0.03em] text-white">Privacy Policy</h1>
        <p className="mb-8 text-sm text-[var(--color-faint)]">Catalyst Solutions Services · Last updated: August 17, 2026</p>
        <p className="mb-10 text-base leading-[1.7] text-[var(--color-muted)]">
          Catalyst Solutions Services (&quot;we&quot;, &quot;us&quot;) provides an AI-powered growth platform and agency services that help businesses plan, create, publish, and measure their marketing. This policy explains what data we collect, how we use it, and the choices you have. It applies to our website, web application, and APIs at catalystsolutionservices.com.
        </p>
        <div className="flex flex-col gap-8">
          {sections.map((s) => (
            <div key={s.title}>
              <h2 className="mb-3 text-xl font-bold tracking-[-0.02em] text-white">{s.title}</h2>
              <div className="flex flex-col gap-3">
                {s.body.map((b, i) =>
                  typeof b === "string" ? (
                    <p key={i} className="text-[15px] leading-[1.7] text-[var(--color-muted)]">{b}</p>
                  ) : "list" in b ? (
                    <ul key={i} className="flex list-disc flex-col gap-2 pl-5 text-[15px] leading-[1.7] text-[var(--color-muted)]">
                      {b.list.map((li) => <li key={li}>{li}</li>)}
                    </ul>
                  ) : (
                    <p key={i} className="text-[15px] leading-[1.7] text-[var(--color-muted)]" dangerouslySetInnerHTML={{ __html: b.text }} />
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
