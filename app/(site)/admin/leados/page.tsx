import { redirect } from "next/navigation";

// LeadOS is the Lead Supply module of GrowthOS — one command center at /admin/os.
// Sub-pages (/admin/leados/datasets, …) keep their URLs.
export default function LeadosAdminPage() {
  redirect("/admin/os");
}
