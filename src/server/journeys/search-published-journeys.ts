import "server-only";

import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";

import { db } from "@/server/db";
import {
  journeySegments,
  journeys,
  locations,
  transportRoutes,
  transportRouteStops,
} from "@/server/db/schema";
import {
  assemblePublishedJourneySearchResults,
  publishedJourneySearchResultLimit,
} from "@/server/journeys/assemble-published-journey-search-results";
import { getPublicVerificationCutoff } from "@/server/verification/verification-freshness";

export async function searchPublishedJourneys(
  originSlug: string,
  destinationSlug: string,
) {
  const endpointRows = await db
    .select({
      id: locations.id,
      slug: locations.slug,
      name: locations.name,
    })
    .from(locations)
    .where(
      and(
        inArray(locations.slug, [originSlug, destinationSlug]),
        eq(locations.isActive, true),
      ),
    );

  const endpointsBySlug = new Map(
    endpointRows.map((location) => [location.slug, location]),
  );
  const origin = endpointsBySlug.get(originSlug);
  const destination = endpointsBySlug.get(destinationSlug);

  if (!origin || !destination) {
    return [];
  }

  const currentTime = new Date();
  const verificationCutoff = getPublicVerificationCutoff(currentTime);

  const candidateJourneys = await db
    .select({
      id: journeys.id,
      slug: journeys.slug,
      title: journeys.title,
      summary: journeys.summary,
      estimatedDurationMin: journeys.estimatedDurationMin,
      estimatedDurationMax: journeys.estimatedDurationMax,
      estimatedFareMinCentavos: journeys.estimatedFareMinCentavos,
      estimatedFareMaxCentavos: journeys.estimatedFareMaxCentavos,
      lastVerifiedAt: journeys.lastVerifiedAt,
    })
    .from(journeys)
    .where(
      and(
        eq(journeys.originLocationId, origin.id),
        eq(journeys.destinationLocationId, destination.id),
        eq(journeys.status, "verified"),
        eq(journeys.isActive, true),
        gte(journeys.lastVerifiedAt, verificationCutoff),
        lte(journeys.lastVerifiedAt, currentTime),
      ),
    )
    .orderBy(asc(journeys.title), asc(journeys.slug))
    .limit(publishedJourneySearchResultLimit * 5);

  if (candidateJourneys.length === 0) {
    return [];
  }

  const candidateJourneyIds = candidateJourneys.map((journey) => journey.id);
  const segmentRows = await db
    .select({
      journeyId: journeySegments.journeyId,
      id: journeySegments.id,
      position: journeySegments.position,
      kind: journeySegments.kind,
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
    .where(inArray(journeySegments.journeyId, candidateJourneyIds))
    .orderBy(asc(journeySegments.journeyId), asc(journeySegments.position));

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
            position: transportRouteStops.position,
            canBoard: transportRouteStops.canBoard,
            canAlight: transportRouteStops.canAlight,
            routeIsActive: transportRoutes.isActive,
          })
          .from(transportRouteStops)
          .innerJoin(
            transportRoutes,
            eq(transportRoutes.id, transportRouteStops.transportRouteId),
          )
          .where(inArray(transportRouteStops.id, routeStopIds));

  const topologyLocationIds = [
    ...new Set([
      origin.id,
      destination.id,
      ...segmentRows.flatMap((segment) => [
        segment.walkingFromLocationId,
        segment.walkingToLocationId,
      ]),
      ...routeStopRows.map((routeStop) => routeStop.locationId),
    ]),
  ].filter((id): id is string => id !== null);

  const topologyLocations = await db
    .select({
      id: locations.id,
      isActive: locations.isActive,
    })
    .from(locations)
    .where(inArray(locations.id, topologyLocationIds));

  return assemblePublishedJourneySearchResults({
    origin,
    destination,
    journeys: candidateJourneys,
    segments: segmentRows,
    routeStops: routeStopRows,
    locations: topologyLocations,
  });
}
