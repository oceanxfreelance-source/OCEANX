import { redirect } from "next/navigation";
import { ActionForm, Field, SubmitButton } from "@/components/ui/form";
import { adminVerifyAction, resendAdminCodeAction } from "@/app/actions/auth";
import { getSession } from "@/lib/auth/session";

export const metadata = { title: "Admin sign-in", robots: { index: false } };

export default async function AdminVerifyPage() {
  const session = await getSession();
  if (!session?.user.adminRole) redirect("/");
  if (session.mfaVerified) redirect("/admin");
  return (
    <div className="card p-6">
      <h1 className="text-2xl font-bold">Two-step sign-in</h1>
      <p className="mb-5 mt-1 text-sm text-slate-600">Enter the 6-digit code we emailed to {session.user.email} to open the admin dashboard.</p>
      <ActionForm action={adminVerifyAction}>
        <Field label="Code" name="code">
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required className="input text-center text-2xl tracking-[0.5em]" />
        </Field>
        <SubmitButton className="btn-primary w-full">Continue</SubmitButton>
      </ActionForm>
      <ActionForm action={resendAdminCodeAction} className="mt-3">
        <SubmitButton className="btn-ghost w-full">Send a new code</SubmitButton>
      </ActionForm>
    </div>
  );
}
