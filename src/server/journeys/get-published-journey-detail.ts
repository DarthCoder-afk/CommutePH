import "server-only";

import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  journeySegments,
  journeySteps,
  journeys,
  locations,
  transportRoutes,
  transportRouteSchedules,
  transportRouteStops,
} from "@/server/db/schema";
import { assembleJourneySegments } from "@/server/journeys/assemble-journey-segments";
import { calculateJourneyEstimates } from "@/server/journeys/calculate-journey-estimates";
import { buildJourneyMapGeoJson } from "@/server/journeys/build-journey-map-geojson";
import { assemblePublishedRouteSchedules } from "@/server/routes/assemble-published-route-schedules";
import { assemblePublishedJourneyPaths } from "@/server/journeys/assemble-published-journey-paths";
import { getPublicVerificationCutoff } from "@/server/verification/verification-freshness";

function withoutNulls(values: Array<string | null>): string[] {
  return values.filter((value): value is string => value !== null);
}

export async function getPublishedJourneyDetail(slug: string) {
  const publicDataAssemblyTime = new Date();
  const verificationCutoff = getPublicVerificationCutoff(
    publicDataAssemblyTime,
  );

  const [journey] = await db
    .select({
      id: journeys.id,
      slug: journeys.slug,
      title: journeys.title,
      summary: journeys.summary,
      originLocationId: journeys.originLocationId,
      destinationLocationId: journeys.destinationLocationId,
      estimatedDurationMin: journeys.estimatedDurationMin,
      estimatedDurationMax: journeys.estimatedDurationMax,
      estimatedFareMinCentavos: journeys.estimatedFareMinCentavos,
      estimatedFareMaxCentavos: journeys.estimatedFareMaxCentavos,
      lastVerifiedAt: journeys.lastVerifiedAt,
    })
    .from(journeys)
    .where(
      and(
        eq(journeys.slug, slug),
        eq(journeys.status, "verified"),
        eq(journeys.isActive, true),
        gte(journeys.lastVerifiedAt, verificationCutoff),
        lte(journeys.lastVerifiedAt, publicDataAssemblyTime),
      ),
    )
    .limit(1);

  if (!journey) {
    return null;
  }

  const {
    estimatedDurationMin,
    estimatedDurationMax,
    estimatedFareMinCentavos,
    estimatedFareMaxCentavos,
    lastVerifiedAt,
  } = journey;

  if (
    estimatedDurationMin === null ||
    estimatedDurationMax === null ||
    estimatedFareMinCentavos === null ||
    estimatedFareMaxCentavos === null ||
    lastVerifiedAt === null
  ) {
    throw new Error(
      `Published journey "${journey.slug}" has incomplete verification data.`,
    );
  }

  const segmentRows = await db
    .select({
      id: journeySegments.id,
      position: journeySegments.position,
      kind: journeySegments.kind,
      summary: journeySegments.summary,
      publicNotes: journeySegments.publicNotes,
      pathGeoJson: sql<string | null>`
        CASE
          WHEN ${journeySegments.pathGeometry} IS NULL THEN NULL
          ELSE ST_AsGeoJSON(${journeySegments.pathGeometry})
        END
      `,
      pathLastVerifiedAt: journeySegments.pathLastVerifiedAt,
      walkingFromLocationId: journeySegments.walkingFromLocationId,
      walkingToLocationId: journeySegments.walkingToLocationId,
      boardingRouteStopId: journeySegments.boardingRouteStopId,
      alightingRouteStopId: journeySegments.alightingRouteStopId,
      estimatedDurationMin: journeySegments.estimatedDurationMin,
      estimatedDurationMax: journeySegments.estimatedDurationMax,
      estimatedFareMinCentavos: journeySegments.estimatedFareMinCentavos,
      estimatedFareMaxCentavos: journeySegments.estimatedFareMaxCentavos,
    })
    .from(journeySegments)
    .where(eq(journeySegments.journeyId, journey.id))
    .orderBy(asc(journeySegments.position));

  if (segmentRows.length === 0) {
    throw new Error(
      `Published journey "${journey.slug}" does not have any segments.`,
    );
  }

  const calculation = calculateJourneyEstimates(segmentRows);

  if (
    estimatedDurationMin !== calculation.estimatedDuration.minMinutes ||
    estimatedDurationMax !== calculation.estimatedDuration.maxMinutes
  ) {
    throw new Error(
      `Published journey "${journey.slug}" duration totals do not match its segments.`,
    );
  }

  if (
    estimatedFareMinCentavos !== calculation.estimatedFare.minCentavos ||
    estimatedFareMaxCentavos !== calculation.estimatedFare.maxCentavos
  ) {
    throw new Error(
      `Published journey "${journey.slug}" fare totals do not match its segments.`,
    );
  }

  const segmentIds = segmentRows.map((segment) => segment.id);

  const stepRows = await db
    .select({
      id: journeySteps.id,
      journeySegmentId: journeySteps.journeySegmentId,
      position: journeySteps.position,
      instruction: journeySteps.instruction,
    })
    .from(journeySteps)
    .where(inArray(journeySteps.journeySegmentId, segmentIds))
    .orderBy(asc(journeySteps.position));

  const routeStopIds = [
    ...new Set(
      withoutNulls(
        segmentRows.flatMap((segment) => [
          segment.boardingRouteStopId,
          segment.alightingRouteStopId,
        ]),
      ),
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
            position: transportRouteStops.position,
            canBoard: transportRouteStops.canBoard,
            canAlight: transportRouteStops.canAlight,
            pickupLandmark: transportRouteStops.pickupLandmark,
            dropoffLandmark: transportRouteStops.dropoffLandmark,
            pickupInstructions: transportRouteStops.pickupInstructions,
            dropoffInstructions: transportRouteStops.dropoffInstructions,
          })
          .from(transportRouteStops)
          .where(inArray(transportRouteStops.id, routeStopIds));

  const routeIds = [
    ...new Set(routeStopRows.map((routeStop) => routeStop.transportRouteId)),
  ];

  const routeRows =
    routeIds.length === 0
      ? []
      : await db
          .select({
            id: transportRoutes.id,
            slug: transportRoutes.slug,
            name: transportRoutes.name,
            mode: transportRoutes.mode,
            operator: transportRoutes.operator,
            signboard: transportRoutes.signboard,
          })
          .from(transportRoutes)
          .where(
            and(
              inArray(transportRoutes.id, routeIds),
              eq(transportRoutes.isActive, true),
            ),
          );
  const publishedRouteIds = routeRows.map((route) => route.id);

  const scheduleRows =
    publishedRouteIds.length === 0
      ? []
      : await db
          .select({
            id: transportRouteSchedules.id,
            transportRouteId: transportRouteSchedules.transportRouteId,
            position: transportRouteSchedules.position,
            serviceDays: transportRouteSchedules.serviceDays,
            operatingHours: transportRouteSchedules.operatingHours,
            publicNotes: transportRouteSchedules.publicNotes,
            lastVerifiedAt: transportRouteSchedules.lastVerifiedAt,
            isActive: transportRouteSchedules.isActive,
          })
          .from(transportRouteSchedules)
          .where(
            inArray(
              transportRouteSchedules.transportRouteId,
              publishedRouteIds,
            ),
          )
          .orderBy(asc(transportRouteSchedules.position));

  const routesWithSchedules = routeRows.map((route) => ({
    ...route,
    schedules: assemblePublishedRouteSchedules(
      route.id,
      scheduleRows,
      publicDataAssemblyTime,
    ),
  }));

  const walkingLocationIds = withoutNulls(
    segmentRows.flatMap((segment) => [
      segment.walkingFromLocationId,
      segment.walkingToLocationId,
    ]),
  );

  const locationIds = [
    ...new Set([
      journey.originLocationId,
      journey.destinationLocationId,
      ...walkingLocationIds,
      ...routeStopRows.map((routeStop) => routeStop.locationId),
    ]),
  ];

  const rawLocationRows = await db
    .select({
      id: locations.id,
      slug: locations.slug,
      name: locations.name,
      coordinates: locations.coordinates,
    })
    .from(locations)
    .where(
      and(inArray(locations.id, locationIds), eq(locations.isActive, true)),
    );

  const locationRows = rawLocationRows.map(({ coordinates, ...location }) => ({
    ...location,
    longitude: coordinates.x,
    latitude: coordinates.y,
  }));
  const locationsById = new Map(
    locationRows.map((location) => [location.id, location]),
  );

  const origin = locationsById.get(journey.originLocationId);
  const destination = locationsById.get(journey.destinationLocationId);

  if (!origin || !destination) {
    throw new Error(
      `Published journey "${journey.slug}" has an inactive or missing endpoint.`,
    );
  }

  const segments = assembleJourneySegments({
    segments: segmentRows,
    steps: stepRows,
    locations: locationRows,
    routes: routesWithSchedules,
    routeStops: routeStopRows,
  });

  const markerGeoJson = buildJourneyMapGeoJson({
    origin,
    destination,
    segments,
  });

  const pathGeoJson = assemblePublishedJourneyPaths(
    segmentRows,
    publicDataAssemblyTime,
  );

  return {
    id: journey.id,
    slug: journey.slug,
    title: journey.title,
    summary: journey.summary,
    origin: {
      slug: origin.slug,
      name: origin.name,
      longitude: origin.longitude,
      latitude: origin.latitude,
    },
    destination: {
      slug: destination.slug,
      name: destination.name,
      longitude: destination.longitude,
      latitude: destination.latitude,
    },
    estimatedDuration: calculation.estimatedDuration,
    estimatedFare: calculation.estimatedFare,
    transferCount: calculation.transferCount,
    verificationStatus: "verified" as const,
    lastVerifiedAt: lastVerifiedAt.toISOString(),
    segments,

    map: {
      markers: markerGeoJson,
      paths: pathGeoJson,
    },
  };
}
