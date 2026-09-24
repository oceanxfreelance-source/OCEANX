import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { acceptTermsAction } from "@/app/actions/auth";
import { getSession } from "@/lib/auth/session";
import { pendingTermsFor } from "@/lib/services/users";

export const metadata = { title: "Updated terms" };

export default async function AcceptTermsPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const pending = await pendingTermsFor(session.userId);
  if (pending.length === 0) redirect(sp.next ?? "/account");
  return (
    <div className="card p-6">
      <h1 className="text-2xl font-bold">We&apos;ve updated our policies</h1>
      <p className="mb-4 mt-1 text-sm text-slate-600">Please review and accept to continue using your account.</p>
      <ul className="mb-4 list-disc pl-5 text-sm">
        {pending.map((d) => (
          <li key={d.id}>
            <Link href={d.type === "TERMS" ? "/terms" : "/privacy"} target="_blank" className="text-ocean-700 underline">
              {d.title}
            </Link>{" "}
            (version {d.version})
          </li>
        ))}
      </ul>
      <ActionForm action={acceptTermsAction}>
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="accept" className="h-5 w-5 accent-ocean-700" required /> I have read and accept the updated documents.
        </label>
        <SubmitButton className="btn-primary w-full">Accept and continue</SubmitButton>
      </ActionForm>
    </div>
  );
}
