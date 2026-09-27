"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// ponytail: router.refresh() every 5 s is the whole "live" inbox; move to an API poll if the page grows heavy.
export default function Poll() {
  const router = useRouter();
  useEffect(() => { const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 5000); return () => clearInterval(t); }, [router]);
  return null;
}
