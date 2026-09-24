import { z } from "zod";

/** Normalises Maldivian numbers to +960XXXXXXX; accepts other E.164 numbers as-is. */
export function normalizePhone(raw: string): string | null {
  const s = raw.replace(/[\s\-()]/g, "");
  if (!s) return null;
  let m = s.match(/^(?:\+?960|00960)?([379]\d{6})$/);
  if (m) return `+960${m[1]}`;
  m = s.match(/^\+[1-9]\d{7,14}$/);
  if (m) return s;
  return null;
}

export const phoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid phone number (e.g. 7xxxxxx)." });
      return z.NEVER;
    }
    return n;
  });

export const optionalPhone = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid phone number (e.g. 7xxxxxx)." });
      return z.NEVER;
    }
    return n;
  });

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);

/** Removes control characters and trims. React escapes output, so HTML is never rendered from user text. */
export function cleanText(s: string, max = 5000): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

export const textField = (min: number, max: number, label: string) =>
  z
    .string()
    .transform((s) => cleanText(s, max + 1))
    .pipe(z.string().min(min, `${label} must be at least ${min} characters.`).max(max, `${label} must be at most ${max} characters.`));

export function formToObject(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !(k in o)) o[k] = v;
  return o;
}

export function firstZodError(e: z.ZodError): string {
  return e.issues[0]?.message ?? "Invalid input.";
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "item";
}
