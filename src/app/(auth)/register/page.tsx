import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, Field, SubmitButton } from "@/components/ui/form";
import { registerAction } from "@/app/actions/auth";
import { getSession } from "@/lib/auth/session";

export const metadata = { title: "Create account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string; ref?: string }> }) {
  const sp = await searchParams;
  if (await getSession()) redirect("/account");
  return (
    <div className="card p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mb-5 mt-1 text-sm text-slate-600">Free to join. Buy from sellers across all atolls.</p>
      <ActionForm action={registerAction}>
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <Field label="Full name" name="name">
          <input id="name" name="name" autoComplete="name" required minLength={2} maxLength={60} className="input" />
        </Field>
        <Field label="Email" name="email" hint="We'll send a 6-digit code to verify it.">
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </Field>
        <Field label="Mobile number (optional)" name="phone" hint="e.g. 7xxxxxx — used when you choose to show it on listings.">
          <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" className="input" placeholder="7xxxxxx" />
        </Field>
        <Field label="Password" name="password" hint="At least 8 characters with letters and numbers.">
          <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="input" />
        </Field>
        <Field label="Confirm password" name="confirm">
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} className="input" />
        </Field>
        <Field label="Referral code (optional)" name="ref">
          <input id="ref" name="ref" defaultValue={sp.ref ?? ""} className="input uppercase" maxLength={20} />
        </Field>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" name="acceptTerms" required className="mt-1 h-5 w-5 accent-ocean-700" />
          <span>
            I agree to the{" "}
            <Link href="/terms" target="_blank" className="text-ocean-700 underline">
              Terms of Use
            </Link>{" "}
            and{" "}
            <Link href="/privacy" target="_blank" className="text-ocean-700 underline">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        <SubmitButton className="btn-primary w-full">Create account</SubmitButton>
      </ActionForm>
      <p className="mt-4 text-center text-sm">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-ocean-700 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
