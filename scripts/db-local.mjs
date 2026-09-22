import EmbeddedPostgres from "embedded-postgres";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
const root = process.cwd();
await mkdir(path.join(root, ".data"), { recursive: true });
const configPath = path.join(root, ".data", "local-config.json");
let config;
try {
  config = JSON.parse(await readFile(configPath, "utf8"));
} catch {
  config = {
    port: 55439,
    password: randomBytes(24).toString("hex"),
    adminEmail: "admin@geovit.local",
    adminPassword: randomBytes(12).toString("base64url"),
    authSecret: randomBytes(32).toString("hex"),
  };
  await writeFile(configPath, JSON.stringify(config, null, 2));
}
try {
  await access(".env.local");
} catch {
  await writeFile(
    ".env.local",
    `DATABASE_URL=postgresql://geovit:${config.password}@127.0.0.1:${config.port}/geovit\nAUTH_SECRET=${config.authSecret}\nAUTH_URL=http://localhost:3000\nADMIN_EMAIL=${config.adminEmail}\nADMIN_PASSWORD=${config.adminPassword}\n`,
  );
}
const pg = new EmbeddedPostgres({
  databaseDir: path.join(root, ".data", "postgres"),
  user: "geovit",
  password: config.password,
  port: config.port,
  persistent: true,
  authMethod: "scram-sha-256",
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: (m) => console.error(String(m)),
});
await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
const existing = await client.query(
  "SELECT datname FROM pg_database WHERE datname='geovit'",
);
await client.end();
if (!existing.rows.length) await pg.createDatabase("geovit");
console.log(
  "PostgreSQL lokal aktif pada 127.0.0.1:" +
    config.port +
    ". Konfigurasi login tersimpan di .data/local-config.json.",
);
process.on("SIGINT", async () => {
  await pg.stop();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await pg.stop();
  process.exit(0);
});
setInterval(() => {}, 60000);
