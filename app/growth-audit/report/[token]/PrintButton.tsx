"use client";

import { useEffect } from "react";

// ponytail: PDF export = the browser's print-to-PDF, driven by a print stylesheet. No pdf lib.
// Collapsed <details> print as collapsed — open them all for print, restore after.
function openAllDetails() {
  const closed = [...document.querySelectorAll("details:not([open])")];
  closed.forEach((d) => d.setAttribute("open", ""));
  return () => closed.forEach((d) => d.removeAttribute("open"));
}

export default function PrintButton() {
  useEffect(() => {
    let restore: (() => void) | null = null;
    const before = () => { restore = openAllDetails(); };
    const after = () => { restore?.(); restore = null; };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => { window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
  }, []);

  return (
    <button type="button" onClick={() => window.print()} className="btn-ghost px-4 py-2.5 text-[13px] print:hidden">
      Save as PDF
    </button>
  );
}
