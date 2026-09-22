import { z } from "zod";
const coordinate = (min: number, max: number) =>
  z
    .union([z.number(), z.string().trim().min(1)])
    .transform(Number)
    .pipe(z.number().finite().min(min).max(max));
export const locationInput = z.object({
  id: z.string().max(100).optional(),
  sls_id: z.string().min(1),
  title: z.string().trim().min(2).max(160),
  address: z.string().max(500).default(""),
  description: z.string().max(3000).default(""),
  latitude: coordinate(-90, 90),
  longitude: coordinate(-180, 180),
  status: z.enum(["visited", "unvisited"]).default("unvisited"),
  image_url: z
    .union([
      z.string().url().startsWith("https://"),
      z.string().regex(/^\/uploads\/[a-f0-9-]+\.(jpeg|png|webp)$/),
      z.literal(""),
    ])
    .optional(),
});
export const slsInput = z.object({
  id: z.string().optional(),
  code: z.string().regex(/^SLS-[A-Za-z0-9-]+$/),
  name: z.string().trim().min(2).max(100),
  description: z.string().max(500).default(""),
  marker_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  is_active: z.boolean().default(true),
  boundary: z
    .array(z.tuple([coordinate(-90, 90), coordinate(-180, 180)]))
    .max(1000)
    .default([]),
});
