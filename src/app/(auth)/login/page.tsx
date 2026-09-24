import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, Field, SubmitButton } from "@/components/ui/form";
import { loginAction } from "@/app/actions/auth";
import { getSession } from "@/lib/auth/session";
import { safeNext } from "@/lib/action";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const sp = await searchParams;
  if (await getSession()) redirect(safeNext(sp.next, "/"));
  return (
    <div className="card p-6">
      <h1 className="text-2xl font-bold">Welcome back</h1>
      <p className="mb-5 mt-1 text-sm text-slate-600">Log in to buy, sell and chat on MV Markets.</p>
      {sp.reset && <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Password updated. Please log in.</p>}
      <ActionForm action={loginAction}>
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <Field label="Email or username" name="email">
          <input id="email" name="email" type="text" autoComplete="username" autoCapitalize="none" required className="input" />
        </Field>
        <Field label="Password" name="password">
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
        </Field>
        <SubmitButton className="btn-primary w-full">Log in</SubmitButton>
      </ActionForm>
      <div className="mt-4 flex justify-between text-sm">
        <Link href="/forgot-password" className="text-ocean-700 hover:underline">
          Forgot password?
        </Link>
        <Link href={`/register${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ""}`} className="font-semibold text-ocean-700 hover:underline">
          Create account
        </Link>
      </div>
    </div>
  );
}
