export const PERMISSIONS = {
  dashboard: "View dashboard & statistics",
  finance: "View revenue & financial reports",
  payments: "Review payment slips",
  listings: "Moderate listings",
  users: "Manage users & suspensions",
  reports: "Handle reports",
  catalog: "Manage categories & locations",
  vip: "Manage VIP, stars, levels & deals",
  rewards: "Manage VIP monthly rewards",
  cancellations: "Manage cancellations & fines",
  businesses: "Manage businesses & subscription plans",
  giveaways: "Manage giveaways",
  content: "Manage homepage, banners, terms & privacy",
  support: "Answer customer help chats",
  settings: "Change marketplace settings",
  audit: "View audit logs",
  admins: "Manage admin users & roles",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function hasPermission(perms: string[] | null | undefined, p: Permission): boolean {
  if (!perms) return false;
  return perms.includes("*") || perms.includes(p);
}
