import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { hash } from "bcryptjs";
import { db, pool } from "@/lib/db";
import { currentUser } from "@/auth";
import {
  sls,
  locations,
  visits,
  comments,
  locationImages,
  users,
} from "@/lib/schema";
import { seedLocations, seedSls } from "@/lib/data";
import { readDemo, updateDemo } from "@/lib/demo";
import { locationInput, slsInput } from "@/lib/validation";
export const dynamic = "force-dynamic";
const limiters = new Map<string, { n: number; at: number }>();
function rateLimit(id: string) {
  const now = Date.now();
  if (limiters.size > 5000)
    for (const [key, v] of limiters)
      if (now - v.at > 60000) limiters.delete(key);
  const old = limiters.get(id);
  const v = old && now - old.at < 60000 ? old : { n: 0, at: now };
  v.n++;
  limiters.set(id, v);
  return v.n > 25;
}
export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams;
    if (p.get("revision")) {
      if (!pool) {
        const data = await readDemo();
        return Response.json({
          revision: `demo:${data.visits.length}:${data.comments.length}`,
        });
      }
      const result = await pool.query(
        `SELECT concat_ws('|',
          (SELECT count(*) FROM locations),
          coalesce((SELECT extract(epoch FROM max(updated_at))::bigint FROM locations), 0),
          (SELECT count(*) FROM visits),
          coalesce((SELECT extract(epoch FROM max(visited_at))::bigint FROM visits), 0),
          (SELECT count(*) FROM comments),
          coalesce((SELECT extract(epoch FROM max(created_at))::bigint FROM comments), 0),
          coalesce((SELECT extract(epoch FROM max(updated_at))::bigint FROM comments), 0),
          coalesce((SELECT extract(epoch FROM max(updated_at))::bigint FROM sls), 0)
        ) AS revision`,
      );
      return Response.json({ revision: result.rows[0].revision });
    }
    const user = db ? await currentUser() : null;
    if (p.get("manage")) {
      if (!user)
        return Response.json(
          { error: "Silakan masuk terlebih dahulu." },
          { status: 401 },
        );
      return Response.json({
        comments: await db!
          .select()
          .from(comments)
          .orderBy(desc(comments.created_at))
          .limit(100),
        users:
          user.role === "admin"
            ? await db!
                .select({
                  id: users.id,
                  name: users.name,
                  email: users.email,
                  role: users.role,
                })
                .from(users)
                .limit(100)
            : [],
      });
    }
    const id = p.get("id"),
      slsId = p.get("sls"),
      search = p.get("q") || "",
      status = p.get("status");
    const page = Math.max(1, Number(p.get("page")) || 1);
    const perPage = 100;
    if (!pool) {
      const data = await readDemo();
      let list = seedLocations.map((l) => ({
        ...l,
        visits:
          l.visits + data.visits.filter((v) => v.location_id === l.id).length,
        status:
          l.visits || data.visits.some((v) => v.location_id === l.id)
            ? "visited"
            : "unvisited",
      }));
      list = list.filter(
        (l) =>
          (!id || l.id === id) &&
          (!slsId || l.sls_id === slsId) &&
          (!status || l.status === status) &&
          (!search ||
            `${l.title} ${l.address}`
              .toLowerCase()
              .includes(search.toLowerCase())),
      );
      return Response.json({
        locations: list.slice((page - 1) * perPage, page * perPage),
        sls: seedSls,
        total: list.length,
        stats: {
          total: seedLocations.length,
          visited: seedLocations.filter(
            (l) => l.visits || data.visits.some((v) => v.location_id === l.id),
          ).length,
          sls: seedSls.length,
        },
        comments: data.comments.filter((c) => c.location_id === id),
        demo: true,
        user: null,
      });
    }
    const where: string[] = [];
    const args: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      args.push(value);
      where.push(sql.replace("?", `$${args.length}`));
    };
    if (id) add("l.id = ?", id);
    if (slsId) add("l.sls_id = ?", slsId);
    if (search) add("(l.title || ' ' || l.address) ILIKE ?", `%${search}%`);
    if (status) add("l.status = ?", status);
    const filter = where.length ? " WHERE " + where.join(" AND ") : "";
    const result = await pool.query(
      `SELECT l.*, (SELECT COUNT(*)::int FROM visits v WHERE v.location_id=l.id) AS visits,(SELECT image_url FROM location_images i WHERE i.location_id=l.id ORDER BY is_primary DESC,sort_order LIMIT 1) AS image_url FROM locations l${filter} ORDER BY l.created_at,l.id LIMIT 100 OFFSET $${args.length + 1}`,
      [...args, (page - 1) * perPage],
    );
    const total = await pool.query(
      `SELECT COUNT(*)::int AS count FROM locations l${filter}`,
      args,
    );
    const stats = await pool.query(
      "SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE status='visited')::int AS visited FROM locations",
    );
    const allSls = await db!.select().from(sls).orderBy(sls.code);
    return Response.json({
      locations: result.rows,
      sls: allSls,
      total: total.rows[0].count,
      stats: {
        ...stats.rows[0],
        sls: allSls.filter((s) => s.is_active).length,
      },
      comments: id
        ? await db!
            .select({
              id: comments.id,
              location_id: comments.location_id,
              name: comments.name,
              comment: comments.comment,
              status: comments.status,
              created_at: comments.created_at,
            })
            .from(comments)
            .where(eq(comments.location_id, id))
            .orderBy(desc(comments.created_at))
            .limit(100)
        : [],
      demo: false,
      user,
    });
  } catch (e) {
    console.error(e);
    return Response.json(
      { error: "Data tidak dapat dimuat. Periksa koneksi database." },
      { status: 500 },
    );
  }
}
export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    if (origin && origin !== req.nextUrl.origin)
      return Response.json(
        { error: "Origin tidak diizinkan." },
        { status: 403 },
      );
    if (Number(req.headers.get("content-length") || 0) > 2_000_000)
      return Response.json({ error: "Data terlalu besar." }, { status: 413 });
    const body = await req.json();
    const action = String(body.action || "");
    if (action === "visit" || action === "comment") {
      const input = z
        .object({
          location_id: z.string().max(100),
          visitor_id: z.string().uuid(),
          name: z.string().trim().min(2).max(80).optional(),
          comment: z.string().trim().min(3).max(2000).optional(),
        })
        .parse(body);
      if (rateLimit(input.visitor_id))
        return Response.json(
          { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
          { status: 429 },
        );
      if (action === "comment" && (!input.name || !input.comment))
        return Response.json(
          { error: "Isi nama dan komentar." },
          { status: 400 },
        );
      const exists = db
        ? (
            await db
              .select({ id: locations.id })
              .from(locations)
              .where(eq(locations.id, input.location_id))
          ).length
        : seedLocations.some((l) => l.id === input.location_id);
      if (!exists)
        return Response.json(
          { error: "Lokasi tidak ditemukan." },
          { status: 404 },
        );
      if (db) {
        if (action === "visit")
          await db.transaction(async (tx) => {
            await tx
              .insert(visits)
              .values({
                id: crypto.randomUUID(),
                location_id: input.location_id,
                visitor_id: input.visitor_id,
              })
              .onConflictDoNothing();
            await tx
              .update(locations)
              .set({ status: "visited", updated_at: new Date() })
              .where(eq(locations.id, input.location_id));
          });
        else
          await db
            .insert(comments)
            .values({
              id: crypto.randomUUID(),
              location_id: input.location_id,
              visitor_id: input.visitor_id,
              name: input.name!,
              comment: input.comment!,
              status: "approved",
            });
      } else
        await updateDemo((data) => {
          if (action === "visit") {
            if (
              !data.visits.some(
                (v) =>
                  v.location_id === input.location_id &&
                  v.visitor_id === input.visitor_id,
              )
            )
              data.visits.push({
                location_id: input.location_id,
                visitor_id: input.visitor_id,
              });
          } else
            data.comments.push({
              id: crypto.randomUUID(),
              location_id: input.location_id,
              visitor_id: input.visitor_id,
              name: input.name!,
              comment: input.comment!,
              status: "approved",
              created_at: new Date().toISOString(),
            });
        });
      return Response.json({ ok: true });
    }
    const user = await currentUser();
    if (!user || !db)
      return Response.json(
        { error: "Akses editor diperlukan. Hubungkan PostgreSQL dan masuk." },
        { status: 401 },
      );
    if (!["editor", "admin"].includes(user.role))
      return Response.json({ error: "Akses ditolak." }, { status: 403 });
    if (
      [
        "sls",
        "delete-sls",
        "delete-location",
        "import",
        "user",
        "delete-user",
      ].includes(action) &&
      user.role !== "admin"
    )
      return Response.json(
        { error: "Hanya admin yang dapat melakukan tindakan ini." },
        { status: 403 },
      );
    if (action === "location") {
      const { image_url, id, ...input } = locationInput.parse(body.data);
      const target = id || crypto.randomUUID();
      const [region] = await db
        .select()
        .from(sls)
        .where(eq(sls.id, input.sls_id));
      if (!region || !region.is_active) throw new Error("SLS tidak aktif.");
      await db.transaction(async (tx) => {
        if (id)
          await tx
            .update(locations)
            .set({ ...input, status: undefined, updated_at: new Date() })
            .where(eq(locations.id, id));
        else await tx.insert(locations).values({ ...input, id: target });
        if (image_url !== undefined) {
          await tx
            .delete(locationImages)
            .where(eq(locationImages.location_id, target));
          if (image_url)
            await tx
              .insert(locationImages)
              .values({
                id: crypto.randomUUID(),
                location_id: target,
                image_url,
                is_primary: true,
              });
        }
      });
    } else if (action === "delete-location") {
      await db
        .delete(locations)
        .where(eq(locations.id, z.string().parse(body.id)));
    } else if (action === "delete-comment") {
      await db
        .delete(comments)
        .where(eq(comments.id, z.string().parse(body.id)));
    } else if (action === "sls") {
      const { id, ...input } = slsInput.parse(body.data);
      if (id)
        await db
          .update(sls)
          .set({ ...input, updated_at: new Date() })
          .where(eq(sls.id, id));
      else await db.insert(sls).values({ ...input, id: crypto.randomUUID() });
    } else if (action === "delete-sls") {
      await db.delete(sls).where(eq(sls.id, z.string().parse(body.id)));
    } else if (action === "moderate") {
      await db
        .update(comments)
        .set({
          status: z.enum(["approved", "rejected"]).parse(body.status),
          updated_at: new Date(),
        })
        .where(eq(comments.id, z.string().parse(body.id)));
    } else if (action === "import") {
      const rows = z.array(locationInput).min(1).max(1000).parse(body.rows);
      const allSls = await db.select().from(sls);
      for (const row of rows)
        if (!allSls.some((s) => s.id === row.sls_id && s.is_active))
          throw new Error("SLS tidak ditemukan atau tidak aktif.");
      await db.transaction(async (tx) => {
        for (const row of rows) {
          const input = {
            sls_id: row.sls_id,
            title: row.title,
            address: row.address,
            description: row.description,
            latitude: row.latitude,
            longitude: row.longitude,
            status: row.status,
          };
          await tx
            .insert(locations)
            .values({ ...input, id: crypto.randomUUID() });
        }
      });
    } else if (action === "user") {
      const input = z
        .object({
          name: z.string().min(2).max(80),
          email: z.string().email(),
          password: z.string().min(12).max(100),
          role: z.enum(["admin", "editor"]),
        })
        .parse(body.data);
      await db
        .insert(users)
        .values({
          id: crypto.randomUUID(),
          name: input.name,
          email: input.email.toLowerCase(),
          password_hash: await hash(input.password, 12),
          role: input.role,
        });
    } else if (action === "delete-user") {
      const id = z.string().parse(body.id);
      if (id === user.id)
        throw new Error("Tidak dapat menghapus akun sendiri.");
      await db.delete(users).where(eq(users.id, id));
    } else
      return Response.json(
        { error: "Tindakan tidak dikenal." },
        { status: 400 },
      );
    return Response.json({ ok: true });
  } catch (e) {
    console.error(e);
    return Response.json(
      {
        error:
          e instanceof z.ZodError
            ? "Data tidak valid. Periksa semua isian."
            : "Perubahan gagal. Periksa data, kode unik, dan keterkaitan SLS.",
      },
      { status: 400 },
    );
  }
}
