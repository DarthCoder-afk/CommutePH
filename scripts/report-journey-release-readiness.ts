import "dotenv/config";

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  journeyFieldObservations,
  journeySegments,
  journeySources,
  journeyVerificationDecisions,
  journeys,
  locationFieldObservations,
  locations,
  locationVerificationDecisions,
  routeFieldObservations,
  routeVerificationDecisions,
  transportRouteSchedules,
  transportRoutes,
  transportRouteStops,
} from "@/server/db/schema";
import { isPublicVerificationCurrent } from "@/server/verification/verification-freshness";

const journeySlug = process.argv.slice(2).find((argument) => argument !== "--");

function datesMatch(first: Date | null, second: Date) {
  return first !== null && first.getTime() === second.getTime();
}

function formatRatio(ready: number, total: number) {
  return total === 0 ? "none required" : `${ready}/${total} ready`;
}

async function main() {
  if (!journeySlug) {
    throw new Error(
      "Provide a journey slug. Example: pnpm db:report-journey-release-readiness -- one-ayala-to-bgc-high-street-via-bgc-bus",
    );
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined.");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  const currentTime = new Date();

  try {
    const [journey] = await db
      .select({
        id: journeys.id,
        slug: journeys.slug,
        title: journeys.title,
        originLocationId: journeys.originLocationId,
        destinationLocationId: journeys.destinationLocationId,
        status: journeys.status,
        lastVerifiedAt: journeys.lastVerifiedAt,
        isActive: journeys.isActive,
      })
      .from(journeys)
      .where(eq(journeys.slug, journeySlug))
      .limit(1);

    if (!journey) {
      throw new Error(`Journey "${journeySlug}" was not found.`);
    }

    const segmentRows = await db
      .select({
        id: journeySegments.id,
        position: journeySegments.position,
        walkingFromLocationId: journeySegments.walkingFromLocationId,
        walkingToLocationId: journeySegments.walkingToLocationId,
        boardingRouteStopId: journeySegments.boardingRouteStopId,
        alightingRouteStopId: journeySegments.alightingRouteStopId,
        hasPath: sql<boolean>`${journeySegments.pathGeometry} IS NOT NULL`,
        pathLastVerifiedAt: journeySegments.pathLastVerifiedAt,
      })
      .from(journeySegments)
      .where(eq(journeySegments.journeyId, journey.id))
      .orderBy(asc(journeySegments.position));

    const routeStopIds = [
      ...new Set(
        segmentRows
          .flatMap((segment) => [
            segment.boardingRouteStopId,
            segment.alightingRouteStopId,
          ])
          .filter((id): id is string => id !== null),
      ),
    ];

    const routeStopRows =
      routeStopIds.length === 0
        ? []
        : await db
            .select({
              id: transportRouteStops.id,
              transportRouteId: transportRouteStops.transportRouteId,
              locationId: transportRouteStops.locationId,
            })
            .from(transportRouteStops)
            .where(inArray(transportRouteStops.id, routeStopIds));

    const routeIds = [
      ...new Set(routeStopRows.map((stop) => stop.transportRouteId)),
    ];
    const locationIds = [
      ...new Set([
        journey.originLocationId,
        journey.destinationLocationId,
        ...segmentRows
          .flatMap((segment) => [
            segment.walkingFromLocationId,
            segment.walkingToLocationId,
          ])
          .filter((id): id is string => id !== null),
        ...routeStopRows.map((stop) => stop.locationId),
      ]),
    ];

    const [locationRows, routeRows, scheduleRows, sourceRows] =
      await Promise.all([
        db
          .select({
            id: locations.id,
            name: locations.name,
            verificationStatus: locations.verificationStatus,
            lastVerifiedAt: locations.lastVerifiedAt,
            sourceType: locations.sourceType,
            isActive: locations.isActive,
          })
          .from(locations)
          .where(inArray(locations.id, locationIds)),
        routeIds.length === 0
          ? Promise.resolve([])
          : db
              .select({
                id: transportRoutes.id,
                name: transportRoutes.name,
                verificationStatus: transportRoutes.verificationStatus,
                lastVerifiedAt: transportRoutes.lastVerifiedAt,
                isActive: transportRoutes.isActive,
              })
              .from(transportRoutes)
              .where(inArray(transportRoutes.id, routeIds)),
        routeIds.length === 0
          ? Promise.resolve([])
          : db
              .select({
                id: transportRouteSchedules.id,
                transportRouteId: transportRouteSchedules.transportRouteId,
                position: transportRouteSchedules.position,
                lastVerifiedAt: transportRouteSchedules.lastVerifiedAt,
                isActive: transportRouteSchedules.isActive,
              })
              .from(transportRouteSchedules)
              .where(
                inArray(transportRouteSchedules.transportRouteId, routeIds),
              ),
        db
          .select({ checkedAt: journeySources.checkedAt })
          .from(journeySources)
          .where(eq(journeySources.journeyId, journey.id)),
      ]);

    const [locationApprovalRows, routeApprovalRows, journeyApprovalRows] =
      await Promise.all([
        db
          .select({
            locationId: locationFieldObservations.locationId,
            observedAt: locationFieldObservations.observedAt,
          })
          .from(locationVerificationDecisions)
          .innerJoin(
            locationFieldObservations,
            eq(
              locationVerificationDecisions.observationId,
              locationFieldObservations.id,
            ),
          )
          .where(
            and(
              eq(locationVerificationDecisions.decision, "approved"),
              inArray(locationFieldObservations.locationId, locationIds),
            ),
          ),
        routeIds.length === 0
          ? Promise.resolve([])
          : db
              .select({
                routeId: routeFieldObservations.transportRouteId,
                observedAt: routeFieldObservations.observedAt,
              })
              .from(routeVerificationDecisions)
              .innerJoin(
                routeFieldObservations,
                eq(
                  routeVerificationDecisions.routeFieldObservationId,
                  routeFieldObservations.id,
                ),
              )
              .where(
                and(
                  eq(routeVerificationDecisions.decision, "approved"),
                  inArray(routeFieldObservations.transportRouteId, routeIds),
                ),
              ),
        db
          .select({ observedAt: journeyFieldObservations.observedAt })
          .from(journeyVerificationDecisions)
          .innerJoin(
            journeyFieldObservations,
            eq(
              journeyVerificationDecisions.journeyFieldObservationId,
              journeyFieldObservations.id,
            ),
          )
          .where(
            and(
              eq(journeyVerificationDecisions.decision, "approved"),
              eq(journeyFieldObservations.journeyId, journey.id),
            ),
          ),
      ]);

    const readyLocations = locationRows.filter((location) => {
      const hasMatchingApproval = locationApprovalRows.some(
        (approval) =>
          approval.locationId === location.id &&
          datesMatch(location.lastVerifiedAt, approval.observedAt),
      );

      return (
        location.isActive &&
        location.verificationStatus === "verified" &&
        location.sourceType !== "development_fixture" &&
        isPublicVerificationCurrent(location.lastVerifiedAt, currentTime) &&
        hasMatchingApproval
      );
    });

    const readyRoutes = routeRows.filter((route) => {
      const hasMatchingApproval = routeApprovalRows.some(
        (approval) =>
          approval.routeId === route.id &&
          datesMatch(route.lastVerifiedAt, approval.observedAt),
      );

      return (
        route.isActive &&
        route.verificationStatus === "verified" &&
        isPublicVerificationCurrent(route.lastVerifiedAt, currentTime) &&
        hasMatchingApproval
      );
    });

    const routesWithReadySchedules = routeRows.filter((route) =>
      scheduleRows.some(
        (schedule) =>
          schedule.transportRouteId === route.id &&
          schedule.isActive &&
          isPublicVerificationCurrent(schedule.lastVerifiedAt, currentTime),
      ),
    );
    const readyPaths = segmentRows.filter(
      (segment) =>
        segment.hasPath &&
        isPublicVerificationCurrent(segment.pathLastVerifiedAt, currentTime),
    );
    const currentSources = sourceRows.filter((source) =>
      isPublicVerificationCurrent(source.checkedAt, currentTime),
    );
    const hasMatchingJourneyApproval =
      journey.lastVerifiedAt !== null &&
      journeyApprovalRows.some((approval) =>
        datesMatch(journey.lastVerifiedAt, approval.observedAt),
      );

    console.log(`Journey release-readiness report: ${journey.title}`);
    console.log(`Generated at: ${currentTime.toISOString()}`);
    console.log("Read-only: no records were changed.\n");
    console.table([
      {
        category: "Journey field approval",
        status: hasMatchingJourneyApproval ? "READY" : "BLOCKED",
        coverage: hasMatchingJourneyApproval ? "1/1 ready" : "0/1 ready",
      },
      {
        category: "Related locations",
        status:
          readyLocations.length === locationRows.length ? "READY" : "BLOCKED",
        coverage: formatRatio(readyLocations.length, locationRows.length),
      },
      {
        category: "Transport routes",
        status: readyRoutes.length === routeRows.length ? "READY" : "BLOCKED",
        coverage: formatRatio(readyRoutes.length, routeRows.length),
      },
      {
        category: "Route schedules",
        status:
          routesWithReadySchedules.length === routeRows.length
            ? "READY"
            : "BLOCKED",
        coverage: formatRatio(
          routesWithReadySchedules.length,
          routeRows.length,
        ),
      },
      {
        category: "Segment paths",
        status: readyPaths.length === segmentRows.length ? "READY" : "BLOCKED",
        coverage: formatRatio(readyPaths.length, segmentRows.length),
      },
      {
        category: "Journey sources",
        status:
          sourceRows.length > 0 && currentSources.length > 0
            ? "READY"
            : "BLOCKED",
        coverage: `${currentSources.length}/${sourceRows.length} current`,
      },
    ]);

    console.table(
      locationRows.map((location) => ({
        location: location.name,
        active: location.isActive,
        verification: location.verificationStatus,
        current: isPublicVerificationCurrent(
          location.lastVerifiedAt,
          currentTime,
        ),
        approvedEvidence: locationApprovalRows.some(
          (approval) =>
            approval.locationId === location.id &&
            datesMatch(location.lastVerifiedAt, approval.observedAt),
        ),
      })),
    );

    console.table(
      routeRows.map((route) => ({
        route: route.name,
        active: route.isActive,
        verification: route.verificationStatus,
        current: isPublicVerificationCurrent(route.lastVerifiedAt, currentTime),
        approvedEvidence: routeApprovalRows.some(
          (approval) =>
            approval.routeId === route.id &&
            datesMatch(route.lastVerifiedAt, approval.observedAt),
        ),
      })),
    );

    const checkerPath = fileURLToPath(
      new URL("./check-journey-readiness.ts", import.meta.url),
    );
    const checkerResult = spawnSync(
      process.execPath,
      ["--import", "tsx", checkerPath, journey.slug],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: process.env,
      },
    );

    console.log("\nCanonical publication gate:");

    if (checkerResult.stdout.trim()) {
      console.log(checkerResult.stdout.trim());
    }

    if (checkerResult.stderr.trim()) {
      console.error(checkerResult.stderr.trim());
    }

    if (checkerResult.error) {
      throw checkerResult.error;
    }

    if (checkerResult.status !== 0) {
      console.error(
        "\nRelease readiness is BLOCKED. No records were modified or activated.",
      );
      process.exitCode = 1;
      return;
    }

    console.log(
      "\nRelease readiness PASSED. This report did not publish or activate the journey.",
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
