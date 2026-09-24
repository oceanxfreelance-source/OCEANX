import type { SettingsGroup } from "./settings";

/** Admin form definitions for every settings group (labels, input types, help text). */
export type FieldType = "money" | "int" | "float" | "percent" | "bool" | "text" | "textarea" | "list" | "select" | "email";
export type FieldDef = { key: string; label: string; type: FieldType; help?: string; options?: { value: string; label: string }[] };

export const SETTINGS_FORMS: { group: SettingsGroup; title: string; description: string; fields: FieldDef[] }[] = [
  {
    group: "general",
    title: "Marketplace",
    description: "Name, contact details and platform limits.",
    fields: [
      { key: "marketplaceName", label: "Marketplace name", type: "text" },
      { key: "tagline", label: "Tagline", type: "text" },
      { key: "supportEmail", label: "Support email", type: "email" },
      { key: "supportPhone", label: "Support phone", type: "text" },
      { key: "maxImagesPerListing", label: "Max photos per listing", type: "int" },
      { key: "maxActiveListingsPerUser", label: "Max active listings per user", type: "int" },
      { key: "maxListingsCreatedPerDay", label: "Max new listings per user per day", type: "int", help: "Stops spam / mass posting." },
      { key: "seoDescription", label: "Search engine description", type: "textarea", help: "Shown under your site name in Google results." },
      { key: "googleSiteVerification", label: "Google Search Console verification code", type: "text", help: 'From Search Console → "HTML tag" method: paste only the content="…" value.' },
    ],
  },
  {
    group: "fees",
    title: "Posting fees",
    description: "One-time fee charged per published listing. No commission is ever taken on sales.",
    fields: [
      { key: "postingFee", label: "Normal posting fee (MVR)", type: "money" },
      { key: "vipPostingFee", label: "VIP posting fee (MVR)", type: "money", help: "Default MVR 10 = 50% discount." },
    ],
  },
  {
    group: "payment",
    title: "Payment details & verification",
    description: "Bank accounts shown to customers and how payment slips are screened.",
    fields: [
      { key: "bankName", label: "Bank name", type: "text" },
      { key: "accountName", label: "Account name", type: "text" },
      { key: "accountNumber", label: "Account number", type: "text" },
      { key: "secondaryBankName", label: "Second bank / wallet (optional)", type: "text" },
      { key: "secondaryAccountName", label: "Second account name", type: "text" },
      { key: "secondaryAccountNumber", label: "Second account number", type: "text" },
      { key: "instructions", label: "Payment instructions", type: "textarea" },
      { key: "aiScreeningEnabled", label: "Use AI to read payment slips", type: "bool", help: "Requires ANTHROPIC_API_KEY. AI only assists — it never rejects anyone." },
      { key: "aiAutoApprove", label: "Auto-verify clean, high-confidence slips", type: "bool", help: "Off = every payment is confirmed by a person." },
      { key: "aiConfidenceThreshold", label: "AI confidence threshold (0–1)", type: "float" },
      { key: "maxSlipAgeDays", label: "Flag slips older than (days)", type: "int" },
    ],
  },
  {
    group: "deals",
    title: "Successful deals (anti-manipulation)",
    description: "Rules deciding which SOLD listings count as genuine deals for Stars and VIP.",
    fields: [
      {
        key: "countingMode",
        label: "Which deals count",
        type: "select",
        options: [
          { value: "confirmed_only", label: "Only buyer-confirmed deals (recommended)" },
          { value: "include_unconfirmed", label: "Also seller-only SOLD marks" },
        ],
      },
      { key: "requireSaleProof", label: "Require proof of sale", type: "bool", help: "Sellers upload a transfer screenshot, receipt or handover photo when marking SOLD. The sale counts toward Stars, VIP and rewards only after an admin accepts the proof." },
      { key: "autoConfirmDays", label: "Auto-confirm after (days, 0 = never)", type: "int" },
      { key: "minHoursPublishedBeforeSale", label: "Min hours live before a sale counts", type: "int" },
      { key: "minDealPrice", label: "Min price for a counted deal (MVR)", type: "money" },
      { key: "maxCountedDealsPerDay", label: "Max counted deals per seller per day", type: "int" },
      { key: "maxDealsSamePairPer30Days", label: "Max counted deals with the same buyer per 30 days", type: "int" },
      { key: "buyerMinAccountAgeDays", label: "Buyer account minimum age (days)", type: "int" },
    ],
  },
  {
    group: "stars",
    title: "Stars",
    description: "How Stars are earned.",
    fields: [{ key: "starsPerDeal", label: "Stars per counted deal", type: "int" }],
  },
  {
    group: "vip",
    title: "VIP program",
    description: "VIP is earned through genuine activity, never purchased.",
    fields: [
      { key: "enabled", label: "VIP program enabled", type: "bool" },
      { key: "durationMonths", label: "VIP duration (months)", type: "int" },
      { key: "minStars", label: "Min Stars", type: "int" },
      { key: "minDealsTotal", label: "Min successful deals (all time)", type: "int" },
      { key: "windowDays", label: "Recent-activity window (days)", type: "int" },
      { key: "minDealsInWindow", label: "Min deals in window (qualify & renew)", type: "int" },
      { key: "maxCancellationsInWindow", label: "Max voluntary cancellations in window", type: "int" },
      { key: "requireAdminApproval", label: "Require admin approval for new VIPs", type: "bool" },
      { key: "badgeName", label: "Badge name", type: "text" },
      { key: "badgeDescription", label: "Badge description", type: "textarea" },
      { key: "benefits", label: "Benefits (one per line)", type: "list" },
    ],
  },
  {
    group: "cancellation",
    title: "Cancellation fines",
    description: "Applies only to voluntary withdrawal of PUBLISHED listings — never drafts, admin removals or SOLD items.",
    fields: [
      { key: "enabled", label: "Cancellation fines enabled", type: "bool" },
      { key: "fineAmount", label: "Fine amount (MVR)", type: "money" },
      { key: "graceHours", label: "Grace period after publishing (hours, 0 = none)", type: "int" },
      { key: "allowExceptionRequests", label: "Allow sellers to request an exception", type: "bool" },
      { key: "maxPerPeriod", label: "Max voluntary cancellations per period", type: "int" },
      { key: "periodDays", label: "Period (days)", type: "int" },
      { key: "reduceStars", label: "Cancellations reduce Stars", type: "bool" },
      { key: "starPenalty", label: "Stars removed per cancellation", type: "int" },
      { key: "affectsVipEligibility", label: "Cancellations affect VIP eligibility", type: "bool" },
      { key: "suspendVipOverLimit", label: "Suspend VIP when over the limit", type: "bool" },
      { key: "triggerReviewOverLimit", label: "Flag seller for admin review when over the limit", type: "bool" },
      { key: "warnOverLimit", label: "Send a warning when over the limit", type: "bool" },
      { key: "reduceLevelOverLimit", label: "Drop seller level by one when over the limit", type: "bool" },
      { key: "blockPostingWithUnpaidFines", label: "Block new listings while a fine is unpaid", type: "bool" },
    ],
  },
  {
    group: "referrals",
    title: "Referrals",
    description: "Reward members who bring genuine new sellers.",
    fields: [
      { key: "enabled", label: "Referral rewards enabled", type: "bool" },
      { key: "starsPerVerifiedReferral", label: "Stars per verified referral", type: "int" },
      { key: "requireReferredPublishedListing", label: "Referral counts only after the friend publishes a listing", type: "bool" },
    ],
  },
  {
    group: "rewards",
    title: "VIP monthly reward formula",
    description: "How each month's VIP reward pool is split. Weights are relative.",
    fields: [
      { key: "defaultPercent", label: "Default reward pool % of eligible profit", type: "percent" },
      {
        key: "method",
        label: "Distribution method",
        type: "select",
        options: [
          { value: "weighted", label: "Weighted by activity" },
          { value: "equal", label: "Equal split among eligible VIPs" },
        ],
      },
      { key: "weights.deals", label: "Weight: completed deals in month", type: "float" },
      { key: "weights.listings", label: "Weight: listings published in month", type: "float" },
      { key: "weights.referrals", label: "Weight: verified referrals in month", type: "float" },
      { key: "weights.stars", label: "Weight: total Stars", type: "float" },
      { key: "minDealsInMonth", label: "Min deals in month to be eligible", type: "int" },
      { key: "requireActiveVipAtMonthEnd", label: "Must be VIP at month end", type: "bool" },
    ],
  },
  {
    group: "notifications",
    title: "Notifications",
    description: "Email copies of in-app notifications.",
    fields: [
      { key: "emailEnabled", label: "Send notification emails", type: "bool" },
      { key: "events.paymentVerified", label: "Payment verified", type: "bool" },
      { key: "events.paymentRejected", label: "Payment not verified", type: "bool" },
      { key: "events.listingPublished", label: "Listing published", type: "bool" },
      { key: "events.newMessage", label: "New chat message", type: "bool" },
      { key: "events.vip", label: "VIP status changes", type: "bool" },
      { key: "events.rewards", label: "VIP rewards", type: "bool" },
      { key: "events.cancellation", label: "Cancellations & fines", type: "bool" },
      { key: "events.deals", label: "Deal confirmations", type: "bool" },
    ],
  },
  {
    group: "business",
    title: "Business accounts",
    description: "Optional paid storefronts.",
    fields: [
      { key: "enabled", label: "Business accounts enabled", type: "bool" },
      { key: "requireVerifiedForStorefront", label: "Branding only for verified businesses", type: "bool" },
    ],
  },
  {
    group: "moderation",
    title: "Moderation",
    description: "Reports and automatic protection.",
    fields: [{ key: "autoHideReportThreshold", label: "Auto-hide listing after N distinct reports (0 = off)", type: "int" }],
  },
  {
    group: "homepage",
    title: "Homepage",
    description: "Hero text, sections, the opening animation and the About us section.",
    fields: [
      { key: "adSlideSeconds", label: "Ad slider — seconds per ad", type: "int", help: "How long each ad shows before swiping to the next (2–30)." },
      { key: "introAnimation", label: "Play the logo animation when the site opens", type: "bool", help: "Plays on first open and on every refresh. Visitors can tap to skip." },
      { key: "showAbout", label: "Show About us on the home page", type: "bool" },
      { key: "aboutTitle", label: "About us — heading", type: "text" },
      { key: "aboutText", label: "About us — who we are", type: "textarea" },
      { key: "aboutAim", label: "About us — our aim", type: "textarea" },
      { key: "heroTitle", label: "Hero title", type: "text" },
      { key: "heroSubtitle", label: "Hero subtitle", type: "textarea" },
      { key: "announcement", label: "Announcement bar", type: "text" },
      { key: "showCategories", label: "Show categories", type: "bool" },
      { key: "showFeatured", label: "Show featured listings", type: "bool" },
      { key: "recentCount", label: "Number of recent listings", type: "int" },
    ],
  },
];

export function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

export function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (!o[k] || typeof o[k] !== "object") o[k] = {};
    o = o[k] as Record<string, unknown>;
  }
  o[keys[keys.length - 1]] = value;
}
