"use client";

// ponytail: PDF export = the browser's print-to-PDF, driven by a print stylesheet. No pdf lib.
export default function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-ghost px-4 py-2.5 text-[13px] print:hidden">
      Save as PDF
    </button>
  );
}
