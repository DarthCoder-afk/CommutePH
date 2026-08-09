import "dotenv/config";

import { asc, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  locations,
  routeFieldObservations,
  routeFieldObservationStops,
  transportRoutes,
} from "@/server/db/schema";

const routeSlug = process.argv.slice(2).find((argument) => argument !== "--");

async function main() {
  if (!routeSlug) {
    throw new Error(
      "Provide a route slug. Example: pnpm db:report-route-field-observations -- bgc-bus-north-route",
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined.");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    const [route] = await db
      .select({
        id: transportRoutes.id,
        name: transportRoutes.name,
        mode: transportRoutes.mode,
        verificationStatus: transportRoutes.verificationStatus,
        lastVerifiedAt: transportRoutes.lastVerifiedAt,
        isActive: transportRoutes.isActive,
      })
      .from(transportRoutes)
      .where(eq(transportRoutes.slug, routeSlug))
      .limit(1);

    if (!route)
      throw new Error(`Transport route "${routeSlug}" was not found.`);

    const observations = await db
      .select()
      .from(routeFieldObservations)
      .where(eq(routeFieldObservations.transportRouteId, route.id))
      .orderBy(desc(routeFieldObservations.observedAt));
    const observationIds = observations.map((observation) => observation.id);
    const stopRows =
      observationIds.length === 0
        ? []
        : await db
            .select({
              observationId: routeFieldObservationStops.routeFieldObservationId,
              position: routeFieldObservationStops.position,
              locationName: locations.name,
              locationSlug: locations.slug,
              canBoard: routeFieldObservationStops.canBoard,
              canAlight: routeFieldObservationStops.canAlight,
              notes: routeFieldObservationStops.notes,
            })
            .from(routeFieldObservationStops)
            .innerJoin(
              locations,
              eq(routeFieldObservationStops.locationId, locations.id),
            )
            .where(
              inArray(
                routeFieldObservationStops.routeFieldObservationId,
                observationIds,
              ),
            )
            .orderBy(
              asc(routeFieldObservationStops.routeFieldObservationId),
              asc(routeFieldObservationStops.position),
            );

    console.log(`Route: ${route.name}`);
    console.log(`Mode: ${route.mode}`);
    console.log(`Verification status: ${route.verificationStatus}`);
    console.log(
      `Last verified at: ${route.lastVerifiedAt?.toISOString() ?? "none"}`,
    );
    console.log(`Currently active: ${route.isActive}`);
    console.log(`Field observations: ${observations.length}`);
    console.table(
      observations.map((observation) => ({
        observationId: observation.id,
        outcome: observation.outcome,
        observedAt: observation.observedAt.toISOString(),
        observer: observation.observerLabel,
        observedName: observation.observedName ?? "",
        observedMode: observation.observedMode ?? "",
        signboard: observation.observedSignboard ?? "",
        serviceDays: observation.serviceDays ?? "",
        operatingHours: observation.operatingHours ?? "",
        fareCentavos:
          observation.fareMinCentavos === null
            ? ""
            : `${observation.fareMinCentavos}-${observation.fareMaxCentavos}`,
        paymentMethod: observation.paymentMethod ?? "",
        stops: stopRows.filter((stop) => stop.observationId === observation.id)
          .length,
        evidenceUrl: observation.evidenceUrl ?? "",
        notes: observation.notes,
      })),
    );

    for (const observation of observations) {
      const stops = stopRows.filter(
        (stop) => stop.observationId === observation.id,
      );
      if (stops.length > 0) {
        console.log(`Stops for observation ${observation.id}:`);
        console.table(stops);
      }
    }

    console.log(
      "Read-only evidence report complete. Observations do not activate or publish routes.",
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
