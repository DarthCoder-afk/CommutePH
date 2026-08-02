import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  geometry,
  index,
  integer,
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

export const journeyStatusEnum = pgEnum("journey_status", [
  "draft",
  "verified",
  "outdated",
]);

export const journeys = pgTable(
  "journeys",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    slug: varchar("slug", { length: 200 }).notNull(),

    title: varchar("title", { length: 180 }).notNull(),

    summary: text("summary").notNull(),

    originLocationId: uuid("origin_location_id")
      .notNull()
      .references(() => locations.id, {
        onDelete: "restrict",
      }),

    destinationLocationId: uuid("destination_location_id")
      .notNull()
      .references(() => locations.id, {
        onDelete: "restrict",
      }),

    estimatedDurationMin: integer("estimated_duration_min"),

    estimatedDurationMax: integer("estimated_duration_max"),

    estimatedFareMinCentavos: integer("estimated_fare_min_centavos"),

    estimatedFareMaxCentavos: integer("estimated_fare_max_centavos"),

    status: journeyStatusEnum("status").default("draft").notNull(),

    lastVerifiedAt: timestamp("last_verified_at", {
      withTimezone: true,
      mode: "date",
    }),

    isActive: boolean("is_active").default(false).notNull(),

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
    uniqueIndex("journeys_slug_uidx").on(table.slug),

    index("journeys_origin_destination_idx").on(
      table.originLocationId,
      table.destinationLocationId,
    ),

    check(
      "journeys_distinct_endpoints",
      sql`${table.originLocationId} <> ${table.destinationLocationId}`,
    ),

    check(
      "journeys_duration_range_valid",
      sql`
        (
          ${table.estimatedDurationMin} IS NULL
          AND ${table.estimatedDurationMax} IS NULL
        )
        OR
        (
          ${table.estimatedDurationMin} IS NOT NULL
          AND ${table.estimatedDurationMax} IS NOT NULL
          AND ${table.estimatedDurationMin} >= 1
          AND ${table.estimatedDurationMax}
            >= ${table.estimatedDurationMin}
        )
      `,
    ),

    check(
      "journeys_fare_range_valid",
      sql`
        (
          ${table.estimatedFareMinCentavos} IS NULL
          AND ${table.estimatedFareMaxCentavos} IS NULL
        )
        OR
        (
          ${table.estimatedFareMinCentavos} IS NOT NULL
          AND ${table.estimatedFareMaxCentavos} IS NOT NULL
          AND ${table.estimatedFareMinCentavos} >= 0
          AND ${table.estimatedFareMaxCentavos}
            >= ${table.estimatedFareMinCentavos}
        )
      `,
    ),

    check(
      "journeys_verified_requires_date",
      sql`
        ${table.status} <> 'verified'
        OR ${table.lastVerifiedAt} IS NOT NULL
      `,
    ),

    check(
      "journeys_active_requires_complete_verification",
      sql`
        NOT ${table.isActive}
        OR
        (
          ${table.status} = 'verified'
          AND ${table.lastVerifiedAt} IS NOT NULL
          AND ${table.estimatedDurationMin} IS NOT NULL
          AND ${table.estimatedDurationMax} IS NOT NULL
          AND ${table.estimatedFareMinCentavos} IS NOT NULL
          AND ${table.estimatedFareMaxCentavos} IS NOT NULL
        )
      `,
    ),
  ],
);

export type Journey = typeof journeys.$inferSelect;
export type NewJourney = typeof journeys.$inferInsert;

export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;
