import Link from "next/link";
import { redirect } from "next/navigation";
import { currentLosActor } from "@/lib/leados/auth";
import RegisterForm from "./RegisterForm";

export const metadata = { title: "Create account" };

export default async function RegisterPage() {
  if (await currentLosActor()) redirect("/app/dashboard");
  return (
    <>
      <RegisterForm />
      <p className="mt-4 text-center text-[13.5px] text-[var(--los-muted)]">
        Already have an account?{" "}
        <Link href="/app/login" className="font-medium text-[var(--los-brand)]">Sign in</Link>
      </p>
    </>
  );
}
