import clsx from "clsx";

export function VipBadge({ label = "VIP", size = "sm" }: { label?: string; size?: "sm" | "md" }) {
  return (
    <span className={clsx("chip bg-gradient-to-r from-gold-400 to-gold-500 text-amber-950 shadow-sm", size === "md" && "px-3 py-1 text-sm")} title="VIP seller">
      ★ {label}
    </span>
  );
}

export function StarsBadge({ stars }: { stars: number }) {
  return (
    <span className="chip bg-amber-50 text-amber-700 ring-1 ring-amber-200" title={`${stars} Stars`}>
      ⭐ {stars}
    </span>
  );
}

export function LevelBadge({ level }: { level: { name: string; badge: string; color: string } | null | undefined }) {
  if (!level) return null;
  return (
    <span className="chip text-white" style={{ backgroundColor: level.color }}>
      {level.badge} {level.name}
    </span>
  );
}

export function SoldBadge() {
  return <span className="chip bg-slate-900 text-white">SOLD</span>;
}

export function VerifiedBadge() {
  return <span className="chip bg-emerald-100 text-emerald-800">✓ Verified</span>;
}

const statusStyles: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  PENDING_PAYMENT: "bg-amber-100 text-amber-800",
  PAYMENT_REVIEW: "bg-sky-100 text-sky-800",
  PUBLISHED: "bg-emerald-100 text-emerald-800",
  SOLD: "bg-slate-900 text-white",
  WITHDRAWN: "bg-orange-100 text-orange-800",
  REMOVED: "bg-red-100 text-red-800",
  REJECTED: "bg-red-100 text-red-800",
  PENDING: "bg-sky-100 text-sky-800",
  AI_CHECKING: "bg-violet-100 text-violet-800",
  VERIFIED: "bg-emerald-100 text-emerald-800",
  NEEDS_REVIEW: "bg-amber-100 text-amber-800",
  REFUNDED: "bg-slate-200 text-slate-700",
  CANCELLED: "bg-slate-100 text-slate-500",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  EXPIRED: "bg-slate-200 text-slate-700",
  SUSPENDED: "bg-red-100 text-red-800",
  BANNED: "bg-red-200 text-red-900",
  PENDING_APPROVAL: "bg-amber-100 text-amber-800",
  NONE: "bg-slate-100 text-slate-500",
  UNPAID: "bg-red-100 text-red-800",
  PAID: "bg-emerald-100 text-emerald-800",
  WAIVED: "bg-slate-100 text-slate-600",
  PAYMENT_SUBMITTED: "bg-sky-100 text-sky-800",
  PENDING_EXCEPTION: "bg-amber-100 text-amber-800",
  OPEN: "bg-amber-100 text-amber-800",
  REVIEWING: "bg-sky-100 text-sky-800",
  RESOLVED: "bg-emerald-100 text-emerald-800",
  DISMISSED: "bg-slate-100 text-slate-600",
  CONFIRMED: "bg-emerald-100 text-emerald-800",
  UNCONFIRMED: "bg-slate-100 text-slate-700",
  PENDING_CONFIRMATION: "bg-amber-100 text-amber-800",
  DISPUTED: "bg-red-100 text-red-800",
  VOIDED: "bg-slate-200 text-slate-600",
  APPROVED: "bg-emerald-100 text-emerald-800",
  WITHHELD: "bg-red-100 text-red-800",
  CALCULATED: "bg-sky-100 text-sky-800",
};

const statusLabels: Record<string, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PAYMENT_REVIEW: "Payment under review",
  PUBLISHED: "Live",
  AI_CHECKING: "Checking",
  NEEDS_REVIEW: "Needs review",
  PENDING: "Pending review",
  PENDING_APPROVAL: "Awaiting approval",
  PAYMENT_SUBMITTED: "Payment submitted",
  PENDING_EXCEPTION: "Exception requested",
  PENDING_CONFIRMATION: "Awaiting buyer",
  REJECTED: "Payment not verified",
};

export function StatusBadge({ status, labels }: { status: string; labels?: Record<string, string> }) {
  const label = labels?.[status] ?? statusLabels[status] ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
  return <span className={clsx("chip", statusStyles[status] ?? "bg-slate-100 text-slate-700")}>{label}</span>;
}
