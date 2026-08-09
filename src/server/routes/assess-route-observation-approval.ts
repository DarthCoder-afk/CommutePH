import { isPublicVerificationCurrent } from "@/server/verification/verification-freshness";

type RouteStopRecord = {
  position: number;
  locationId: string;
  canBoard: boolean;
  canAlight: boolean;
  locationVerificationStatus: "unverified" | "verified" | "outdated";
};

type RouteScheduleRecord = {
  id: string;
  serviceDays: string;
  operatingHours: string;
  isActive: boolean;
};

export type RouteObservationApprovalRecord = {
  routeName: string;
  routeMode: "jeepney" | "modern_jeepney" | "city_bus" | "bgc_bus";
  routeOperator: string | null;
  routeSignboard: string | null;
  routeIsActive: boolean;
  observationOutcome: "confirmed" | "not_found" | "needs_follow_up";
  observationFinalizedAt: Date | null;
  observedAt: Date;
  observedName: string | null;
  observedMode: "jeepney" | "modern_jeepney" | "city_bus" | "bgc_bus" | null;
  observedOperator: string | null;
  observedSignboard: string | null;
  observedServiceDays: string | null;
  observedOperatingHours: string | null;
  observedStops: Omit<RouteStopRecord, "locationVerificationStatus">[];
  storedStops: RouteStopRecord[];
  storedSchedules: RouteScheduleRecord[];
};

function normalizeText(value: string | null) {
  return (
    value
      ?.normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim() ?? null
  );
}

export function assessRouteObservationApproval(
  record: RouteObservationApprovalRecord,
  currentTime = new Date(),
) {
  const blockers: string[] = [];

  if (record.routeIsActive) {
    blockers.push("This approval workflow only handles inactive routes.");
  }
  if (record.observationOutcome !== "confirmed") {
    blockers.push('The route observation outcome must be "confirmed".');
  }
  if (record.observationFinalizedAt === null) {
    blockers.push("The route observation has not been finalized.");
  }
  if (!isPublicVerificationCurrent(record.observedAt, currentTime)) {
    blockers.push(
      "The route observation is missing, stale, invalid, or future-dated.",
    );
  }
  if (normalizeText(record.observedName) !== normalizeText(record.routeName)) {
    blockers.push("The observed route name does not match the stored name.");
  }
  if (record.observedMode !== record.routeMode) {
    blockers.push(
      "The observed transport mode does not match the stored mode.",
    );
  }
  if (
    normalizeText(record.observedOperator) !==
    normalizeText(record.routeOperator)
  ) {
    blockers.push("The observed operator does not match the stored operator.");
  }
  if (
    normalizeText(record.observedSignboard) !==
    normalizeText(record.routeSignboard)
  ) {
    blockers.push(
      "The observed signboard does not match the stored signboard.",
    );
  }

  const storedStops = [...record.storedStops].sort(
    (first, second) => first.position - second.position,
  );
  const observedStops = [...record.observedStops].sort(
    (first, second) => first.position - second.position,
  );

  if (storedStops.length !== observedStops.length || storedStops.length < 2) {
    blockers.push("The observed stop count does not match the stored route.");
  } else {
    for (const [index, storedStop] of storedStops.entries()) {
      const observedStop = observedStops[index];
      if (
        !observedStop ||
        storedStop.position !== index + 1 ||
        observedStop.position !== storedStop.position ||
        observedStop.locationId !== storedStop.locationId ||
        observedStop.canBoard !== storedStop.canBoard ||
        observedStop.canAlight !== storedStop.canAlight
      ) {
        blockers.push(
          `Observed stop ${index + 1} does not match the stored route stop.`,
        );
      }
    }
  }

  if (
    storedStops.some((stop) => stop.locationVerificationStatus !== "verified")
  ) {
    blockers.push(
      "Every route stop location must be verified before route approval.",
    );
  }

  const matchingSchedules = record.storedSchedules.filter(
    (schedule) =>
      normalizeText(schedule.serviceDays) ===
        normalizeText(record.observedServiceDays) &&
      normalizeText(schedule.operatingHours) ===
        normalizeText(record.observedOperatingHours),
  );

  if (matchingSchedules.length !== 1) {
    blockers.push(
      "Exactly one stored schedule must match the observed service days and operating hours.",
    );
  }
  if (matchingSchedules.some((schedule) => schedule.isActive)) {
    blockers.push(
      "The matching schedule must remain inactive during approval.",
    );
  }

  return {
    isApprovable: blockers.length === 0,
    blockers,
    matchingScheduleId: matchingSchedules[0]?.id ?? null,
  };
}
