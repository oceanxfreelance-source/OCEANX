import type { Settings } from "@/lib/settings";
import { formatMVR } from "@/lib/money";
import { ActionForm, Field, SubmitButton } from "./ui/form";
import { SlipInput } from "./Pickers";
import { submitSlipAction } from "@/app/actions/sell";

export function BankDetails({ payment, amount }: { payment: Settings["payment"]; amount: number }) {
  return (
    <div className="rounded-2xl bg-ink p-4 text-white">
      <p className="text-xs uppercase tracking-wider text-slate-400">Transfer exactly</p>
      <p className="text-3xl font-semibold tracking-tight">{formatMVR(amount)}</p>
      <dl className="mt-3 grid gap-1 text-sm">
        <div className="flex justify-between gap-2"><dt className="text-slate-400">Bank</dt><dd className="font-medium">{payment.bankName}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-slate-400">Account name</dt><dd className="font-medium">{payment.accountName}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-slate-400">Account no.</dt><dd className="select-all font-mono font-semibold">{payment.accountNumber}</dd></div>
      </dl>
      {payment.secondaryAccountNumber && (
        <dl className="mt-3 grid gap-1 border-t border-white/10 pt-3 text-sm">
          <div className="flex justify-between gap-2"><dt className="text-slate-400">Or: {payment.secondaryBankName}</dt><dd className="font-medium">{payment.secondaryAccountName}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-slate-400">Account no.</dt><dd className="select-all font-mono font-semibold">{payment.secondaryAccountNumber}</dd></div>
        </dl>
      )}
      <p className="mt-3 text-xs text-slate-300">{payment.instructions}</p>
    </div>
  );
}

export function PaymentForm({ purpose, targetId }: { purpose: "LISTING_FEE" | "CANCELLATION_FINE" | "BUSINESS_SUBSCRIPTION"; targetId: string }) {
  return (
    <ActionForm action={submitSlipAction}>
      <input type="hidden" name="purpose" value={purpose} />
      <input type="hidden" name="targetId" value={targetId} />
      <Field label="Upload your payment slip" name="slip" hint="A screenshot or PDF of the transfer receipt (max 4 MB). Make sure the amount and reference are readable.">
        <SlipInput />
      </Field>
      <SubmitButton className="btn-accent w-full" pendingText="Uploading…">Submit payment</SubmitButton>
      <p className="text-center text-xs text-slate-500">Slips are stored privately and only seen by you and the OceanX payments team.</p>
    </ActionForm>
  );
}
