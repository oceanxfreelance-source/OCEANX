import Anthropic from "@anthropic-ai/sdk";

/**
 * AI-assisted payment slip reading. The model only EXTRACTS what is printed on the slip;
 * all comparisons and flags are computed in code (see payments.ts). The result never
 * accuses anyone of anything — it only decides whether a human should take a closer look.
 */

export type SlipExtraction = {
  is_payment_receipt: boolean;
  amount: number | null;
  currency: string | null;
  reference_number: string | null;
  transaction_date: string | null;
  recipient_account: string | null;
  recipient_name: string | null;
  payer_name: string | null;
  bank_name: string | null;
  confidence: number;
  notes: string;
};

export type ExtractionResult =
  | { ok: true; model: string; data: SlipExtraction }
  | { ok: false; reason: string; model?: string };

const schema = {
  type: "object",
  additionalProperties: false,
  required: [
    "is_payment_receipt",
    "amount",
    "currency",
    "reference_number",
    "transaction_date",
    "recipient_account",
    "recipient_name",
    "payer_name",
    "bank_name",
    "confidence",
    "notes",
  ],
  properties: {
    is_payment_receipt: { type: "boolean", description: "True if the document is a bank transfer receipt / payment confirmation." },
    amount: { type: ["number", "null"], description: "Transferred amount as a number, without currency symbols." },
    currency: { type: ["string", "null"], description: "Currency code, e.g. MVR or USD." },
    reference_number: { type: ["string", "null"], description: "Transaction / reference number exactly as printed." },
    transaction_date: { type: ["string", "null"], description: "Transaction date as YYYY-MM-DD." },
    recipient_account: { type: ["string", "null"], description: "Beneficiary / 'to' account number exactly as printed (may be partially masked)." },
    recipient_name: { type: ["string", "null"], description: "Beneficiary / 'to' account name." },
    payer_name: { type: ["string", "null"], description: "Sender / 'from' account name." },
    bank_name: { type: ["string", "null"], description: "Bank or wallet that issued the receipt." },
    confidence: { type: "number", description: "0-1: how legible and complete the receipt is and how sure you are of the extracted values." },
    notes: { type: "string", description: "Short neutral note about legibility or anything that could not be read. No judgement about the sender." },
  },
} as const;

export function aiConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function extractSlip(file: { buffer: Buffer; mimeType: string }): Promise<ExtractionResult> {
  if (!aiConfigured()) return { ok: false, reason: "AI provider not configured" };
  const model = process.env.AI_MODEL || "claude-opus-5";
  const client = new Anthropic({ timeout: 45_000, maxRetries: 1 });

  const media: Anthropic.Beta.BetaContentBlockParam =
    file.mimeType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.buffer.toString("base64") } }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: file.mimeType as "image/webp" | "image/png" | "image/jpeg" | "image/gif",
            data: file.buffer.toString("base64"),
          },
        };

  try {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      system:
        "You read bank transfer receipts from Maldivian banks and wallets (e.g. Bank of Maldives, MIB, CBM, mFaisaa, Ooredoo m-Faisaa, Dhiraagu Pay). Extract only what is printed. Use null for anything missing or unreadable. Do not guess.",
      messages: [
        {
          role: "user",
          content: [media, { type: "text", text: "Extract the payment details from this receipt." }],
        },
      ],
    });

    if (response.stop_reason === "refusal") return { ok: false, reason: "AI declined to read this document", model };
    if (response.stop_reason === "max_tokens") return { ok: false, reason: "AI response was incomplete", model };
    const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text;
    if (!text) return { ok: false, reason: "AI returned no result", model };
    const data = JSON.parse(text) as SlipExtraction;
    data.confidence = Math.max(0, Math.min(1, Number(data.confidence) || 0));
    return { ok: true, model: response.model, data };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return { ok: false, reason: "AI rate limited", model };
    if (error instanceof Anthropic.APIError) return { ok: false, reason: `AI error ${error.status ?? ""}`.trim(), model };
    if (error instanceof SyntaxError) return { ok: false, reason: "AI returned unreadable output", model };
    return { ok: false, reason: "AI request failed", model };
  }
}

// Test seam: allows unit tests to inject deterministic extraction results.
let extractorOverride: ((file: { buffer: Buffer; mimeType: string }) => Promise<ExtractionResult>) | null = null;
export function setSlipExtractorForTests(fn: typeof extractorOverride) {
  extractorOverride = fn;
}
export async function runSlipExtraction(file: { buffer: Buffer; mimeType: string }): Promise<ExtractionResult> {
  return extractorOverride ? extractorOverride(file) : extractSlip(file);
}
