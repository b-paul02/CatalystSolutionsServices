import { requireOrgPage } from "@/lib/os/guard";
import NewLeadForm from "./NewLeadForm";

export const metadata = { title: "Add lead" };

export default async function NewLeadPage() {
  await requireOrgPage("leads.edit");
  return (
    <div className="max-w-[640px]">
      <h1 className="mb-4 text-[22px] font-extrabold tracking-tight">Add a lead</h1>
      <NewLeadForm />
    </div>
  );
}
