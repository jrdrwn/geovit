import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function createAdmin() {
  const { db, pool } = await import("../src/lib/db");
  const { users } = await import("../src/lib/schema");
  const { hash } = await import("bcryptjs");
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!db || !pool) throw new Error("DATABASE_URL diperlukan.");
  if (!email || !password || password.length < 12)
    throw new Error(
      "ADMIN_EMAIL dan ADMIN_PASSWORD (minimal 12 karakter) diperlukan.",
    );
  const passwordHash = await hash(password, 12);

  await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      name: "Administrator",
      email,
      password_hash: passwordHash,
      role: "admin",
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        password_hash: passwordHash,
        role: "admin",
        updated_at: new Date(),
      },
    });

  await pool.end();
  console.log(`Akun admin siap: ${email}`);
}

createAdmin().catch((error) => {
  console.error(error instanceof Error ? error.message : "Gagal membuat admin.");
  process.exit(1);
});
