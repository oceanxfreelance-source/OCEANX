import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Markdown } from "@/components/Markdown";
import { formatDate } from "@/lib/dates";

export const metadata = { title: "Terms of use" };

export default async function TermsPage() {
  const doc = await prisma.termsDocument.findFirst({ where: { type: "TERMS", isCurrent: true } });
  if (!doc) notFound();
  return (
    <article className="card mx-auto max-w-3xl p-6">
      <Markdown source={doc.content} />
      <p className="mt-6 text-xs text-slate-500">Version {doc.version} · Published {formatDate(doc.publishedAt)}</p>
    </article>
  );
}
