import "dotenv/config";

import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  locations,
  transportRoutes,
  transportRouteStops,
} from "@/server/db/schema";

const requiredLocationSlugs = [
  "bgc-bus-edsa-ayala-terminal",
  "hsbc-bgc-bus-stop",
];

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined.");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const db = drizzle(pool);

  try {
    const result = await db.transaction(async (transaction) => {
      const locationRows = await transaction
        .select({
          id: locations.id,
          slug: locations.slug,
        })
        .from(locations)
        .where(inArray(locations.slug, requiredLocationSlugs));

      const locationsBySlug = new Map(
        locationRows.map((location) => [location.slug, location]),
      );

      function requireLocation(slug: string) {
        const location = locationsBySlug.get(slug);

        if (!location) {
          throw new Error(
            `Required location "${slug}" is missing. Run pnpm db:seed first.`,
          );
        }

        return location;
      }

      const [transportRoute] = await transaction
        .insert(transportRoutes)
        .values({
          slug: "bgc-bus-north-route",
          name: "BGC Bus North Route",
          mode: "bgc_bus",
          operator: "Bonifacio Transport Corporation",
          signboard: "North Route",
          description:
            "Inactive draft containing the EDSA Ayala to HSBC portion needed by the first example journey.",
          isActive: false,
        })
        .onConflictDoUpdate({
          target: transportRoutes.slug,
          set: {
            name: "BGC Bus North Route",
            mode: "bgc_bus",
            operator: "Bonifacio Transport Corporation",
            signboard: "North Route",
            description:
              "Inactive draft containing the EDSA Ayala to HSBC portion needed by the first example journey.",
            isActive: false,
            updatedAt: new Date(),
          },
        })
        .returning({
          id: transportRoutes.id,
          slug: transportRoutes.slug,
          name: transportRoutes.name,
          isActive: transportRoutes.isActive,
        });

      if (!transportRoute) {
        throw new Error("Failed to seed the BGC Bus North Route.");
      }

      const draftStops = [
        {
          locationSlug: "bgc-bus-edsa-ayala-terminal",
          position: 1,
          canBoard: true,
          canAlight: false,
          pickupLandmark:
            "McKinley Exchange Corporate Center beside MRT-3 Ayala Station",
          dropoffLandmark: null,
          pickupInstructions:
            "From One Ayala, cross EDSA using the pedestrian connection toward MRT-3 Ayala Station and McKinley Exchange. Look for the BGC Bus terminal.",
          dropoffInstructions: null,
        },
        {
          locationSlug: "hsbc-bgc-bus-stop",
          position: 2,
          canBoard: true,
          canAlight: true,
          pickupLandmark: "HSBC Centre along 5th Avenue",
          dropoffLandmark: "HSBC Centre along 5th Avenue",
          pickupInstructions: "Wait only at the designated HSBC BGC Bus stop.",
          dropoffInstructions:
            "Alight at the designated HSBC stop, then walk toward Bonifacio High Street.",
        },
      ];

      const seededStops = [];

      for (const stop of draftStops) {
        const location = requireLocation(stop.locationSlug);

        const [seededStop] = await transaction
          .insert(transportRouteStops)
          .values({
            transportRouteId: transportRoute.id,
            locationId: location.id,
            position: stop.position,
            canBoard: stop.canBoard,
            canAlight: stop.canAlight,
            pickupLandmark: stop.pickupLandmark,
            dropoffLandmark: stop.dropoffLandmark,
            pickupInstructions: stop.pickupInstructions,
            dropoffInstructions: stop.dropoffInstructions,
          })
          .onConflictDoUpdate({
            target: [
              transportRouteStops.transportRouteId,
              transportRouteStops.position,
            ],
            set: {
              locationId: location.id,
              canBoard: stop.canBoard,
              canAlight: stop.canAlight,
              pickupLandmark: stop.pickupLandmark,
              dropoffLandmark: stop.dropoffLandmark,
              pickupInstructions: stop.pickupInstructions,
              dropoffInstructions: stop.dropoffInstructions,
              updatedAt: new Date(),
            },
          })
          .returning({
            id: transportRouteStops.id,
            position: transportRouteStops.position,
          });

        if (!seededStop) {
          throw new Error(
            `Failed to seed route stop at position ${stop.position}.`,
          );
        }

        seededStops.push({
          ...seededStop,
          locationSlug: stop.locationSlug,
        });
      }

      return {
        transportRoute,
        seededStops,
      };
    });

    console.table(result.seededStops);
    console.log(
      `Seeded inactive draft transport route: ${result.transportRoute.name}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
