import {
  pgTable,
  text,
  timestamp,
  doublePrecision,
  boolean,
  integer,
  uniqueIndex,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
const timestamps = {
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
};
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password_hash: text("password_hash").notNull(),
  role: text("role").notNull().default("editor"),
  ...timestamps,
});
export const sls = pgTable("sls", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  marker_color: text("marker_color").notNull().default("#238c6d"),
  boundary: jsonb("boundary").$type<[number, number][]>().default([]).notNull(),
  is_active: boolean("is_active").notNull().default(true),
  ...timestamps,
});
export const locations = pgTable(
  "locations",
  {
    id: text("id").primaryKey(),
    sls_id: text("sls_id")
      .notNull()
      .references(() => sls.id),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    address: text("address").notNull().default(""),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    status: text("status").notNull().default("unvisited"),
    ...timestamps,
  },
  (t) => [
    index("locations_sls_idx").on(t.sls_id),
    index("locations_lat_idx").on(t.latitude),
    index("locations_lng_idx").on(t.longitude),
  ],
);
export const locationImages = pgTable("location_images", {
  id: text("id").primaryKey(),
  location_id: text("location_id")
    .notNull()
    .references(() => locations.id, { onDelete: "cascade" }),
  image_url: text("image_url").notNull(),
  is_primary: boolean("is_primary").notNull().default(false),
  sort_order: integer("sort_order").default(0).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});
export const visits = pgTable(
  "visits",
  {
    id: text("id").primaryKey(),
    location_id: text("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    visitor_id: text("visitor_id").notNull(),
    visited_at: timestamp("visited_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("visits_location_visitor_unique").on(
      t.location_id,
      t.visitor_id,
    ),
    index("visits_location_idx").on(t.location_id),
  ],
);
export const comments = pgTable(
  "comments",
  {
    id: text("id").primaryKey(),
    location_id: text("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    visitor_id: text("visitor_id").notNull(),
    name: text("name").notNull(),
    comment: text("comment").notNull(),
    status: text("status").notNull().default("approved"),
    ...timestamps,
  },
  (t) => [index("comments_location_idx").on(t.location_id)],
);
