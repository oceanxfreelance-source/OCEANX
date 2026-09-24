import type { Settings } from "@/lib/settings";
import { formatMVR } from "@/lib/money";
import { ActionForm, Field, SubmitButton } from "./ui/form";
import { SlipInput } from "./Pickers";
import { submitSlipAction } from "@/app/actions/sell";

export function BankDetails({ payment, amount }: { payment: Settings["payment"]; amount: number }) {
  return (
    <div className="rounded-2xl bg-slate-900 p-4 text-white">
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
  const today = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
  return (
    <ActionForm action={submitSlipAction}>
      <input type="hidden" name="purpose" value={purpose} />
      <input type="hidden" name="targetId" value={targetId} />
      <Field label="Payment slip (screenshot or PDF)" name="slip" hint="Max 4 MB. Make sure the amount, date and reference number are readable.">
        <SlipInput />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Transaction reference number" name="referenceNumber">
          <input id="referenceNumber" name="referenceNumber" required minLength={3} maxLength={64} className="input font-mono" placeholder="e.g. BLAZ123456789" />
        </Field>
        <Field label="Payment date" name="paidAt">
          <input id="paidAt" name="paidAt" type="date" required defaultValue={today} max={today} className="input" />
        </Field>
        <Field label="Amount paid (MVR)" name="amountPaid">
          <input id="amountPaid" name="amountPaid" inputMode="decimal" className="input" />
        </Field>
        <Field label="Paid from (account name)" name="payerName">
          <input id="payerName" name="payerName" maxLength={100} className="input" />
        </Field>
        <Field label="Your bank / wallet" name="bankName">
          <input id="bankName" name="bankName" maxLength={60} className="input" placeholder="BML, MIB, mFaisaa…" />
        </Field>
        <Field label="Account number (optional)" name="payerAccount">
          <input id="payerAccount" name="payerAccount" maxLength={40} className="input" />
        </Field>
      </div>
      <Field label="Note (optional)" name="note">
        <textarea id="note" name="note" rows={2} maxLength={500} className="input" />
      </Field>
      <SubmitButton className="btn-primary w-full" pendingText="Uploading & checking…">Submit payment for verification</SubmitButton>
      <p className="text-center text-xs text-slate-500">Slips are stored privately and only seen by you and the OceanX payments team.</p>
    </ActionForm>
  );
}
