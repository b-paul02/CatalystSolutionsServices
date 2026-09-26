"use client";

import { useEffect } from "react";

// WP-12 · inside an embed iframe: tell the parent page our height whenever it changes. Height only — nothing else.
export default function EmbedResize({ id }: { id: string }) {
  useEffect(() => {
    if (window.parent === window) return;
    const send = () => window.parent.postMessage({ type: "cgo-form-height", id, height: document.documentElement.scrollHeight }, "*");
    send();
    const ro = new ResizeObserver(send);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [id]);
  return null;
}
