/**
 * Outbound email / SMS. Providers are selected by environment variables so the same
 * code runs locally (console logging) and in production (real delivery).
 *
 * Email: RESEND_API_KEY + EMAIL_FROM  (https://resend.com HTTP API)
 * SMS:   SMS_PROVIDER=twilio + TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM
 *        SMS_PROVIDER=webhook + SMS_WEBHOOK_URL (+ SMS_WEBHOOK_TOKEN) for local Maldivian gateways
 */

export type Outbox = { channel: "email" | "sms"; to: string; subject?: string; body: string }[];

// Captured messages when running tests.
export const testOutbox: Outbox = [];

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  if (process.env.NODE_ENV === "test") {
    testOutbox.push({ channel: "email", to, subject, body: text });
    return true;
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV !== "production") console.info(`[email:dev] to=${to} subject="${subject}"\n${text}`);
    else console.warn("[email] RESEND_API_KEY not configured; email not sent");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "MV Markets <no-reply@mvmarkets.mv>",
        to: [to],
        subject,
        text,
        html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">${escapeHtml(text).replace(/\n/g, "<br>")}</div>`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) console.error("[email] send failed", res.status);
    return res.ok;
  } catch (e) {
    console.error("[email] send error", e);
    return false;
  }
}

export async function sendSms(to: string, body: string): Promise<boolean> {
  if (process.env.NODE_ENV === "test") {
    testOutbox.push({ channel: "sms", to, body });
    return true;
  }
  const provider = process.env.SMS_PROVIDER;
  try {
    if (provider === "twilio") {
      const sid = process.env.TWILIO_ACCOUNT_SID!;
      const token = process.env.TWILIO_AUTH_TOKEN!;
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM || "", Body: body }),
        signal: AbortSignal.timeout(10000),
      });
      return res.ok;
    }
    if (provider === "webhook" && process.env.SMS_WEBHOOK_URL) {
      const res = await fetch(process.env.SMS_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.SMS_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.SMS_WEBHOOK_TOKEN}` } : {}),
        },
        body: JSON.stringify({ to, message: body }),
        signal: AbortSignal.timeout(10000),
      });
      return res.ok;
    }
  } catch (e) {
    console.error("[sms] send error", e);
    return false;
  }
  if (process.env.NODE_ENV !== "production") console.info(`[sms:dev] to=${to}\n${body}`);
  else console.warn("[sms] SMS provider not configured; SMS not sent");
  return false;
}

export function smsConfigured() {
  return process.env.SMS_PROVIDER === "twilio" || (process.env.SMS_PROVIDER === "webhook" && !!process.env.SMS_WEBHOOK_URL);
}

/**
 * True when emails can actually be delivered. When false, email-code steps (sign-up verification,
 * admin sign-in code) are skipped so the marketplace still works; they switch on automatically
 * once RESEND_API_KEY is configured. Tests always behave as if email is available.
 */
export function emailDeliveryAvailable() {
  if (process.env.NODE_ENV === "test") return process.env.TEST_DISABLE_EMAIL !== "1";
  return !!process.env.RESEND_API_KEY;
}
