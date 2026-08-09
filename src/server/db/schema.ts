import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
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

const postgisLineString = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return "geometry(LineString, 4326)";
  },
  toDriver(value) {
    return value;
  },
  fromDriver(value) {
    return value;
  },
});

export const locationKindEnum = pgEnum("location_kind", [
  "area",
  "landmark",
  "station",
  "terminal",
  "stop",
  "entrance",
]);

export const locationVerificationStatusEnum = pgEnum(
  "location_verification_status",
  ["unverified", "verified", "outdated"],
);

export const locationSourceTypeEnum = pgEnum("location_source_type", [
  "manual",
  "openstreetmap",
  "gtfs",
  "development_fixture",
]);

export const locationDuplicateReviewStatusEnum = pgEnum(
  "location_duplicate_review_status",
  ["pending", "distinct", "duplicate", "needs_field_check"],
);

export const locationDuplicateDetectionReasonEnum = pgEnum(
  "location_duplicate_detection_reason",
  ["same_normalized_name", "very_close_proximity"],
);

export const locationFieldObservationOutcomeEnum = pgEnum(
  "location_field_observation_outcome",
  ["confirmed", "not_found", "needs_follow_up"],
);

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

    verificationStatus: locationVerificationStatusEnum("verification_status")
      .default("unverified")
      .notNull(),

    lastVerifiedAt: timestamp("last_verified_at", {
      withTimezone: true,
      mode: "date",
    }),

    sourceType: locationSourceTypeEnum("source_type")
      .default("manual")
      .notNull(),

    sourceExternalId: varchar("source_external_id", { length: 200 }),

    sourceUrl: text("source_url"),

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
    uniqueIndex("locations_slug_uidx").on(table.slug),

    uniqueIndex("locations_source_external_id_uidx")
      .on(table.sourceType, table.sourceExternalId)
      .where(sql`${table.sourceExternalId} IS NOT NULL`),

    index("locations_coordinates_gix").using("gist", table.coordinates),

    check(
      "locations_coordinates_valid",
      sql`
        ST_X(${table.coordinates}) BETWEEN -180 AND 180
        AND ST_Y(${table.coordinates}) BETWEEN -90 AND 90
      `,
    ),

    check(
      "locations_active_requires_verified",
      sql`NOT ${table.isActive} OR ${table.verificationStatus} = 'verified'`,
    ),

    check(
      "locations_external_source_has_id",
      sql`
        ${table.sourceType} NOT IN ('openstreetmap', 'gtfs')
        OR ${table.sourceExternalId} IS NOT NULL
      `,
    ),
  ],
);

export const locationDuplicateReviews = pgTable(
  "location_duplicate_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    firstLocationId: uuid("first_location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),

    secondLocationId: uuid("second_location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),

    status: locationDuplicateReviewStatusEnum("status")
      .default("pending")
      .notNull(),

    detectionReason:
      locationDuplicateDetectionReasonEnum("detection_reason").notNull(),

    detectedDistanceMeters: integer("detected_distance_meters").notNull(),

    reviewerNotes: text("reviewer_notes"),

    reviewedAt: timestamp("reviewed_at", {
      withTimezone: true,
      mode: "date",
    }),

    lastDetectedAt: timestamp("last_detected_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),

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
    uniqueIndex("location_duplicate_reviews_pair_uidx").on(
      table.firstLocationId,
      table.secondLocationId,
    ),

    index("location_duplicate_reviews_status_idx").on(table.status),

    check(
      "location_duplicate_reviews_canonical_pair",
      sql`${table.firstLocationId}::text < ${table.secondLocationId}::text`,
    ),

    check(
      "location_duplicate_reviews_distance_nonnegative",
      sql`${table.detectedDistanceMeters} >= 0`,
    ),

    check(
      "location_duplicate_reviews_decision_metadata_valid",
      sql`
        (
          ${table.status} = 'pending'
          AND ${table.reviewerNotes} IS NULL
          AND ${table.reviewedAt} IS NULL
        )
        OR
        (
          ${table.status} <> 'pending'
          AND ${table.reviewerNotes} IS NOT NULL
          AND length(btrim(${table.reviewerNotes})) >= 10
          AND ${table.reviewedAt} IS NOT NULL
        )
      `,
    ),
  ],
);

export const locationFieldObservations = pgTable(
  "location_field_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),

    outcome: locationFieldObservationOutcomeEnum("outcome").notNull(),

    observedAt: timestamp("observed_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),

    observerLabel: varchar("observer_label", { length: 120 }).notNull(),

    notes: text("notes").notNull(),

    observedName: varchar("observed_name", { length: 160 }),

    observedKind: locationKindEnum("observed_kind"),

    observedCoordinates: geometry("observed_coordinates", {
      type: "point",
      mode: "xy",
      srid: 4326,
    }),

    accuracyMeters: integer("accuracy_meters"),

    evidenceUrl: text("evidence_url"),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("location_field_observations_location_observed_idx").on(
      table.locationId,
      table.observedAt,
    ),

    uniqueIndex("location_field_observations_submission_uidx").on(
      table.locationId,
      table.observedAt,
      table.observerLabel,
    ),

    check(
      "location_field_observations_observer_valid",
      sql`length(btrim(${table.observerLabel})) >= 2`,
    ),

    check(
      "location_field_observations_notes_valid",
      sql`length(btrim(${table.notes})) >= 20`,
    ),

    check(
      "location_field_observations_time_valid",
      sql`${table.observedAt} <= ${table.createdAt}`,
    ),

    check(
      "location_field_observations_coordinates_valid",
      sql`
        ${table.observedCoordinates} IS NULL
        OR
        (
          ST_X(${table.observedCoordinates}) BETWEEN -180 AND 180
          AND ST_Y(${table.observedCoordinates}) BETWEEN -90 AND 90
        )
      `,
    ),

    check(
      "location_field_observations_accuracy_valid",
      sql`
        (
          ${table.observedCoordinates} IS NULL
          AND ${table.accuracyMeters} IS NULL
        )
        OR
        (
          ${table.observedCoordinates} IS NOT NULL
          AND ${table.accuracyMeters} IS NOT NULL
          AND ${table.accuracyMeters} BETWEEN 1 AND 10000
        )
      `,
    ),

    check(
      "location_field_observations_confirmed_details_valid",
      sql`
        ${table.outcome} <> 'confirmed'
        OR
        (
          ${table.observedName} IS NOT NULL
          AND length(btrim(${table.observedName})) > 0
          AND ${table.observedKind} IS NOT NULL
          AND ${table.observedCoordinates} IS NOT NULL
        )
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

export const journeySourceTypeEnum = pgEnum("journey_source_type", [
  "official_web",
  "operator_social",
  "field_check",
]);

export const journeySources = pgTable(
  "journey_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    journeyId: uuid("journey_id")
      .notNull()
      .references(() => journeys.id, {
        onDelete: "cascade",
      }),

    sourceType: journeySourceTypeEnum("source_type").notNull(),

    title: varchar("title", {
      length: 200,
    }).notNull(),

    publisher: varchar("publisher", {
      length: 160,
    }).notNull(),

    url: varchar("url", {
      length: 500,
    }),

    checkedAt: timestamp("checked_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),

    notes: text("notes"),

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
    uniqueIndex("journey_sources_journey_url_uidx").on(
      table.journeyId,
      table.url,
    ),

    index("journey_sources_journey_checked_at_idx").on(
      table.journeyId,
      table.checkedAt,
    ),

    check(
      "journey_sources_title_not_blank",
      sql`length(btrim(${table.title})) > 0`,
    ),

    check(
      "journey_sources_publisher_not_blank",
      sql`length(btrim(${table.publisher})) > 0`,
    ),

    check(
      "journey_sources_web_requires_url",
      sql`
        ${table.sourceType} = 'field_check'
        OR ${table.url} IS NOT NULL
      `,
    ),
  ],
);

export const transportModeEnum = pgEnum("transport_mode", [
  "jeepney",
  "modern_jeepney",
  "city_bus",
  "bgc_bus",
]);

export const transportRoutes = pgTable(
  "transport_routes",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    slug: varchar("slug", { length: 180 }).notNull(),

    name: varchar("name", { length: 180 }).notNull(),

    mode: transportModeEnum("mode").notNull(),

    operator: varchar("operator", { length: 160 }),

    signboard: varchar("signboard", { length: 200 }),

    description: text("description"),

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
  (table) => [uniqueIndex("transport_routes_slug_uidx").on(table.slug)],
);

export const transportRouteSchedules = pgTable(
  "transport_route_schedules",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    transportRouteId: uuid("transport_route_id")
      .notNull()
      .references(() => transportRoutes.id, {
        onDelete: "cascade",
      }),

    position: integer("position").notNull(),

    serviceDays: varchar("service_days", {
      length: 100,
    }).notNull(),

    operatingHours: varchar("operating_hours", {
      length: 160,
    }).notNull(),

    publicNotes: text("public_notes"),

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
    uniqueIndex("transport_route_schedules_route_position_uidx").on(
      table.transportRouteId,
      table.position,
    ),

    index("transport_route_schedules_route_active_idx").on(
      table.transportRouteId,
      table.isActive,
      table.position,
    ),

    check(
      "transport_route_schedules_position_positive",
      sql`${table.position} >= 1`,
    ),

    check(
      "transport_route_schedules_service_days_not_blank",
      sql`length(btrim(${table.serviceDays})) > 0`,
    ),

    check(
      "transport_route_schedules_operating_hours_not_blank",
      sql`length(btrim(${table.operatingHours})) > 0`,
    ),

    check(
      "transport_route_schedules_public_notes_not_blank",
      sql`
        ${table.publicNotes} IS NULL
        OR length(btrim(${table.publicNotes})) > 0
      `,
    ),

    check(
      "transport_route_schedules_active_requires_verification",
      sql`
        NOT ${table.isActive}
        OR ${table.lastVerifiedAt} IS NOT NULL
      `,
    ),
  ],
);

export const transportRouteStops = pgTable(
  "transport_route_stops",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    transportRouteId: uuid("transport_route_id")
      .notNull()
      .references(() => transportRoutes.id, {
        onDelete: "cascade",
      }),

    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, {
        onDelete: "restrict",
      }),

    position: integer("position").notNull(),

    canBoard: boolean("can_board").default(true).notNull(),

    canAlight: boolean("can_alight").default(true).notNull(),

    pickupLandmark: varchar("pickup_landmark", {
      length: 240,
    }),

    dropoffLandmark: varchar("dropoff_landmark", {
      length: 240,
    }),

    pickupInstructions: text("pickup_instructions"),

    dropoffInstructions: text("dropoff_instructions"),

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
    uniqueIndex("transport_route_stops_route_position_uidx").on(
      table.transportRouteId,
      table.position,
    ),

    index("transport_route_stops_location_idx").on(table.locationId),

    check(
      "transport_route_stops_position_positive",
      sql`${table.position} >= 1`,
    ),
  ],
);

export const journeySegmentKindEnum = pgEnum("journey_segment_kind", [
  "walking",
  "transit",
]);

export const journeySegments = pgTable(
  "journey_segments",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    journeyId: uuid("journey_id")
      .notNull()
      .references(() => journeys.id, {
        onDelete: "cascade",
      }),

    position: integer("position").notNull(),

    kind: journeySegmentKindEnum("kind").notNull(),

    summary: text("summary").notNull(),

    walkingFromLocationId: uuid("walking_from_location_id").references(
      () => locations.id,
      {
        onDelete: "restrict",
      },
    ),

    walkingToLocationId: uuid("walking_to_location_id").references(
      () => locations.id,
      {
        onDelete: "restrict",
      },
    ),

    boardingRouteStopId: uuid("boarding_route_stop_id").references(
      () => transportRouteStops.id,
      {
        onDelete: "restrict",
      },
    ),

    alightingRouteStopId: uuid("alighting_route_stop_id").references(
      () => transportRouteStops.id,
      {
        onDelete: "restrict",
      },
    ),

    estimatedDurationMin: integer("estimated_duration_min"),

    estimatedDurationMax: integer("estimated_duration_max"),

    estimatedFareMinCentavos: integer("estimated_fare_min_centavos"),

    estimatedFareMaxCentavos: integer("estimated_fare_max_centavos"),

    notes: text("notes"),

    publicNotes: text("public_notes"),

    pathGeometry: postgisLineString("path_geometry"),

    pathLastVerifiedAt: timestamp("path_last_verified_at", {
      withTimezone: true,
      mode: "date",
    }),

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
    uniqueIndex("journey_segments_journey_position_uidx").on(
      table.journeyId,
      table.position,
    ),

    index("journey_segments_boarding_route_stop_idx").on(
      table.boardingRouteStopId,
    ),

    index("journey_segments_alighting_route_stop_idx").on(
      table.alightingRouteStopId,
    ),

    check("journey_segments_position_positive", sql`${table.position} >= 1`),

    check(
      "journey_segments_public_notes_not_blank",
      sql`
        ${table.publicNotes} IS NULL
        OR length(btrim(${table.publicNotes})) > 0
      `,
    ),

    check(
      "journey_segments_duration_range_valid",
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
      "journey_segments_path_verification_pair",
      sql`
        (
          ${table.pathGeometry} IS NULL
          AND ${table.pathLastVerifiedAt} IS NULL
        )
        OR
        (
          ${table.pathGeometry} IS NOT NULL
          AND ${table.pathLastVerifiedAt} IS NOT NULL
        )
      `,
    ),

    check(
      "journey_segments_path_not_empty",
      sql`
        ${table.pathGeometry} IS NULL
        OR NOT ST_IsEmpty(${table.pathGeometry})
      `,
    ),

    check(
      "journey_segments_path_world_bounds",
      sql`
        ${table.pathGeometry} IS NULL
        OR ST_CoveredBy(
          ${table.pathGeometry},
          ST_MakeEnvelope(-180, -90, 180, 90, 4326)
        )
      `,
    ),

    check(
      "journey_segments_fare_range_valid",
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
      "journey_segments_shape_valid",
      sql`
        (
          ${table.kind} = 'walking'
          AND ${table.walkingFromLocationId} IS NOT NULL
          AND ${table.walkingToLocationId} IS NOT NULL
          AND ${table.walkingFromLocationId}
            <> ${table.walkingToLocationId}
          AND ${table.boardingRouteStopId} IS NULL
          AND ${table.alightingRouteStopId} IS NULL
        )
        OR
        (
          ${table.kind} = 'transit'
          AND ${table.walkingFromLocationId} IS NULL
          AND ${table.walkingToLocationId} IS NULL
          AND ${table.boardingRouteStopId} IS NOT NULL
          AND ${table.alightingRouteStopId} IS NOT NULL
          AND ${table.boardingRouteStopId}
            <> ${table.alightingRouteStopId}
        )
      `,
    ),
  ],
);

export const journeySteps = pgTable(
  "journey_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    journeySegmentId: uuid("journey_segment_id")
      .notNull()
      .references(() => journeySegments.id, {
        onDelete: "cascade",
      }),

    position: integer("position").notNull(),

    instruction: text("instruction").notNull(),

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
    uniqueIndex("journey_steps_segment_position_uidx").on(
      table.journeySegmentId,
      table.position,
    ),

    check("journey_steps_position_positive", sql`${table.position} >= 1`),
  ],
);

export type JourneyStep = typeof journeySteps.$inferSelect;
export type NewJourneyStep = typeof journeySteps.$inferInsert;

export type JourneySegment = typeof journeySegments.$inferSelect;
export type NewJourneySegment = typeof journeySegments.$inferInsert;

export type TransportRouteStop = typeof transportRouteStops.$inferSelect;
export type NewTransportRouteStop = typeof transportRouteStops.$inferInsert;

export type TransportRouteSchedule =
  typeof transportRouteSchedules.$inferSelect;
export type NewTransportRouteSchedule =
  typeof transportRouteSchedules.$inferInsert;

export type TransportRoute = typeof transportRoutes.$inferSelect;
export type NewTransportRoute = typeof transportRoutes.$inferInsert;

export type Journey = typeof journeys.$inferSelect;
export type NewJourney = typeof journeys.$inferInsert;

export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;

export type LocationDuplicateReview =
  typeof locationDuplicateReviews.$inferSelect;
export type NewLocationDuplicateReview =
  typeof locationDuplicateReviews.$inferInsert;

export type LocationFieldObservation =
  typeof locationFieldObservations.$inferSelect;
export type NewLocationFieldObservation =
  typeof locationFieldObservations.$inferInsert;

export type JourneySource = typeof journeySources.$inferSelect;
export type NewJourneySource = typeof journeySources.$inferInsert;
