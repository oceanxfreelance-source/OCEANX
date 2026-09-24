import { redirect } from "next/navigation";
import { ActionForm, Field, SubmitButton } from "@/components/ui/form";
import { verifyEmailAction, resendVerificationAction } from "@/app/actions/auth";
import { getSession } from "@/lib/auth/session";
import { safeNext } from "@/lib/action";

export const metadata = { title: "Verify your email" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.emailVerifiedAt) redirect(safeNext(sp.next, "/account"));
  return (
    <div className="card p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
      <p className="mb-5 mt-1 text-sm text-slate-600">
        We sent a 6-digit code to <strong>{session.user.email}</strong>. Enter it below to verify your account.
      </p>
      <ActionForm action={verifyEmailAction}>
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <Field label="Verification code" name="code">
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required className="input text-center text-2xl tracking-[0.5em]" />
        </Field>
        <SubmitButton className="btn-primary w-full">Verify</SubmitButton>
      </ActionForm>
      <ActionForm action={resendVerificationAction} className="mt-3">
        <SubmitButton className="btn-ghost w-full">Send a new code</SubmitButton>
      </ActionForm>
    </div>
  );
}
