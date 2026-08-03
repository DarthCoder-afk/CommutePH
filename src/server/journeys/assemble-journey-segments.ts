import type { AssembledPublishedRouteSchedule } from "@/server/routes/assemble-published-route-schedules";

export type SegmentLocationRecord = {
  id: string;
  slug: string;
  name: string;
  longitude: number;
  latitude: number;
};

export type SegmentRouteRecord = {
  id: string;
  slug: string;
  name: string;
  mode: "jeepney" | "modern_jeepney" | "city_bus" | "bgc_bus";
  operator: string | null;
  signboard: string | null;
  schedules: readonly AssembledPublishedRouteSchedule[];
};

export type SegmentRouteStopRecord = {
  id: string;
  transportRouteId: string;
  locationId: string;
  position: number;
  canBoard: boolean;
  canAlight: boolean;
  pickupLandmark: string | null;
  dropoffLandmark: string | null;
  pickupInstructions: string | null;
  dropoffInstructions: string | null;
};

export type RawJourneySegmentRecord = {
  id: string;
  position: number;
  kind: "walking" | "transit";
  summary: string;
  publicNotes: string | null;
  walkingFromLocationId: string | null;
  walkingToLocationId: string | null;
  boardingRouteStopId: string | null;
  alightingRouteStopId: string | null;
  estimatedDurationMin: number | null;
  estimatedDurationMax: number | null;
  estimatedFareMinCentavos: number | null;
  estimatedFareMaxCentavos: number | null;
};

export type RawJourneyStepRecord = {
  id: string;
  journeySegmentId: string;
  position: number;
  instruction: string;
};

type EstimateRange = {
  minimum: number;
  maximum: number;
};

type AssembledStep = {
  id: string;
  position: number;
  instruction: string;
};

type AssembledLocation = {
  id: string;
  slug: string;
  name: string;
  longitude: number;
  latitude: number;
};

type AssembledSegmentBase = {
  id: string;
  position: number;
  summary: string;
  publicNotes: string | null;
  estimatedDuration: {
    minMinutes: number;
    maxMinutes: number;
  } | null;
  estimatedFare: {
    minCentavos: number;
    maxCentavos: number;
    currency: "PHP";
  } | null;
  steps: AssembledStep[];
};

export type AssembledWalkingSegment = AssembledSegmentBase & {
  kind: "walking";
  from: AssembledLocation;
  to: AssembledLocation;
};

export type AssembledTransitSegment = AssembledSegmentBase & {
  kind: "transit";
  route: {
    id: string;
    slug: string;
    name: string;
    mode: SegmentRouteRecord["mode"];
    operator: string | null;
    signboard: string | null;
    schedules: AssembledPublishedRouteSchedule[];
  };
  boardingStop: {
    position: number;
    location: AssembledLocation;
    landmark: string | null;
    instructions: string | null;
  };
  alightingStop: {
    position: number;
    location: AssembledLocation;
    landmark: string | null;
    instructions: string | null;
  };
};

export type AssembledJourneySegment =
  AssembledWalkingSegment | AssembledTransitSegment;

type AssembleJourneySegmentsInput = {
  segments: readonly RawJourneySegmentRecord[];
  steps: readonly RawJourneyStepRecord[];
  locations: readonly SegmentLocationRecord[];
  routes: readonly SegmentRouteRecord[];
  routeStops: readonly SegmentRouteStopRecord[];
};

function getOptionalRange(
  minimum: number | null,
  maximum: number | null,
  minimumAllowed: number,
  label: string,
): EstimateRange | null {
  if (minimum === null && maximum === null) {
    return null;
  }

  if (minimum === null || maximum === null) {
    throw new Error(`${label} has an incomplete range.`);
  }

  if (!Number.isInteger(minimum) || !Number.isInteger(maximum)) {
    throw new Error(`${label} values must be integers.`);
  }

  if (minimum < minimumAllowed) {
    throw new Error(`${label} minimum must be at least ${minimumAllowed}.`);
  }

  if (maximum < minimum) {
    throw new Error(
      `${label} maximum must be greater than or equal to its minimum.`,
    );
  }

  return {
    minimum,
    maximum,
  };
}

function requireRecord<T>(
  records: ReadonlyMap<string, T>,
  id: string,
  label: string,
) {
  const record = records.get(id);

  if (!record) {
    throw new Error(`${label} "${id}" was not found.`);
  }

  return record;
}

function toLocation(location: SegmentLocationRecord): AssembledLocation {
  const hasValidLongitude =
    Number.isFinite(location.longitude) &&
    location.longitude >= -180 &&
    location.longitude <= 180;

  const hasValidLatitude =
    Number.isFinite(location.latitude) &&
    location.latitude >= -90 &&
    location.latitude <= 90;

  if (!hasValidLongitude || !hasValidLatitude) {
    throw new Error(`Location "${location.id}" has invalid coordinates.`);
  }

  return {
    id: location.id,
    slug: location.slug,
    name: location.name,
    longitude: location.longitude,
    latitude: location.latitude,
  };
}

function normalizePublicNotes(value: string | null, segmentPosition: number) {
  if (value === null) {
    return null;
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(`Segment ${segmentPosition} public notes cannot be blank.`);
  }

  return normalizedValue;
}

export function assembleJourneySegments({
  segments,
  steps,
  locations,
  routes,
  routeStops,
}: AssembleJourneySegmentsInput): AssembledJourneySegment[] {
  if (segments.length === 0) {
    throw new Error("A journey must have at least one segment.");
  }

  const orderedSegments = [...segments].sort(
    (first, second) => first.position - second.position,
  );

  for (const [index, segment] of orderedSegments.entries()) {
    const expectedPosition = index + 1;

    if (segment.position !== expectedPosition) {
      throw new Error(
        `Journey segment positions must be gapless. Expected ${expectedPosition}, received ${segment.position}.`,
      );
    }
  }

  const locationsById = new Map(
    locations.map((location) => [location.id, location]),
  );

  const routesById = new Map(routes.map((route) => [route.id, route]));

  const routeStopsById = new Map(
    routeStops.map((routeStop) => [routeStop.id, routeStop]),
  );

  const stepsBySegmentId = new Map<string, RawJourneyStepRecord[]>();

  for (const step of steps) {
    const segmentSteps = stepsBySegmentId.get(step.journeySegmentId) ?? [];

    segmentSteps.push(step);
    stepsBySegmentId.set(step.journeySegmentId, segmentSteps);
  }

  return orderedSegments.map((segment): AssembledJourneySegment => {
    const orderedSteps = [...(stepsBySegmentId.get(segment.id) ?? [])].sort(
      (first, second) => first.position - second.position,
    );

    if (orderedSteps.length === 0) {
      throw new Error(`Segment ${segment.position} has no instructions.`);
    }

    for (const [index, step] of orderedSteps.entries()) {
      const expectedPosition = index + 1;

      if (step.position !== expectedPosition) {
        throw new Error(
          `Segment ${segment.position} step positions must be gapless. Expected ${expectedPosition}, received ${step.position}.`,
        );
      }
    }

    const durationRange = getOptionalRange(
      segment.estimatedDurationMin,
      segment.estimatedDurationMax,
      1,
      `Segment ${segment.position} duration`,
    );

    const fareRange = getOptionalRange(
      segment.estimatedFareMinCentavos,
      segment.estimatedFareMaxCentavos,
      0,
      `Segment ${segment.position} fare`,
    );

    const base: AssembledSegmentBase = {
      id: segment.id,
      position: segment.position,
      summary: segment.summary,
      publicNotes: normalizePublicNotes(segment.publicNotes, segment.position),
      estimatedDuration: durationRange
        ? {
            minMinutes: durationRange.minimum,
            maxMinutes: durationRange.maximum,
          }
        : null,
      estimatedFare: fareRange
        ? {
            minCentavos: fareRange.minimum,
            maxCentavos: fareRange.maximum,
            currency: "PHP",
          }
        : null,
      steps: orderedSteps.map((step) => ({
        id: step.id,
        position: step.position,
        instruction: step.instruction,
      })),
    };

    if (segment.kind === "walking") {
      if (!segment.walkingFromLocationId || !segment.walkingToLocationId) {
        throw new Error(
          `Walking segment ${segment.position} needs starting and ending locations.`,
        );
      }

      if (segment.walkingFromLocationId === segment.walkingToLocationId) {
        throw new Error(
          `Walking segment ${segment.position} cannot start and end at the same location.`,
        );
      }

      const from = requireRecord(
        locationsById,
        segment.walkingFromLocationId,
        `Walking segment ${segment.position} starting location`,
      );

      const to = requireRecord(
        locationsById,
        segment.walkingToLocationId,
        `Walking segment ${segment.position} ending location`,
      );

      return {
        ...base,
        kind: "walking",
        from: toLocation(from),
        to: toLocation(to),
      };
    }

    if (!segment.boardingRouteStopId || !segment.alightingRouteStopId) {
      throw new Error(
        `Transit segment ${segment.position} needs boarding and alighting stops.`,
      );
    }

    const boardingStop = requireRecord(
      routeStopsById,
      segment.boardingRouteStopId,
      `Transit segment ${segment.position} boarding stop`,
    );

    const alightingStop = requireRecord(
      routeStopsById,
      segment.alightingRouteStopId,
      `Transit segment ${segment.position} alighting stop`,
    );

    if (boardingStop.transportRouteId !== alightingStop.transportRouteId) {
      throw new Error(
        `Transit segment ${segment.position} uses stops from different routes.`,
      );
    }

    if (boardingStop.position >= alightingStop.position) {
      throw new Error(
        `Transit segment ${segment.position} boards after its alighting stop.`,
      );
    }

    if (!boardingStop.canBoard) {
      throw new Error(
        `Transit segment ${segment.position} does not allow boarding at its first stop.`,
      );
    }

    if (!alightingStop.canAlight) {
      throw new Error(
        `Transit segment ${segment.position} does not allow alighting at its final stop.`,
      );
    }

    const route = requireRecord(
      routesById,
      boardingStop.transportRouteId,
      `Transit segment ${segment.position} route`,
    );

    const boardingLocation = requireRecord(
      locationsById,
      boardingStop.locationId,
      `Transit segment ${segment.position} boarding location`,
    );

    const alightingLocation = requireRecord(
      locationsById,
      alightingStop.locationId,
      `Transit segment ${segment.position} alighting location`,
    );

    return {
      ...base,
      kind: "transit",
      route: {
        id: route.id,
        slug: route.slug,
        name: route.name,
        mode: route.mode,
        operator: route.operator,
        signboard: route.signboard,
        schedules: [...route.schedules],
      },
      boardingStop: {
        position: boardingStop.position,
        location: toLocation(boardingLocation),
        landmark: boardingStop.pickupLandmark,
        instructions: boardingStop.pickupInstructions,
      },
      alightingStop: {
        position: alightingStop.position,
        location: toLocation(alightingLocation),
        landmark: alightingStop.dropoffLandmark,
        instructions: alightingStop.dropoffInstructions,
      },
    };
  });
}
