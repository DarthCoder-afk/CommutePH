import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  geometry,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const locationKindEnum = pgEnum("location_kind", [
  "area",
  "landmark",
  "station",
  "terminal",
  "stop",
  "entrance",
]);

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    name: varchar("name", { length: 160 }).notNull(),

    slug: varchar("slug", { length: 180 }).notNull(),

    kind: locationKindEnum("kind").notNull(),

    description: text("description"),

    city: varchar("city", { length: 80 }).notNull(),

    area: varchar("area", { length: 100 }),

    coordinates: geometry("coordinates", {
      type: "point",
      mode: "xy",
      srid: 4326,
    }).notNull(),

    isActive: boolean("is_active").default(true).notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("locations_slug_uidx").on(table.slug),

    index("locations_coordinates_gix").using("gist", table.coordinates),

    check(
      "locations_coordinates_valid",
      sql`
        ST_X(${table.coordinates}) BETWEEN -180 AND 180
        AND ST_Y(${table.coordinates}) BETWEEN -90 AND 90
      `,
    ),
  ],
);

export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;
