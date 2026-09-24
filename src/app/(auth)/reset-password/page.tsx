import { ActionForm, Field, SubmitButton } from "@/components/ui/form";
import { resetPasswordAction } from "@/app/actions/auth";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="card p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mb-5 mt-1 text-sm text-slate-600">If an account exists for this email, we sent it a 6-digit code.</p>
      <ActionForm action={resetPasswordAction}>
        <Field label="Email" name="email">
          <input id="email" name="email" type="email" defaultValue={sp.email ?? ""} required className="input" />
        </Field>
        <Field label="Code" name="code">
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required className="input tracking-widest" />
        </Field>
        <Field label="New password" name="password">
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className="input" />
        </Field>
        <Field label="Confirm new password" name="confirm">
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required className="input" />
        </Field>
        <SubmitButton className="btn-primary w-full">Update password</SubmitButton>
      </ActionForm>
    </div>
  );
}
