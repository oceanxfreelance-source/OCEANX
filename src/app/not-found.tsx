import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-5xl font-semibold tracking-tight text-slate-300">404</p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-slate-600">This page drifted out to sea. It may have been removed or never existed.</p>
      <Link href="/" className="btn-primary mt-6">Back to MV Markets</Link>
    </div>
  );
}
