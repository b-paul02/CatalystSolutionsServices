import { db } from "@/lib/audit/db";
import { REQUESTABLE_FIELDS } from "@/lib/partner/application-fields";
import EditForm from "./EditForm";

export const metadata = { title: "Update your application", robots: { index: false } };

export default async function EditPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const app = await db.partnerApplication.findUnique({ where: { statusToken: token } });

  const requested: string[] = app?.requestedFields ? JSON.parse(app.requestedFields) : [];
  const open = app && !app.deletedAt && app.status === "waiting_on_applicant" && requested.length > 0;

  if (!open) {
    return (
      <Shell title="Nothing to update">
        <p className="text-[15px] leading-[1.6] text-[var(--color-muted)]">
          There is no open request for more information on this application. If you think that is wrong, reply to the
          email we sent you and we will sort it out.
        </p>
      </Shell>
    );
  }

  // Only the fields the admin named are sent to the browser, and the action
  // re-checks the list server-side before writing anything.
  const fields = REQUESTABLE_FIELDS.filter((f) => requested.includes(f.key));
  const values = Object.fromEntries(
    fields.map((f) => [f.key, (app as unknown as Record<string, unknown>)[f.key] ?? ""]),
  ) as Record<string, string | number>;

  return (
    <Shell title="Update your application">
      <p className="mb-6 text-[15px] leading-[1.6] text-[var(--color-muted)]">
        We have asked for a little more detail. Only the parts below can be changed — the rest of your application stays as you submitted it.
      </p>
      <EditForm token={token} fields={fields} values={values} />
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-5 py-20 sm:px-8">
      <div className="mx-auto w-full max-w-[640px]">
        <h1 className="mb-4 text-[28px] font-bold text-white">{title}</h1>
        <div className="card">{children}</div>
      </div>
    </section>
  );
}
