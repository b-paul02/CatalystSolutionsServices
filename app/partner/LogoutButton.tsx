"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="text-[12.5px] text-[var(--color-muted)] hover:text-white"
      onClick={async () => {
        await fetch("/api/partner/login", { method: "DELETE" });
        router.push("/partner/login");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
