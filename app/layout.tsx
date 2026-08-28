import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

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
      <body className="overflow-x-hidden antialiased">{children}</body>
    </html>
  );
}
