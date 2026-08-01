import { asc, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { locations } from "@/server/db/schema";

export const runtime = "nodejs";

export async function GET() {
  try {
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
      .where(eq(locations.isActive, true))
      .orderBy(asc(locations.name));

    const responseLocations = locationRows.map(
      ({ coordinates, ...location }) => ({
        ...location,
        longitude: coordinates.x,
        latitude: coordinates.y,
      }),
    );

    return Response.json({
      data: responseLocations,
    });
  } catch (error) {
    console.error("Failed to fetch locations:", error);

    return Response.json(
      {
        error: {
          code: "LOCATIONS_FETCH_FAILED",
          message: "Unable to fetch locations.",
        },
      },
      {
        status: 500,
      },
    );
  }
}
