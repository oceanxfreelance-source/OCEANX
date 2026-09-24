import { prisma, type Tx } from "./db";
import { getSettings } from "./settings";
import { sendEmail } from "./messaging-providers";
import { env } from "./env";

export type NotifyEvent = "paymentVerified" | "paymentRejected" | "listingPublished" | "newMessage" | "vip" | "rewards" | "cancellation" | "deals";

/**
 * Creates an in-app notification and (when enabled by admin settings and the user's preference)
 * sends an email copy. Email failures never break the calling flow.
 */
export async function notify(
  userId: string,
  n: { type: string; title: string; body: string; link?: string; event?: NotifyEvent },
  db: Tx = prisma,
) {
  await db.notification.create({ data: { userId, type: n.type, title: n.title, body: n.body, link: n.link ?? null } });
  if (!n.event) return;
  try {
    const settings = await getSettings();
    if (!settings.notifications.emailEnabled || !settings.notifications.events[n.event]) return;
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
    if (!user || user.profile?.notifyByEmail === false) return;
    const link = n.link ? `\n\n${env.appUrl}${n.link}` : "";
    await sendEmail(user.email, `${n.title} — ${settings.general.marketplaceName}`, `${n.body}${link}`);
  } catch (e) {
    console.error("[notify] email failed", e);
  }
}
