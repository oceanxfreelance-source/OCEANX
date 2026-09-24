/**
 * Create or promote a Super Admin:  npm run admin:create -- admin@example.com "Strong Pass 123" "Full Name"
 * If the user exists they are promoted (password unchanged); otherwise a verified account is created.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";

const prisma = new PrismaClient();

async function main() {
  const [emailArg, password, name = "OceanX Admin"] = process.argv.slice(2);
  const email = emailArg?.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("Usage: npm run admin:create -- <email> <password> [name]");
  const role = await prisma.adminRole.upsert({
    where: { name: "Super Admin" },
    create: { name: "Super Admin", description: "Full access to everything", permissions: ["*"], isSystem: true },
    update: {},
  });
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { adminRoleId: role.id, emailVerifiedAt: existing.emailVerifiedAt ?? new Date() } });
    await prisma.session.deleteMany({ where: { userId: existing.id } });
    console.log(`Promoted ${email} to Super Admin.`);
    return;
  }
  if (!password || password.length < 10) throw new Error("Password must be at least 10 characters.");
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await bcrypt.hash(password, 12),
      emailVerifiedAt: new Date(),
      referralCode: Array.from({ length: 8 }, () => a[randomInt(0, a.length)]).join(""),
      adminRoleId: role.id,
      profile: { create: { displayName: name } },
      sellerStats: { create: {} },
      vipStatus: { create: {} },
    },
  });
  console.log(`Created Super Admin ${email}.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
