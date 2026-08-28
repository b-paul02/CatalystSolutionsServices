import Link from "next/link";
import Icon from "@/components/Icon";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

// Root-level so it catches ALL unmatched URLs (a (site)-grouped not-found
// wouldn't). Carries the marketing chrome itself since the root layout is bare.
export default function NotFound() {
  return (
    <>
      <Nav />
      <section className="relative flex min-h-[60vh] items-center justify-center overflow-hidden px-5 py-24 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_50%_at_50%_30%,rgba(124,58,237,0.22),transparent_65%)]" />
      <div className="relative">
        <div className="mb-4 text-[clamp(4rem,12vw,90px)] font-extrabold tracking-[-0.03em] text-white">404</div>
        <p className="mb-8 text-[17px] text-[var(--color-muted)]">This page took a wrong turn. Let's get you back on track.</p>
        <Link href="/" className="btn-primary">Back to Home <Icon name="arrow_forward" className="text-[19px]" /></Link>
      </div>
      </section>
      <Footer />
    </>
  );
}
