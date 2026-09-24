import { FileCheck2, Lock } from "lucide-react";

/** File + note inputs for proof of sale (used when requesting SOLD and when re-sending proof). */
export function ProofFields({ max }: { max: number }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="label" htmlFor="proof">Proof of sale</label>
        <p className="mb-2 text-xs leading-relaxed text-slate-500">
          Add up to {max} photos or PDFs that show the sale happened. For example: the buyer&apos;s transfer screenshot, a receipt, a photo of the handover, or a chat where the buyer confirms.
        </p>
        <label htmlFor="proof" className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line-strong bg-slate-50 px-4 py-6 text-center transition hover:border-ocean-400">
          <FileCheck2 className="h-7 w-7 text-ocean-700" strokeWidth={1.75} />
          <span className="text-sm font-medium text-slate-900">Tap to choose files</span>
          <input id="proof" name="proof" type="file" multiple required accept="image/*,application/pdf" className="block w-full max-w-xs text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-ocean-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white" />
        </label>
      </div>
      <div>
        <label className="label" htmlFor="proofNote">Note for our team <span className="font-normal text-slate-400">(optional)</span></label>
        <textarea id="proofNote" name="proofNote" rows={2} maxLength={500} className="input" placeholder="e.g. Paid by BML transfer on 12 Oct, collected in Hulhumalé" />
      </div>
      <p className="flex items-center gap-1.5 text-xs text-slate-500"><Lock className="h-3.5 w-3.5" /> Only the OceanX team can see your proof. It is never shown on your listing.</p>
    </div>
  );
}
