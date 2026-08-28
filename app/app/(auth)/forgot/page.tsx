import Link from "next/link";
import ForgotForm from "./ForgotForm";

export const metadata = { title: "Reset password" };

export default function ForgotPage() {
  return (
    <>
      <ForgotForm />
      <p className="mt-4 text-center text-[13.5px] text-[var(--los-muted)]">
        <Link href="/app/login" className="font-medium text-[var(--los-brand)]">Back to sign in</Link>
      </p>
    </>
  );
}
