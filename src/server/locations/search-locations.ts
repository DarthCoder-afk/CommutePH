import "server-only";

import { and, asc, eq, ilike, or } from "drizzle-orm";

import { db } from "@/server/db";
import { locations } from "@/server/db/schema";

export const locationSearchMinLength = 2;
export const locationSearchMaxLength = 80;

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function searchActiveLocations(query: string) {
  const normalizedQuery = query.trim();

  const searchCondition =
    normalizedQuery.length === 0
      ? eq(locations.isActive, true)
      : and(
          eq(locations.isActive, true),
          or(
            ilike(locations.name, `%${escapeLikePattern(normalizedQuery)}%`),
            ilike(locations.city, `%${escapeLikePattern(normalizedQuery)}%`),
            ilike(locations.area, `%${escapeLikePattern(normalizedQuery)}%`),
          ),
        );

  const locationRows = await db
    .select({
      id: locations.id,
      name: locations.name,
      slug: locations.slug,
      kind: locations.kind,
      description: locations.description,
      city: locations.city,
      area: locations.area,
      coordinates: locations.coordinates,
    })
    .from(locations)
    .where(searchCondition)
    .orderBy(asc(locations.name))
    .limit(10);

  return locationRows.map(({ coordinates, ...location }) => ({
    ...location,
    longitude: coordinates.x,
    latitude: coordinates.y,
  }));
}
