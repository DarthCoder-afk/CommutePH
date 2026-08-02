import "dotenv/config";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  journeySegments,
  journeySteps,
  journeys,
  locations,
  transportRoutes,
  transportRouteStops,
} from "@/server/db/schema";

const requiredLocationSlugs = [
  "one-ayala-terminal",
  "bgc-high-street",
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

      const origin = requireLocation("one-ayala-terminal");
      const destination = requireLocation("bgc-high-street");
      const pickupLocation = requireLocation("bgc-bus-edsa-ayala-terminal");
      const dropoffLocation = requireLocation("hsbc-bgc-bus-stop");

      const routeStopRows = await transaction
        .select({
          id: transportRouteStops.id,
          position: transportRouteStops.position,
          canBoard: transportRouteStops.canBoard,
          canAlight: transportRouteStops.canAlight,
          locationSlug: locations.slug,
        })
        .from(transportRouteStops)
        .innerJoin(
          transportRoutes,
          eq(transportRoutes.id, transportRouteStops.transportRouteId),
        )
        .innerJoin(locations, eq(locations.id, transportRouteStops.locationId))
        .where(eq(transportRoutes.slug, "bgc-bus-north-route"));

      const routeStopsByLocationSlug = new Map(
        routeStopRows.map((routeStop) => [routeStop.locationSlug, routeStop]),
      );

      const boardingStop = routeStopsByLocationSlug.get(
        "bgc-bus-edsa-ayala-terminal",
      );

      const alightingStop = routeStopsByLocationSlug.get("hsbc-bgc-bus-stop");

      if (!boardingStop) {
        throw new Error(
          "The BGC Bus EDSA Ayala boarding stop is missing. Run pnpm db:seed-draft-routes first.",
        );
      }

      if (!alightingStop) {
        throw new Error(
          "The HSBC BGC Bus alighting stop is missing. Run pnpm db:seed-draft-routes first.",
        );
      }

      if (!boardingStop.canBoard) {
        throw new Error("The EDSA Ayala route stop does not allow boarding.");
      }

      if (!alightingStop.canAlight) {
        throw new Error("The HSBC route stop does not allow alighting.");
      }

      if (boardingStop.position >= alightingStop.position) {
        throw new Error(
          "The boarding stop must appear before the alighting stop.",
        );
      }

      const [seededJourney] = await transaction
        .insert(journeys)
        .values({
          slug: "one-ayala-to-bgc-high-street-via-bgc-bus",
          title: "One Ayala to BGC High Street via BGC Bus",
          summary:
            "Inactive draft journey using the BGC Bus North Route and the HSBC stop.",
          originLocationId: origin.id,
          destinationLocationId: destination.id,
          estimatedDurationMin: null,
          estimatedDurationMax: null,
          estimatedFareMinCentavos: null,
          estimatedFareMaxCentavos: null,
          status: "draft",
          lastVerifiedAt: null,
          isActive: false,
        })
        .onConflictDoUpdate({
          target: journeys.slug,
          set: {
            title: "One Ayala to BGC High Street via BGC Bus",
            summary:
              "Inactive draft journey using the BGC Bus North Route and the HSBC stop.",
            originLocationId: origin.id,
            destinationLocationId: destination.id,
            estimatedDurationMin: null,
            estimatedDurationMax: null,
            estimatedFareMinCentavos: null,
            estimatedFareMaxCentavos: null,
            status: "draft",
            lastVerifiedAt: null,
            isActive: false,
            updatedAt: new Date(),
          },
        })
        .returning({
          id: journeys.id,
          slug: journeys.slug,
          title: journeys.title,
          status: journeys.status,
          isActive: journeys.isActive,
        });

      if (!seededJourney) {
        throw new Error("Failed to seed the draft journey.");
      }

      const segmentDefinitions: Array<{
        position: number;
        kind: "walking" | "transit";
        summary: string;
        walkingFromLocationId: string | null;
        walkingToLocationId: string | null;
        boardingRouteStopId: string | null;
        alightingRouteStopId: string | null;
        notes: string;
        steps: string[];
      }> = [
        {
          position: 1,
          kind: "walking",
          summary: "Walk from One Ayala to the BGC Bus EDSA Ayala Terminal.",
          walkingFromLocationId: origin.id,
          walkingToLocationId: pickupLocation.id,
          boardingRouteStopId: null,
          alightingRouteStopId: null,
          notes:
            "Draft: pedestrian path and accessibility details require onsite verification.",
          steps: [
            "Inside One Ayala, follow signs toward MRT-3 Ayala Station.",
            "Use the elevated pedestrian connection to cross EDSA toward McKinley Exchange Corporate Center.",
            "Proceed to the BGC Bus terminal and find the North Route queue.",
          ],
        },
        {
          position: 2,
          kind: "transit",
          summary: "Take the BGC Bus North Route from EDSA Ayala to HSBC.",
          walkingFromLocationId: null,
          walkingToLocationId: null,
          boardingRouteStopId: boardingStop.id,
          alightingRouteStopId: alightingStop.id,
          notes:
            "Draft: confirm the route, fare, schedule, payment method, and stop usage onsite.",
          steps: [
            "Confirm that the bus signboard says North Route before boarding.",
            "Board at the BGC Bus EDSA Ayala Terminal.",
            "Alight at the designated HSBC stop along 5th Avenue.",
          ],
        },
        {
          position: 3,
          kind: "walking",
          summary: "Walk from the HSBC BGC Bus stop to BGC High Street.",
          walkingFromLocationId: dropoffLocation.id,
          walkingToLocationId: destination.id,
          boardingRouteStopId: null,
          alightingRouteStopId: null,
          notes:
            "Draft: pedestrian path, crossings, and final landmark require onsite verification.",
          steps: [
            "From the HSBC stop, walk toward Bonifacio High Street.",
            "Use the designated pedestrian crossing and continue to the selected High Street entrance.",
          ],
        },
      ];

      const seededSteps = [];

      const seededSegments = [];

      for (const segment of segmentDefinitions) {
        const [seededSegment] = await transaction
          .insert(journeySegments)
          .values({
            journeyId: seededJourney.id,
            position: segment.position,
            kind: segment.kind,
            summary: segment.summary,
            walkingFromLocationId: segment.walkingFromLocationId,
            walkingToLocationId: segment.walkingToLocationId,
            boardingRouteStopId: segment.boardingRouteStopId,
            alightingRouteStopId: segment.alightingRouteStopId,
            estimatedDurationMin: null,
            estimatedDurationMax: null,
            estimatedFareMinCentavos: null,
            estimatedFareMaxCentavos: null,
            notes: segment.notes,
          })
          .onConflictDoUpdate({
            target: [journeySegments.journeyId, journeySegments.position],
            set: {
              kind: segment.kind,
              summary: segment.summary,
              walkingFromLocationId: segment.walkingFromLocationId,
              walkingToLocationId: segment.walkingToLocationId,
              boardingRouteStopId: segment.boardingRouteStopId,
              alightingRouteStopId: segment.alightingRouteStopId,
              estimatedDurationMin: null,
              estimatedDurationMax: null,
              estimatedFareMinCentavos: null,
              estimatedFareMaxCentavos: null,
              notes: segment.notes,
              updatedAt: new Date(),
            },
          })
          .returning({
            id: journeySegments.id,
            position: journeySegments.position,
            kind: journeySegments.kind,
            summary: journeySegments.summary,
          });

        if (!seededSegment) {
          throw new Error(
            `Failed to seed journey segment at position ${segment.position}.`,
          );
        }

        seededSegments.push(seededSegment);

        for (const [stepIndex, instruction] of segment.steps.entries()) {
          const stepPosition = stepIndex + 1;

          const [seededStep] = await transaction
            .insert(journeySteps)
            .values({
              journeySegmentId: seededSegment.id,
              position: stepPosition,
              instruction,
            })
            .onConflictDoUpdate({
              target: [journeySteps.journeySegmentId, journeySteps.position],
              set: {
                instruction,
                updatedAt: new Date(),
              },
            })
            .returning({
              id: journeySteps.id,
              journeySegmentId: journeySteps.journeySegmentId,
              position: journeySteps.position,
              instruction: journeySteps.instruction,
            });

          if (!seededStep) {
            throw new Error(
              `Failed to seed step ${stepPosition} for segment ${segment.position}.`,
            );
          }

          seededSteps.push({
            ...seededStep,
            segmentPosition: segment.position,
          });
        }
      }

      return {
        journey: seededJourney,
        segments: seededSegments,
        steps: seededSteps,
      };
    });

    console.table(result.segments);
    console.table(result.steps);

    console.log(
      `Seeded inactive draft journey with ${result.segments.length} segments and ${result.steps.length} steps: ${result.journey.title}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
