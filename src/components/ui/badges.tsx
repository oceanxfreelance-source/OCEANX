import clsx from "clsx";
import { BadgeCheck, Crown, Star } from "lucide-react";

export function VipBadge({ label = "VIP", size = "sm" }: { label?: string; size?: "sm" | "md" }) {
  return (
    <span className={clsx("chip bg-slate-900 text-gold-400 ring-1 ring-gold-500/40", size === "md" && "px-2.5 py-1 text-xs")} title="VIP seller">
      <Crown className={size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} strokeWidth={2.25} /> {label}
    </span>
  );
}

export function StarsBadge({ stars }: { stars: number }) {
  return (
    <span className="chip bg-amber-50 text-amber-800 ring-1 ring-amber-200/70" title={`${stars} Stars`}>
      <Star className="h-3 w-3 fill-amber-500 text-amber-500" /> {stars}
    </span>
  );
}

export function LevelBadge({ level }: { level: { name: string; badge: string; color: string } | null | undefined }) {
  if (!level) return null;
  return (
    <span className="chip bg-white text-slate-700 ring-1 ring-slate-200">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: level.color }} />
      {level.name}
    </span>
  );
}

export function SoldBadge() {
  return <span className="chip bg-slate-900 text-white">Sold</span>;
}

export function VerifiedBadge() {
  return (
    <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
      <BadgeCheck className="h-3 w-3" /> Verified
    </span>
  );
}

const tone = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warn: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-red-50 text-red-700 ring-red-200",
  dark: "bg-slate-900 text-white ring-slate-900",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
};

const statusTone: Record<string, keyof typeof tone> = {
  DRAFT: "neutral",
  PENDING_PAYMENT: "warn",
  PAYMENT_REVIEW: "info",
  PUBLISHED: "success",
  SOLD: "dark",
  WITHDRAWN: "warn",
  REMOVED: "danger",
  REJECTED: "danger",
  PENDING: "info",
  AI_CHECKING: "violet",
  VERIFIED: "success",
  NEEDS_REVIEW: "warn",
  REFUNDED: "neutral",
  CANCELLED: "neutral",
  ACTIVE: "success",
  EXPIRED: "neutral",
  SUSPENDED: "danger",
  BANNED: "danger",
  PENDING_APPROVAL: "warn",
  NONE: "neutral",
  UNPAID: "danger",
  PAID: "success",
  WAIVED: "neutral",
  PAYMENT_SUBMITTED: "info",
  PENDING_EXCEPTION: "warn",
  OPEN: "warn",
  REVIEWING: "info",
  RESOLVED: "success",
  DISMISSED: "neutral",
  CONFIRMED: "success",
  UNCONFIRMED: "neutral",
  PENDING_CONFIRMATION: "warn",
  DISPUTED: "danger",
  VOIDED: "neutral",
  APPROVED: "success",
  WITHHELD: "danger",
  CALCULATED: "info",
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
  return <span className={clsx("chip ring-1", tone[statusTone[status] ?? "neutral"])}>{label}</span>;
}
