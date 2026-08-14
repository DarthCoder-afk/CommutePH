import "server-only";

import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";

import { db } from "@/server/db";
import {
  locations,
  routeFieldObservations,
  routeVerificationDecisions,
  transportRoutes,
  transportRouteSchedules,
  transportRouteStops,
} from "@/server/db/schema";
import { assembleVerifiedDirectRoutes } from "@/server/routes/assemble-verified-direct-routes";
import { getPublicVerificationCutoff } from "@/server/verification/verification-freshness";

export async function searchVerifiedDirectRoutes(
  originSlug: string,
  destinationSlug: string,
) {
  const currentTime = new Date();
  const verificationCutoff = getPublicVerificationCutoff(currentTime);
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
        eq(locations.verificationStatus, "verified"),
        gte(locations.lastVerifiedAt, verificationCutoff),
        lte(locations.lastVerifiedAt, currentTime),
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

  const endpointStopRows = await db
    .select({
      transportRouteId: transportRouteStops.transportRouteId,
      locationId: transportRouteStops.locationId,
    })
    .from(transportRouteStops)
    .where(
      inArray(transportRouteStops.locationId, [origin.id, destination.id]),
    );
  const endpointIdsByRouteId = new Map<string, Set<string>>();

  for (const stop of endpointStopRows) {
    const endpointIds =
      endpointIdsByRouteId.get(stop.transportRouteId) ?? new Set<string>();

    endpointIds.add(stop.locationId);
    endpointIdsByRouteId.set(stop.transportRouteId, endpointIds);
  }

  const candidateRouteIds = [...endpointIdsByRouteId.entries()]
    .filter(
      ([, endpointIds]) =>
        endpointIds.has(origin.id) && endpointIds.has(destination.id),
    )
    .map(([routeId]) => routeId);

  if (candidateRouteIds.length === 0) {
    return [];
  }

  const routeRows = await db
    .select({
      id: transportRoutes.id,
      slug: transportRoutes.slug,
      name: transportRoutes.name,
      mode: transportRoutes.mode,
      operator: transportRoutes.operator,
      signboard: transportRoutes.signboard,
      verificationStatus: transportRoutes.verificationStatus,
      lastVerifiedAt: transportRoutes.lastVerifiedAt,
      isActive: transportRoutes.isActive,
    })
    .from(transportRoutes)
    .where(
      and(
        inArray(transportRoutes.id, candidateRouteIds),
        eq(transportRoutes.isActive, true),
        eq(transportRoutes.verificationStatus, "verified"),
        gte(transportRoutes.lastVerifiedAt, verificationCutoff),
        lte(transportRoutes.lastVerifiedAt, currentTime),
      ),
    )
    .orderBy(asc(transportRoutes.name), asc(transportRoutes.slug));

  if (routeRows.length === 0) {
    return [];
  }

  const eligibleRouteIds = routeRows.map((route) => route.id);
  const routeStopRows = await db
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
    .where(inArray(transportRouteStops.transportRouteId, eligibleRouteIds))
    .orderBy(
      asc(transportRouteStops.transportRouteId),
      asc(transportRouteStops.position),
    );
  const routeLocationIds = [
    ...new Set(routeStopRows.map((stop) => stop.locationId)),
  ];
  const locationRows = await db
    .select({
      id: locations.id,
      slug: locations.slug,
      name: locations.name,
      verificationStatus: locations.verificationStatus,
      lastVerifiedAt: locations.lastVerifiedAt,
      isActive: locations.isActive,
    })
    .from(locations)
    .where(inArray(locations.id, routeLocationIds));
  const scheduleRows = await db
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
    .where(inArray(transportRouteSchedules.transportRouteId, eligibleRouteIds));
  const fareEvidenceRows = await db
    .select({
      transportRouteId: routeFieldObservations.transportRouteId,
      outcome: routeFieldObservations.outcome,
      observedAt: routeFieldObservations.observedAt,
      finalizedAt: routeFieldObservations.finalizedAt,
      fareMinCentavos: routeFieldObservations.fareMinCentavos,
      fareMaxCentavos: routeFieldObservations.fareMaxCentavos,
      paymentMethod: routeFieldObservations.paymentMethod,
      decision: routeVerificationDecisions.decision,
    })
    .from(routeFieldObservations)
    .innerJoin(
      routeVerificationDecisions,
      eq(
        routeVerificationDecisions.routeFieldObservationId,
        routeFieldObservations.id,
      ),
    )
    .where(inArray(routeFieldObservations.transportRouteId, eligibleRouteIds));

  return assembleVerifiedDirectRoutes({
    origin,
    destination,
    routes: routeRows,
    routeStops: routeStopRows,
    locations: locationRows,
    schedules: scheduleRows,
    fareEvidence: fareEvidenceRows,
    currentTime,
  });
}
