import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://catalystsolutionservices.com"),
  title: {
    default: "Catalyst Solutions Services — AI-Enabled Digital Growth Agency",
    template: "%s — Catalyst Solutions Services",
  },
  description:
    "Catalyst Solutions Services combines strategy, technology, marketing, automation, and AI-enabled execution to build high-performing digital growth systems.",
  openGraph: {
    title: "Catalyst Solutions Services — AI-Enabled Digital Growth Agency",
    description: "Strategy, technology, marketing, automation, and AI-enabled execution for sustainable growth.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        {/* Material Symbols icon font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0"
        />
      </head>
      <body className="overflow-x-hidden antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-[var(--color-brand-strong)] focus:px-4 focus:py-2 focus:text-white">
          Skip to content
        </a>
        <Nav />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
