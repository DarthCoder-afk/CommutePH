import "server-only";

import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { locations } from "@/server/db/schema";

export const nearbyLocationMaximumRadiusMeters = 10_000;
export const nearbyLocationDefaultLimit = 5;
export const nearbyLocationMaximumLimit = 10;

export async function searchNearbyActiveLocations({
  longitude,
  latitude,
  radiusMeters,
  limit = nearbyLocationDefaultLimit,
}: {
  longitude: number;
  latitude: number;
  radiusMeters: number;
  limit?: number;
}) {
  const searchPoint = sql`
    ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
  `;
  const distanceMeters = sql<number>`
    ST_Distance(${locations.coordinates}::geography, ${searchPoint})
  `;
  const rows = await db
    .select({
      id: locations.id,
      name: locations.name,
      slug: locations.slug,
      kind: locations.kind,
      description: locations.description,
      city: locations.city,
      area: locations.area,
      coordinates: locations.coordinates,
      distanceMeters,
    })
    .from(locations)
    .where(
      and(
        eq(locations.isActive, true),
        eq(locations.verificationStatus, "verified"),
        sql`ST_DWithin(
          ${locations.coordinates}::geography,
          ${searchPoint},
          ${radiusMeters}
        )`,
      ),
    )
    .orderBy(asc(distanceMeters), asc(locations.name))
    .limit(Math.min(limit, nearbyLocationMaximumLimit));

  return rows.map(({ coordinates, distanceMeters: distance, ...location }) => ({
    location: {
      ...location,
      longitude: coordinates.x,
      latitude: coordinates.y,
    },
    distanceMeters: Number(distance),
  }));
}

export async function searchNearbyDevelopmentLocations({
  longitude,
  latitude,
  radiusMeters,
  limit = nearbyLocationDefaultLimit,
}: {
  longitude: number;
  latitude: number;
  radiusMeters: number;
  limit?: number;
}) {
  const searchPoint = sql`
    ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
  `;
  const distanceMeters = sql<number>`
    ST_Distance(${locations.coordinates}::geography, ${searchPoint})
  `;
  const rows = await db
    .select({
      id: locations.id,
      name: locations.name,
      slug: locations.slug,
      kind: locations.kind,
      description: locations.description,
      city: locations.city,
      area: locations.area,
      coordinates: locations.coordinates,
      verificationStatus: locations.verificationStatus,
      sourceType: locations.sourceType,
      distanceMeters,
    })
    .from(locations)
    .where(
      and(
        eq(locations.isActive, false),
        ne(locations.verificationStatus, "verified"),
        inArray(locations.sourceType, ["openstreetmap", "gtfs"]),
        inArray(locations.kind, ["station", "terminal", "stop"]),
        sql`ST_DWithin(
          ${locations.coordinates}::geography,
          ${searchPoint},
          ${radiusMeters}
        )`,
      ),
    )
    .orderBy(asc(distanceMeters), asc(locations.name))
    .limit(Math.min(limit, nearbyLocationMaximumLimit));

  return rows.map(({ coordinates, distanceMeters: distance, ...location }) => ({
    location: {
      ...location,
      verificationStatus: location.verificationStatus as
        "unverified" | "outdated",
      sourceType: location.sourceType as "openstreetmap" | "gtfs",
      longitude: coordinates.x,
      latitude: coordinates.y,
    },
    distanceMeters: Number(distance),
  }));
}
