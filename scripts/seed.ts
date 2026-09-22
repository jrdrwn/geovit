import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function seed() {
  const { db, pool } = await import("../src/lib/db");
  const { sls, locations, users, visits } = await import("../src/lib/schema");
  const { seedSls, seedLocations } = await import("../src/lib/data");
  const { hash } = await import("bcryptjs");
  if (!db) throw new Error("DATABASE_URL diperlukan.");
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12)
    throw new Error(
      "Tetapkan ADMIN_EMAIL dan ADMIN_PASSWORD (minimal 12 karakter).",
    );
  await db.insert(sls).values(seedSls).onConflictDoNothing();
  for (const loc of seedLocations) {
    const row = {
      id: loc.id,
      sls_id: loc.sls_id,
      title: loc.title,
      address: loc.address,
      description: loc.description,
      latitude: loc.latitude,
      longitude: loc.longitude,
      status: loc.status,
    };
    const visitCount = loc.visits;
    await db.insert(locations).values(row).onConflictDoNothing();
    if (visitCount)
      await db
        .insert(visits)
        .values({
          id: crypto.randomUUID(),
          location_id: loc.id,
          visitor_id: "00000000-0000-4000-8000-000000000001",
        })
        .onConflictDoNothing();
  }
  await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      name: "Administrator",
      email: email.toLowerCase(),
      password_hash: await hash(password, 12),
      role: "admin",
    })
    .onConflictDoNothing();
  await pool!.end();
  console.log("Seed selesai: 4 SLS, 24 lokasi contoh, akun admin.");
}
seed().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
