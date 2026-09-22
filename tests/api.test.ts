import test from "node:test";
import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";
import { hash } from "bcryptjs";
loadEnvConfig(process.cwd());
const base = process.env.TEST_BASE_URL || "http://localhost:3000";
const validDatabaseUrl = (() => {
  try {
    const url = new URL(process.env.DATABASE_URL || "");
    return (
      ["postgres:", "postgresql:"].includes(url.protocol) && !!url.hostname
    );
  } catch {
    return false;
  }
})();
async function login(email: string, password: string) {
  const cookies = new Map<string, string>();
  const remember = (r: Response) => {
    for (const raw of r.headers.getSetCookie()) {
      const pair = raw.split(";")[0];
      const index = pair.indexOf("=");
      cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  };
  const header = () => Array.from(cookies, ([k, v]) => `${k}=${v}`).join("; ");
  const csrfRes = await fetch(base + "/api/auth/csrf");
  remember(csrfRes);
  const { csrfToken } = await csrfRes.json();
  const res = await fetch(base + "/api/auth/callback/credentials", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: header(),
      Origin: base,
    },
    body: new URLSearchParams({ csrfToken, email, password }),
    redirect: "manual",
  });
  remember(res);
  assert.ok(
    !res.headers.get("location")?.includes("error"),
    "credentials login succeeds",
  );
  return header();
}
async function post(body: unknown, cookie = "") {
  return fetch(base + "/api/data", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: base,
    },
    body: JSON.stringify(body),
  });
}
test(
  "PostgreSQL API integration: authorization, visits, comments, import and CRUD",
  { skip: !validDatabaseUrl, timeout: 90000 },
  async (t) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const suffix = crypto.randomUUID();
    const region = "test-sls-" + suffix;
    const loc = "test-loc-" + suffix;
    const editorId = "test-user-" + suffix;
    let adminCookie = "";
    let editorCookie = "";
    try {
      adminCookie = await login(
        process.env.ADMIN_EMAIL!,
        process.env.ADMIN_PASSWORD!,
      );
      await pool.query("INSERT INTO sls(id,code,name) VALUES($1,$2,$3)", [
        region,
        "SLS-TEST-" + suffix,
        "Integration test",
      ]);
      await pool.query(
        "INSERT INTO locations(id,sls_id,title,latitude,longitude) VALUES($1,$2,$3,$4,$5)",
        [loc, region, "Integration test", -6.2, 106.8],
      );
      const password = crypto.randomUUID();
      const email = suffix + "@test.local";
      await pool.query(
        "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5)",
        [editorId, "Test editor", email, await hash(password, 12), "editor"],
      );
      editorCookie = await login(email, password);
      await t.test(
        "public cannot write master data; editor cannot manage SLS",
        async () => {
          assert.equal(
            (await post({ action: "delete-location", id: loc })).status,
            401,
          );
          assert.equal(
            (await post({ action: "delete-sls", id: region }, editorCookie))
              .status,
            403,
          );
          const linkedSls = await post(
            { action: "delete-sls", id: region },
            adminCookie,
          );
          assert.equal(linkedSls.status, 409);
          assert.match(
            (await linkedSls.json()).error,
            /SLS masih dipakai oleh lokasi/,
          );
          const emptyRegion = "empty-sls-" + suffix;
          await pool.query("INSERT INTO sls(id,code,name) VALUES($1,$2,$3)", [
            emptyRegion,
            "SLS-EMPTY-" + suffix,
            "Empty SLS",
          ]);
          assert.equal(
            (await post({ action: "delete-sls", id: emptyRegion }, adminCookie))
              .status,
            200,
          );
          const deleted = await pool.query("SELECT id FROM sls WHERE id=$1", [
            emptyRegion,
          ]);
          assert.equal(deleted.rowCount, 0);
          assert.equal((await fetch(base + "/api/data?manage=1")).status, 401);
        },
      );
      await t.test("duplicate visits are idempotent", async () => {
        const visitor_id = crypto.randomUUID();
        for (let i = 0; i < 2; i++)
          assert.equal(
            (await post({ action: "visit", location_id: loc, visitor_id }))
              .status,
            200,
          );
        const result = await pool.query(
          "SELECT COUNT(*)::int AS n FROM visits WHERE location_id=$1",
          [loc],
        );
        assert.equal(result.rows[0].n, 1);
      });
      await t.test(
        "comments appear immediately without editor approval",
        async () => {
          const r = await post({
            action: "comment",
            location_id: loc,
            visitor_id: crypto.randomUUID(),
            name: "QA",
            comment: "Test moderation",
          });
          assert.equal(r.status, 200);
          const data = await (
            await fetch(base + "/api/data?id=" + loc)
          ).json();
          assert.equal(data.comments.length, 1);
          assert.equal(data.comments[0].comment, "Test moderation");
          const result = await pool.query(
            "SELECT id,status FROM comments WHERE location_id=$1",
            [loc],
          );
          assert.equal(result.rows[0].status, "approved");
          assert.equal(
            (
              await post(
                { action: "delete-comment", id: result.rows[0].id },
                editorCookie,
              )
            ).status,
            200,
          );
          const afterDelete = await (
            await fetch(base + "/api/data?id=" + loc)
          ).json();
          assert.equal(afterDelete.comments.length, 0);
        },
      );
      await t.test(
        "invalid coordinates and unknown SLS fail without partial import",
        async () => {
          const data = {
            title: "Invalid",
            sls_id: region,
            latitude: 91,
            longitude: 106,
          };
          assert.equal(
            (await post({ action: "location", data }, editorCookie)).status,
            400,
          );
          assert.equal(
            (
              await post(
                {
                  action: "import",
                  rows: [
                    { ...data, latitude: -6 },
                    { ...data, sls_id: "missing", latitude: -6 },
                  ],
                },
                adminCookie,
              )
            ).status,
            400,
          );
          const result = await pool.query(
            "SELECT COUNT(*)::int AS n FROM locations WHERE sls_id=$1",
            [region],
          );
          assert.equal(result.rows[0].n, 1);
        },
      );
      await t.test(
        "editor updates coordinates; admin imports valid rows",
        async () => {
          assert.equal(
            (
              await post(
                {
                  action: "location",
                  data: {
                    id: loc,
                    title: "Updated test",
                    sls_id: region,
                    latitude: 0,
                    longitude: 0,
                  },
                },
                editorCookie,
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await post(
                {
                  action: "import",
                  rows: [
                    {
                      title: "Imported test",
                      sls_id: region,
                      latitude: -6.1,
                      longitude: 106.7,
                    },
                  ],
                },
                adminCookie,
              )
            ).status,
            200,
          );
          const data = await (
            await fetch(base + "/api/data?sls=" + region)
          ).json();
          assert.equal(data.total, 2);
          assert.ok(
            data.locations.every(
              (l: { sls_id: string }) => l.sls_id === region,
            ),
          );
        },
      );
      await t.test("upload authentication and file validation", async () => {
        assert.equal(
          (await fetch(base + "/api/upload", { method: "POST" })).status,
          401,
        );
        const data = new FormData();
        data.set(
          "file",
          new File(["<script>bad</script>"], "image.png", {
            type: "image/png",
          }),
        );
        assert.equal(
          (
            await fetch(base + "/api/upload", {
              method: "POST",
              headers: { Cookie: editorCookie, Origin: base },
              body: data,
            })
          ).status,
          400,
        );
      });
      await t.test("admin deletion cascades visits and comments", async () => {
        assert.equal(
          (await post({ action: "delete-location", id: loc }, adminCookie))
            .status,
          200,
        );
        assert.equal(
          (
            await pool.query("SELECT id FROM visits WHERE location_id=$1", [
              loc,
            ])
          ).rowCount,
          0,
        );
        assert.equal(
          (
            await pool.query("SELECT id FROM comments WHERE location_id=$1", [
              loc,
            ])
          ).rowCount,
          0,
        );
      });
    } finally {
      await pool.query("DELETE FROM locations WHERE sls_id=$1", [region]);
      await pool.query("DELETE FROM sls WHERE id=$1", [region]);
      await pool.query("DELETE FROM users WHERE id=$1", [editorId]);
      await pool.end();
    }
  },
);
