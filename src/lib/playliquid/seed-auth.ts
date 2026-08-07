// Seed auth: admin + demo accounts. Run with: bun run db:seed:auth
// Idempotent — safe to run multiple times.

import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

async function main() {
  console.log("Seeding auth (admin + demo accounts)…");

  const adminEmail = (process.env.ADMIN_EMAIL ?? "ekontetevi@gmail").trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD ?? "Payswap123456";

  // ── Admin ──────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash(adminPassword, 10);
  const admin = await db.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash: adminHash, role: "ADMIN", status: "ACTIVE" },
    create: {
      email: adminEmail,
      name: "Admin",
      passwordHash: adminHash,
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
  console.log(`  ✓ admin: ${admin.email} (role=ADMIN)`);

  // ── Demo accounts (one per user type) ──────────────────────────
  // Demo accounts get their REAL acting role (ADMIN/USER) so the app's
  // role-based UI works naturally. They're flagged as demo by their email
  // domain (@playliquid.os) — the UI shows a "demo" badge for those.
  const demoPassword = await bcrypt.hash("demo", 10);
  const demoAccounts = [
    { email: "demo-admin@playliquid.os", name: "Demo Admin", role: "ADMIN" },
    { email: "demo-user@playliquid.os", name: "Demo User", role: "USER" },
  ];
  for (const d of demoAccounts) {
    const u = await db.user.upsert({
      where: { email: d.email },
      update: { passwordHash: demoPassword, role: d.role, status: "ACTIVE" },
      create: { email: d.email, name: d.name, passwordHash: demoPassword, role: d.role, status: "ACTIVE" },
    });
    console.log(`  ✓ demo: ${u.email} (role=${d.role})`);
  }

  console.log("✓ Auth seed complete.");
  console.log(`  Admin login:    ${adminEmail} / ${adminPassword}`);
  console.log(`  Demo logins:    demo-admin@playliquid.os / demo`);
  console.log(`                  demo-user@playliquid.os  / demo`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
