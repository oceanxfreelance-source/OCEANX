import { ActionForm, Field, SubmitButton } from "@/components/ui/form";
import { forgotPasswordAction } from "@/app/actions/auth";
import { emailDeliveryAvailable } from "@/lib/messaging-providers";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  if (!emailDeliveryAvailable())
    return (
      <div className="card p-6">
        <h1 className="text-2xl font-bold">Forgot your password?</h1>
        <p className="mt-2 text-sm text-slate-600">Password reset by email isn&apos;t available yet. Please contact MV Markets support to reset your password.</p>
      </div>
    );
  return (
    <div className="card p-6">
      <h1 className="text-2xl font-bold">Forgot your password?</h1>
      <p className="mb-5 mt-1 text-sm text-slate-600">Enter your email and we&apos;ll send you a code to reset it.</p>
      <ActionForm action={forgotPasswordAction}>
        <Field label="Email" name="email">
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </Field>
        <SubmitButton className="btn-primary w-full">Send code</SubmitButton>
      </ActionForm>
    </div>
  );
}
