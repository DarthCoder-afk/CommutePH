import { assemblePublishedRouteSchedules } from "@/server/routes/assemble-published-route-schedules";
import { isPublicVerificationCurrent } from "@/server/verification/verification-freshness";

export type DirectRouteEndpoint = {
  id: string;
  slug: string;
  name: string;
};

export type DirectRouteRecord = {
  id: string;
  slug: string;
  name: string;
  mode: "jeepney" | "modern_jeepney" | "city_bus" | "bgc_bus";
  operator: string | null;
  signboard: string | null;
  verificationStatus: "unverified" | "verified" | "outdated";
  lastVerifiedAt: Date | null;
  isActive: boolean;
};

export type DirectRouteStopRecord = {
  id: string;
  transportRouteId: string;
  locationId: string;
  position: number;
  canBoard: boolean;
  canAlight: boolean;
  pickupLandmark: string | null;
  dropoffLandmark: string | null;
};

export type DirectRouteLocationRecord = {
  id: string;
  slug: string;
  name: string;
  verificationStatus: "unverified" | "verified" | "outdated";
  lastVerifiedAt: Date | null;
  isActive: boolean;
};

export type DirectRouteFareEvidenceRecord = {
  transportRouteId: string;
  outcome: "confirmed" | "not_found" | "needs_follow_up";
  observedAt: Date;
  finalizedAt: Date | null;
  fareMinCentavos: number | null;
  fareMaxCentavos: number | null;
  paymentMethod: string | null;
  decision: "approved" | "rejected" | "needs_follow_up";
};

export type VerifiedDirectRouteMatch = {
  id: string;
  slug: string;
  name: string;
  mode: DirectRouteRecord["mode"];
  operator: string | null;
  signboard: string | null;
  origin: DirectRouteEndpoint & {
    routeStopId: string;
    position: number;
    pickupLandmark: string | null;
  };
  destination: DirectRouteEndpoint & {
    routeStopId: string;
    position: number;
    dropoffLandmark: string | null;
  };
  fare: {
    minCentavos: number;
    maxCentavos: number;
    currency: "PHP";
    paymentMethod: string;
  };
  schedules: ReturnType<typeof assemblePublishedRouteSchedules>;
  lastVerifiedAt: string;
};

function normalizeOptionalText(value: string | null) {
  const normalized = value?.trim();

  return normalized || null;
}

export function assembleVerifiedDirectRoutes({
  origin,
  destination,
  routes,
  routeStops,
  locations,
  schedules,
  fareEvidence,
  currentTime = new Date(),
}: {
  origin: DirectRouteEndpoint;
  destination: DirectRouteEndpoint;
  routes: readonly DirectRouteRecord[];
  routeStops: readonly DirectRouteStopRecord[];
  locations: readonly DirectRouteLocationRecord[];
  schedules: Parameters<typeof assemblePublishedRouteSchedules>[1];
  fareEvidence: readonly DirectRouteFareEvidenceRecord[];
  currentTime?: Date;
}): VerifiedDirectRouteMatch[] {
  if (origin.id === destination.id) {
    throw new Error("Direct route endpoints must be different.");
  }

  if (Number.isNaN(currentTime.getTime())) {
    throw new Error("The current time is invalid.");
  }

  const locationsById = new Map(
    locations.map((location) => [location.id, location]),
  );

  return routes.flatMap((route) => {
    const routeLastVerifiedAt = route.lastVerifiedAt;

    if (
      !route.isActive ||
      route.verificationStatus !== "verified" ||
      !isPublicVerificationCurrent(routeLastVerifiedAt, currentTime)
    ) {
      return [];
    }

    const orderedStops = routeStops
      .filter((stop) => stop.transportRouteId === route.id)
      .sort((first, second) => first.position - second.position);

    if (orderedStops.length < 2) {
      return [];
    }

    for (const [index, stop] of orderedStops.entries()) {
      if (stop.position !== index + 1) {
        throw new Error(
          `Verified route "${route.slug}" has a non-gapless stop sequence.`,
        );
      }
    }

    const hasIneligibleStop = orderedStops.some((stop) => {
      const location = locationsById.get(stop.locationId);

      return (
        !location ||
        !location.isActive ||
        location.verificationStatus !== "verified" ||
        !isPublicVerificationCurrent(location.lastVerifiedAt, currentTime)
      );
    });

    if (hasIneligibleStop) {
      return [];
    }

    const boardingStop = orderedStops.find(
      (stop) => stop.locationId === origin.id && stop.canBoard,
    );
    const alightingStop = orderedStops.find(
      (stop) =>
        stop.locationId === destination.id &&
        stop.canAlight &&
        (!boardingStop || stop.position > boardingStop.position),
    );

    if (
      !boardingStop ||
      !alightingStop ||
      boardingStop.position >= alightingStop.position
    ) {
      return [];
    }

    const routeSchedules = assemblePublishedRouteSchedules(
      route.id,
      schedules,
      currentTime,
    );

    if (routeSchedules.length === 0) {
      return [];
    }

    const matchingFareEvidence = fareEvidence.filter(
      (evidence) =>
        evidence.transportRouteId === route.id &&
        evidence.decision === "approved" &&
        evidence.outcome === "confirmed" &&
        evidence.finalizedAt !== null &&
        evidence.observedAt.getTime() === routeLastVerifiedAt?.getTime(),
    );

    if (matchingFareEvidence.length !== 1) {
      return [];
    }

    const evidence = matchingFareEvidence[0];
    const paymentMethod = normalizeOptionalText(
      evidence?.paymentMethod ?? null,
    );

    if (
      !evidence ||
      evidence.fareMinCentavos === null ||
      evidence.fareMaxCentavos === null ||
      evidence.fareMinCentavos < 0 ||
      evidence.fareMaxCentavos < evidence.fareMinCentavos ||
      !paymentMethod ||
      routeLastVerifiedAt === null
    ) {
      return [];
    }

    return [
      {
        id: route.id,
        slug: route.slug,
        name: route.name.trim(),
        mode: route.mode,
        operator: normalizeOptionalText(route.operator),
        signboard: normalizeOptionalText(route.signboard),
        origin: {
          ...origin,
          routeStopId: boardingStop.id,
          position: boardingStop.position,
          pickupLandmark: normalizeOptionalText(boardingStop.pickupLandmark),
        },
        destination: {
          ...destination,
          routeStopId: alightingStop.id,
          position: alightingStop.position,
          dropoffLandmark: normalizeOptionalText(alightingStop.dropoffLandmark),
        },
        fare: {
          minCentavos: evidence.fareMinCentavos,
          maxCentavos: evidence.fareMaxCentavos,
          currency: "PHP" as const,
          paymentMethod,
        },
        schedules: routeSchedules,
        lastVerifiedAt: routeLastVerifiedAt.toISOString(),
      },
    ];
  });
}
