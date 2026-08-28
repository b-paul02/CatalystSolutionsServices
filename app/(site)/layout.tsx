import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

// Marketing-site chrome. LeadOS (app/app, served on app.catalystsolutionservices.com)
// deliberately sits outside this group and gets none of it.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-[var(--color-brand-strong)] focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <Nav />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}
