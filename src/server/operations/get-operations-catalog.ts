import "server-only";

import { asc } from "drizzle-orm";

import { db } from "@/server/db";
import {
  journeySegments,
  journeys,
  locations,
  transportRoutes,
  transportRouteStops,
} from "@/server/db/schema";

export async function getOperationsCatalog() {
  const [locationRows, routeRows, routeStopRows, journeyRows, segmentRows] =
    await Promise.all([
      db
        .select({
          id: locations.id,
          name: locations.name,
          slug: locations.slug,
          kind: locations.kind,
          city: locations.city,
          area: locations.area,
          longitude: locations.coordinates,
          verificationStatus: locations.verificationStatus,
          sourceType: locations.sourceType,
          sourceExternalId: locations.sourceExternalId,
          sourceUrl: locations.sourceUrl,
          isActive: locations.isActive,
        })
        .from(locations)
        .orderBy(asc(locations.city), asc(locations.name)),
      db
        .select({
          id: transportRoutes.id,
          slug: transportRoutes.slug,
          name: transportRoutes.name,
          mode: transportRoutes.mode,
          operator: transportRoutes.operator,
          signboard: transportRoutes.signboard,
          verificationStatus: transportRoutes.verificationStatus,
          isActive: transportRoutes.isActive,
        })
        .from(transportRoutes)
        .orderBy(asc(transportRoutes.name)),
      db
        .select({
          id: transportRouteStops.id,
          transportRouteId: transportRouteStops.transportRouteId,
          locationId: transportRouteStops.locationId,
          position: transportRouteStops.position,
          canBoard: transportRouteStops.canBoard,
          canAlight: transportRouteStops.canAlight,
          pickupLandmark: transportRouteStops.pickupLandmark,
          dropoffLandmark: transportRouteStops.dropoffLandmark,
        })
        .from(transportRouteStops)
        .orderBy(
          asc(transportRouteStops.transportRouteId),
          asc(transportRouteStops.position),
        ),
      db
        .select({
          id: journeys.id,
          slug: journeys.slug,
          title: journeys.title,
          summary: journeys.summary,
          originLocationId: journeys.originLocationId,
          destinationLocationId: journeys.destinationLocationId,
          status: journeys.status,
          isActive: journeys.isActive,
        })
        .from(journeys)
        .orderBy(asc(journeys.title)),
      db
        .select({
          id: journeySegments.id,
          journeyId: journeySegments.journeyId,
          position: journeySegments.position,
          kind: journeySegments.kind,
          summary: journeySegments.summary,
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
        .orderBy(asc(journeySegments.journeyId), asc(journeySegments.position)),
    ]);

  return {
    locations: locationRows.map((location) => ({
      ...location,
      longitude: location.longitude.x,
      latitude: location.longitude.y,
    })),
    routes: routeRows,
    routeStops: routeStopRows,
    journeys: journeyRows,
    segments: segmentRows,
  };
}

export type OperationsCatalog = Awaited<
  ReturnType<typeof getOperationsCatalog>
>;
