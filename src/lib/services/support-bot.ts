import Anthropic from "@anthropic-ai/sdk";
import { aiConfigured } from "./ai-screening";

/**
 * The help assistant: answers basic questions about using MV Markets.
 * Uses Claude when ANTHROPIC_API_KEY is set, otherwise a built-in FAQ. It never makes promises about
 * money, refunds or account decisions — for those it points customers to "Talk to a person".
 */

export type BotTurn = { role: "user" | "assistant"; content: string };

const SITE_GUIDE = `
MV Markets (by OceanX) is a Maldivian online marketplace. People across the Maldives post items for sale; buyers contact sellers directly.
- Buying is free: browse, search, save items (heart), and chat with sellers. Buyer and seller agree on payment themselves (cash, transfer…). MV Markets does not handle the money for the item and takes no share of the sale price.
- Search: type what you want ("car", "iPhone"); search also covers categories. Use category buttons and "Filters & sort" (price, atoll, condition, VIP sellers, include sold). "All items" tab shows everything.
- Contact a seller: open the item → Message (in-app chat), or Call / WhatsApp if shown. Chats are under "Chats".
- Sell: tap the blue + / "Post a listing". 4 steps: Photos (first photo is the cover), Details (title, category, price in MVR, condition, description), Location (optional), Contact. Then Preview.
- Publishing: the last step shows the bank account; pay by bank transfer, upload a screenshot/PDF of the slip (only the slip is needed), tap Submit payment. Status "Under review" until the team checks it; then the listing goes live and you get a notification. If not accepted, the reason is under Account → Payments and you can upload a new slip. Never upload someone else's or an old slip.
- My listings (Account → My listings): Edit, Withdraw (read the confirmation screen; you can ask for an exception with a genuine reason), Mark as sold.
- Mark as sold: choose the buyer, add proof of sale (1–3 photos/PDFs: transfer screenshot, receipt, handover photo or chat), Send sold request. The team checks it; then the listing becomes SOLD automatically and the sale counts toward Stars. Proof is private.
- Stars come from accepted sales (and inviting friends). Seller levels rise with Stars. VIP is automatic for active trusted sellers: badge, posting benefits, monthly VIP reward pool; lasts 2 months and renews automatically while active. Progress: Account → Stars & VIP.
- Giveaways: on the Giveaways page; tap Join. A live draw machine rolls participants' names and stops on the winner at the end time (random, picked by the system). Winners are notified.
- Business accounts: shops can open a storefront (Account → Business).
- App: Android app from mvmarkets.vercel.app/app (Download for Android; allow install from this source if asked). iPhone: Safari → Share → Add to Home Screen.
- Notifications: allow when asked; manage in Account → Settings → Phone notifications. Dark mode: moon/sun button at the top.
- Account: Sign up with name, email, password. Forgot password → "Forgot password?" on the log-in page. Settings: Account → Settings.
- Safety: meet in public, check the item before paying, be careful with deals that look too good, never share passwords or codes, use "Report this listing".
`.trim();

const SYSTEM = `You are the MV Markets help assistant on the MV Markets website and app.
Answer questions about using MV Markets, using only the guide below. Be friendly, short (2–5 sentences or a few short steps) and practical.
Reply in the same language the customer writes in (for example Dhivehi or English).
Do not quote any fee or price amounts; say the app shows the exact amount before paying.
Never promise refunds, approvals, winners, or account changes, and never ask for passwords or codes.
If the question is about a specific payment, listing, account problem, a complaint, or anything the guide doesn't cover, say you'll connect them with the team and suggest tapping "Talk to a person".

GUIDE:
${SITE_GUIDE}`;

// ───────────── Built-in FAQ (used when AI isn't configured or is unavailable) ─────────────

const FAQ: { keys: string[]; answer: string }[] = [
  { keys: ["sell", "post", "listing", "advert", "upload item", "vikkan", "vikun"], answer: "To sell: tap the blue + button (or “Post a listing”). Add photos, then the details (title, category, price, condition, description), optional location and your contact. Tap Preview, then pay using the bank account shown and upload the slip. Your listing goes live once our team checks the payment." },
  { keys: ["pay", "payment", "slip", "transfer", "bank", "under review", "fee"], answer: "On the last step you’ll see the bank account. Transfer the exact amount shown, take a screenshot of the transfer (or save the PDF) and upload it — only the slip is needed. It shows “Under review” until our team checks it, then your listing goes live. If a payment isn’t accepted, the reason is under Account → Payments and you can upload a new slip." },
  { keys: ["sold", "proof", "mark as sold", "sold request"], answer: "Go to Account → My listings → Mark as sold. Choose the buyer, add proof of sale (a transfer screenshot, receipt, handover photo or chat), and tap Send sold request. When our team accepts it, the listing is marked SOLD automatically and the sale counts toward your Stars. Your proof stays private." },
  { keys: ["buy", "contact", "seller", "message", "call", "whatsapp", "chat"], answer: "Open the item and tap Message to chat with the seller, or Call / WhatsApp if they show a number. You and the seller agree on the price, payment and where to meet. Your chats are under “Chats”." },
  { keys: ["search", "find", "filter", "category", "car", "phone"], answer: "Type what you’re looking for in the search bar (for example “car”) — it searches titles and categories. Use the category buttons and “Filters & sort” to narrow by price, atoll, condition and more. The “All items” tab shows everything." },
  { keys: ["app", "android", "iphone", "install", "download", "apk"], answer: "Android: open mvmarkets.vercel.app/app and tap Download for Android, then open the file and tap Install (allow “install from this source” if asked). iPhone: open the site in Safari → Share → Add to Home Screen." },
  { keys: ["giveaway", "win", "prize", "draw", "winner"], answer: "Open the Giveaways page and tap Join. A live draw machine rolls everyone’s names and stops on the winner when the countdown ends — the system picks the winner at random. Winners get a notification." },
  { keys: ["vip", "star", "level", "reward"], answer: "You earn Stars from sales our team accepts (and by inviting friends). VIP is given automatically to active, trusted sellers — it brings a VIP badge, posting benefits and a share of the monthly VIP reward pool. Check your progress in Account → Stars & VIP." },
  { keys: ["withdraw", "delete", "remove listing", "cancel"], answer: "Go to Account → My listings and tap Withdraw on the listing. Read the confirmation screen before confirming. If you have a genuine reason (for example the item was damaged), you can ask for an exception there. Drafts can be deleted any time." },
  { keys: ["password", "login", "log in", "sign in", "forgot", "account", "register", "sign up"], answer: "To create an account tap Sign up and enter your name, email and a password. Forgot your password? Tap “Forgot password?” on the log-in page. You can change your details in Account → Settings." },
  { keys: ["notification", "notify", "alert"], answer: "Tap Allow when we ask about notifications to hear about new items, giveaways and updates. You can turn them on or off in Account → Settings → Phone notifications." },
  { keys: ["safe", "scam", "fraud", "report"], answer: "Meet in a public place and check the item before paying. Be careful with deals that look too good to be true, and never share your password or codes. If something looks wrong, open the listing and tap “Report this listing”." },
  { keys: ["business", "shop", "store"], answer: "Shops can open a business storefront with their logo and all their listings on one page — see Account → Business." },
  { keys: ["dark", "light", "theme"], answer: "Tap the moon / sun button at the top of the page to switch between dark and light mode." },
];

export function faqAnswer(question: string) {
  const q = question.toLowerCase();
  let best: { score: number; answer: string } | null = null;
  for (const f of FAQ) {
    const score = f.keys.reduce((n, k) => n + (q.includes(k) ? k.length : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { score, answer: f.answer };
  }
  return (
    best?.answer ??
    "I can help with selling, paying, marking items as sold, buying, giveaways, the app and your account. Try asking something like “How do I sell?” — or tap “Talk to a person” to chat with our team."
  );
}

export async function botReply(history: BotTurn[]): Promise<{ text: string; source: "ai" | "faq" }> {
  const turns = history
    .filter((t) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content.trim())
    .slice(-12)
    .map((t) => ({ role: t.role, content: t.content.slice(0, 1500) }));
  while (turns.length && turns[0].role !== "user") turns.shift();
  const last = turns[turns.length - 1];
  if (!last || last.role !== "user") return { text: faqAnswer(""), source: "faq" };
  if (!aiConfigured()) return { text: faqAnswer(last.content), source: "faq" };

  const client = new Anthropic({ timeout: 30_000, maxRetries: 1 });
  try {
    const response = await client.beta.messages.create({
      model: process.env.AI_MODEL || "claude-opus-5",
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: turns,
    });
    if (response.stop_reason === "refusal") return { text: "I can’t help with that here — tap “Talk to a person” and our team will assist you.", source: "ai" };
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return text ? { text, source: "ai" } : { text: faqAnswer(last.content), source: "faq" };
  } catch (error) {
    if (error instanceof Anthropic.APIError) console.error("[support-bot] AI error", error.status);
    else console.error("[support-bot]", error);
    return { text: faqAnswer(last.content), source: "faq" };
  }
}
