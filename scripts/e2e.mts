/**
 * Browser end-to-end test against a running server (default http://localhost:3000).
 *   npm run build && npm start &   then   npm run test:e2e
 * Uses the local dev database from .env. OTP codes are e-mailed in real deployments; here the
 * script sets a known code on the latest OTP row (hashed with the same AUTH_SECRET) as a test fixture.
 */
import { readFileSync, mkdirSync } from "fs";
import path from "path";
import { chromium, type Page, type Browser } from "playwright-core";
import sharp from "sharp";

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const OUT = process.env.E2E_OUT || "e2e-screenshots";
mkdirSync(OUT, { recursive: true });

const { prisma } = await import("../src/lib/db");
const { otpHash } = await import("../src/lib/otp");

const run = Date.now().toString(36);
const seller = { name: "Aminath Seller", email: `seller-${run}@test.mv`, password: "SellerPass123" };
const buyer = { name: "Hassan Buyer", email: `buyer-${run}@test.mv`, password: "BuyerPass123" };
const admin = { email: process.env.ADMIN_EMAIL!, password: process.env.ADMIN_PASSWORD! };
const CODE = "424242";
let step = 0;

function log(msg: string) {
  console.log(`✓ ${++step}. ${msg}`);
}

async function setOtp(target: string) {
  for (let i = 0; i < 20; i++) {
    const row = await prisma.otpCode.findFirst({ where: { target, consumedAt: null }, orderBy: { createdAt: "desc" } });
    if (row) {
      await prisma.otpCode.update({ where: { id: row.id }, data: { codeHash: otpHash(row.id, CODE) } });
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No OTP issued for ${target}`);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
}

async function expectText(page: Page, text: string | RegExp) {
  await page.getByText(text).first().waitFor({ timeout: 15000 });
}

async function makeSlip(file: string) {
  const w = 7, h = 9;
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = Math.floor(Math.random() * 256);
  await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).resize(700, 900, { kernel: "nearest" }).png().toFile(file);
  return file;
}

async function makePng(file: string, color: string, text: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="100%" height="100%" fill="${color}"/><text x="50%" y="50%" font-size="60" text-anchor="middle" fill="white" font-family="sans-serif">${text}</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}

async function register(page: Page, u: { name: string; email: string; password: string }) {
  await page.goto(`${BASE}/register`);
  await page.fill("#name", u.name);
  await page.fill("#email", u.email);
  await page.fill("#password", u.password);
  await page.fill("#confirm", u.password);
  await page.check('input[name="acceptTerms"]');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(verify|account)/);
  await page.waitForLoadState("networkidle");
  if (new URL(page.url()).pathname === "/verify") {
    // Email service configured: verify with the emailed code.
    await setOtp(u.email);
    await page.fill("#code", CODE);
    await page.click('button:has-text("Verify")');
    await page.waitForURL(/\/account/);
  }
}

async function login(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
}

async function adminLogin(page: Page) {
  // Fixture cleanup: the 60s resend cooldown would otherwise block back-to-back test runs.
  await prisma.otpCode.deleteMany({ where: { target: admin.email } });
  await login(page, admin.email, admin.password);
  await page.waitForURL(/\/admin(-verify)?$/);
  if (page.url().endsWith("/admin-verify")) {
    await setOtp(admin.email);
    await page.fill("#code", CODE);
    await page.click('button:has-text("Continue")');
    await page.waitForURL(`${BASE}/admin`);
  }
}

async function createListing(page: Page, title: string, img: string) {
  await page.goto(`${BASE}/sell`);
  await page.setInputFiles('[data-testid="image-input"]', img);
  await page.locator('input[name="imageIds"]').first().waitFor({ state: "attached", timeout: 20000 });
  await page.fill("#title", title);
  const cat = await prisma.category.findFirstOrThrow({ where: { slug: "phones" }, include: { subcategories: true } });
  await page.selectOption("#categoryId", cat.id);
  await page.selectOption("#subcategoryId", cat.subcategories[0].id);
  await page.fill("#price", "8500");
  await page.selectOption("#condition", "LIKE_NEW");
  await page.fill("#description", "Excellent condition, battery health 91%. Box and charger included.");
  const atoll = await prisma.atoll.findFirstOrThrow({ where: { code: "MLE" }, include: { islands: true } });
  await page.selectOption("#atollId", atoll.id);
  await page.selectOption("#islandId", atoll.islands.find((i) => i.name === "Hulhumalé")!.id);
  await page.fill("#contactPhone", "7771234");
  await page.click('button:has-text("Continue to preview")');
  await page.waitForURL(/\/sell\/.+\/preview/);
  return page.url().split("/sell/")[1].split("/")[0];
}

async function paySlip(page: Page, listingId: string, slip: string, ref: string) {
  await page.goto(`${BASE}/sell/${listingId}/pay`);
  await page.setInputFiles("#slip", slip);
  await page.fill("#referenceNumber", ref);
  await page.click('button:has-text("Submit payment")');
  await page.waitForURL(/\/account\/payments/);
}

async function adminVerifyLatest(page: Page, listingId: string) {
  const p = await prisma.payment.findFirstOrThrow({ where: { listingId }, orderBy: { createdAt: "desc" } });
  await page.goto(`${BASE}/admin/payments/${p.id}`);
  await page.fill('textarea[name="note"]', "Matched against bank statement");
  await page.click('button:has-text("Verify & apply")');
  await expectText(page, "Mark as refunded");
}

let browser: Browser | undefined;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const sellerCtx = await browser.newContext(mobile);
  const buyerCtx = await browser.newContext(mobile);
  const adminCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const s = await sellerCtx.newPage();
  const b = await buyerCtx.newPage();
  const a = await adminCtx.newPage();
  const errors: string[] = [];
  for (const p of [s, b, a]) p.on("pageerror", (e) => errors.push(e.message));

  const img = await makePng(path.join(OUT, "item.png"), "#0e7490", "iPhone");
  const slip1 = await makeSlip(path.join(OUT, "slip1.png"));
  const slip2 = await makeSlip(path.join(OUT, "slip2.png"));

  await s.goto(BASE);
  await shot(s, "01-home-mobile");
  log("Home page renders on mobile");

  const anon = await browser.newPage();
  const res = await anon.goto(`${BASE}/admin`);
  if (res?.status() !== 404) throw new Error("Admin must be hidden (404) for anonymous users");
  log("Admin area returns 404 for anonymous visitors");

  await register(s, seller);
  log("Seller registered and verified");
  const r2 = await s.goto(`${BASE}/admin/payments`);
  if (r2?.status() !== 404) throw new Error("Admin must be hidden for normal users");
  if ((await s.content()).includes("Admin dashboard")) throw new Error("Admin link leaked to normal user");
  log("Normal users cannot see or reach the admin area");

  const title = `iPhone 14 Pro 256GB ${run}`;
  const listingId = await createListing(s, title, img);
  await expectText(s, "Normal posting fee: MVR 20");
  await shot(s, "02-preview-mobile");
  log("Listing created with photo upload; preview shows normal fee MVR 20");
  await s.click('button:has-text("Continue to payment")');
  await s.waitForURL(/\/pay$/);
  await expectText(s, "Transfer exactly");
  await shot(s, "03-pay-mobile");
  await paySlip(s, listingId, slip1, `BLAZ${run}01`);
  await expectText(s, "Under review");
  log("Payment slip submitted; customer sees neutral 'Under review' status");

  await adminLogin(a);
  await shot(a, "04-admin-dashboard");
  log("Admin signed in");
  await a.goto(`${BASE}/admin/payments`);
  await expectText(a, title);
  await adminVerifyLatest(a, listingId);
  await shot(a, "05-admin-payment-review");
  const l1 = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
  if (l1.status !== "PUBLISHED") throw new Error(`Listing should be published, is ${l1.status}`);
  log("Admin verified payment → listing published");

  await register(b, buyer);
  await b.goto(`${BASE}/search?q=${encodeURIComponent("iPhone 14 Pro")}`);
  await expectText(b, title);
  await shot(b, "06-search-mobile");
  await b.click(`text=${title}`);
  await b.waitForURL(/\/listing\//);
  await expectText(b, "Call");
  await b.click('button:has-text("Save item")');
  await expectText(b, "Saved");
  await shot(b, "07-listing-mobile");
  log("Buyer found listing via search, saved it");
  await b.click('button:has-text("Message seller")');
  await b.waitForURL(/\/messages\//);
  await b.fill('textarea[name="body"]', "Can I see it tomorrow in Hulhumalé?");
  await b.click('button:has-text("Send")');
  await expectText(b, "Can I see it tomorrow");
  log("Buyer messaged the seller");

  await s.goto(`${BASE}/messages`);
  await expectText(s, buyer.name);
  await s.click(`text=${buyer.name}`);
  await s.fill('textarea[name="body"]', "Sure, see you at 5pm!");
  await s.click('button:has-text("Send")');
  await expectText(s, "see you at 5pm");
  await shot(s, "08-chat-mobile");
  log("Seller replied in chat");

  // Make the sale count (default rules need 12h live & 2-day-old buyer accounts)
  await prisma.listing.update({ where: { id: listingId }, data: { publishedAt: new Date(Date.now() - 2 * 86400000) } });
  await prisma.user.update({ where: { email: buyer.email }, data: { createdAt: new Date(Date.now() - 5 * 86400000) } });
  await s.goto(`${BASE}/account/listings/${listingId}/sold`);
  await s.check(`label:has-text("${buyer.name}") input`);
  await s.click('button:has-text("Confirm sale")');
  await s.waitForURL(/sold=1/);
  log("Seller marked item SOLD naming the buyer");

  await b.goto(`${BASE}/account/purchases`);
  await b.click('button:has-text("Yes, I bought this")');
  await expectText(b, "Confirmed");
  const stats = await prisma.sellerStatistics.findFirstOrThrow({ where: { user: { email: seller.email } } });
  if (stats.countedDeals !== 1 || stats.stars !== 1) throw new Error(`Expected 1 deal / 1 star, got ${stats.countedDeals}/${stats.stars}`);
  log("Buyer confirmed purchase → seller earned 1 Star and 1 successful deal");

  await b.goto(`${BASE}/search?q=${encodeURIComponent(title)}`);
  await expectText(b, "No listings match");
  log("SOLD listing no longer in default search");

  // Cancellation fine flow
  const title2 = `Samsung S23 ${run}`;
  const l2 = await createListing(s, title2, img);
  await s.click('button:has-text("Continue to payment")');
  await s.waitForURL(/\/pay$/);
  await paySlip(s, l2, slip2, `BLAZ${run}02`);
  await adminVerifyLatest(a, l2);
  await s.goto(`${BASE}/account/listings/${l2}/withdraw`);
  await expectText(s, "MVR 10");
  await shot(s, "09-withdraw-mobile");
  await s.check('input[name="confirm"]');
  await s.click('button:has-text("Yes, remove listing")');
  await s.waitForURL(/\/account\/cancellations/);
  await expectText(s, "Pay MVR 10");
  log("Withdrawing a published listing showed MVR 10 fee, required confirmation and recorded an unpaid fine");

  // VIP fee
  const sellerUser = await prisma.user.findUniqueOrThrow({ where: { email: seller.email } });
  await a.goto(`${BASE}/admin/users/${sellerUser.id}`);
  await a.fill('form:has(button:has-text("Restore / grant VIP")) input[name="reason"]', "E2E test grant");
  await a.click('button:has-text("Restore / grant VIP")');
  await expectText(a, "VIP status updated");
  await prisma.cancellationFine.updateMany({ where: { cancellation: { sellerId: sellerUser.id } }, data: { status: "WAIVED" } });
  await createListing(s, `Pixel 8 ${run}`, img);
  await expectText(s, "VIP posting fee: MVR 10");
  await shot(s, "10-vip-preview-mobile");
  log("After admin granted VIP, seller sees VIP posting fee MVR 10");

  await a.goto(`${BASE}/admin/settings`);
  await shot(a, "11-admin-settings");
  await a.goto(`${BASE}/admin/vip`);
  await shot(a, "12-admin-vip");
  await a.goto(`${BASE}/admin/rewards`);
  await a.fill("#eligibleProfit", "200");
  await a.fill("#rewardPercent", "20");
  await a.click('button:has-text("Save pool")');
  await a.waitForURL(/\/admin\/rewards\/.+/);
  await expectText(a, "MVR 40");
  await a.click('button:has-text("Calculate rewards")');
  await expectText(a, "Rewards calculated");
  await shot(a, "13-admin-rewards");
  log("Admin created monthly reward pool: MVR 200 × 20% = MVR 40, calculated allocations");

  await s.goto(`${BASE}/account/vip`);
  await shot(s, "14-account-vip-mobile");
  await a.goto(`${BASE}/admin/audit`);
  await expectText(a, "payment.verify");
  log("Audit log records admin actions");

  // Desktop pages
  const desk = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await desk.goto(BASE);
  await shot(desk, "15-home-desktop");
  await desk.goto(`${BASE}/listing/${listingId}`);
  await shot(desk, "16-listing-desktop");

  if (errors.length) throw new Error(`Browser errors: ${errors.join(" | ")}`);
  log("No client-side errors");
  console.log(`\nAll ${step} end-to-end checks passed. Screenshots in ${OUT}/`);
} catch (e) {
  console.error("E2E FAILED:", e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await prisma.$disconnect();
}
