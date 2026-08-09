const outcomes = ["confirmed", "not_found", "needs_follow_up"] as const;
const segmentKinds = ["walking", "transit"] as const;

type InputRecord = Record<string, unknown>;
type Coordinate = [number, number];

function optionalString(value: unknown, field: string) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string when provided.`);
  }
  return value.trim() || null;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parsePath(value: unknown, segmentPosition: number) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `Segment ${segmentPosition} path must be a GeoJSON LineString.`,
    );
  }
  const path = value as InputRecord;
  if (path.type !== "LineString" || !Array.isArray(path.coordinates)) {
    throw new Error(
      `Segment ${segmentPosition} path must be a GeoJSON LineString.`,
    );
  }
  if (path.coordinates.length < 2) {
    throw new Error(
      `Segment ${segmentPosition} path needs at least two coordinates.`,
    );
  }

  const coordinates = path.coordinates.map((rawCoordinate, coordinateIndex) => {
    if (!Array.isArray(rawCoordinate) || rawCoordinate.length !== 2) {
      throw new Error(
        `Segment ${segmentPosition} coordinate ${coordinateIndex + 1} is invalid.`,
      );
    }
    const [longitude, latitude] = rawCoordinate;
    if (
      typeof longitude !== "number" ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180 ||
      typeof latitude !== "number" ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90
    ) {
      throw new Error(
        `Segment ${segmentPosition} coordinate ${coordinateIndex + 1} is outside world bounds.`,
      );
    }
    return [longitude, latitude] as Coordinate;
  });

  return { type: "LineString" as const, coordinates };
}

export function lineStringToEwkt(coordinates: readonly Coordinate[]) {
  return `SRID=4326;LINESTRING(${coordinates
    .map(([longitude, latitude]) => `${longitude} ${latitude}`)
    .join(",")})`;
}

export function validateJourneyFieldObservation(
  value: unknown,
  currentTime = new Date(),
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The journey observation file must contain a JSON object.");
  }
  const input = value as InputRecord;
  const journeySlug = optionalString(input.journeySlug, "journeySlug");
  const observerLabel = optionalString(input.observerLabel, "observerLabel");
  const notes = optionalString(input.notes, "notes");
  const evidenceUrl = optionalString(input.evidenceUrl, "evidenceUrl");

  if (!journeySlug) throw new Error("journeySlug is required.");
  if (
    typeof input.outcome !== "string" ||
    !outcomes.includes(input.outcome as (typeof outcomes)[number])
  ) {
    throw new Error(`outcome must be one of: ${outcomes.join(", ")}.`);
  }
  if (typeof input.observedAt !== "string") {
    throw new Error("observedAt must be an exact ISO date-time string.");
  }
  const observedAt = new Date(input.observedAt);
  if (
    Number.isNaN(observedAt.getTime()) ||
    observedAt.toISOString() !== input.observedAt
  ) {
    throw new Error("observedAt must be an exact ISO date-time string.");
  }
  if (observedAt > currentTime) {
    throw new Error("observedAt cannot be in the future.");
  }
  if (!observerLabel || observerLabel.length < 2) {
    throw new Error("observerLabel must contain at least 2 characters.");
  }
  if (!notes || notes.length < 20) {
    throw new Error("notes must contain at least 20 characters.");
  }
  if (evidenceUrl && !isHttpUrl(evidenceUrl)) {
    throw new Error("evidenceUrl must be an HTTP or HTTPS URL when provided.");
  }
  if (input.segments !== undefined && !Array.isArray(input.segments)) {
    throw new Error("segments must be an array when provided.");
  }

  const segments = ((input.segments as unknown[] | undefined) ?? []).map(
    (rawSegment, index) => {
      const position = index + 1;
      if (
        !rawSegment ||
        typeof rawSegment !== "object" ||
        Array.isArray(rawSegment)
      ) {
        throw new Error(`Segment ${position} must be an object.`);
      }
      const segment = rawSegment as InputRecord;
      if (segment.position !== position) {
        throw new Error(
          "Segment positions must be ordered and gapless from 1.",
        );
      }
      if (
        typeof segment.kind !== "string" ||
        !segmentKinds.includes(segment.kind as (typeof segmentKinds)[number])
      ) {
        throw new Error(`Segment ${position} kind must be walking or transit.`);
      }
      if (
        !Number.isInteger(segment.actualDurationMinutes) ||
        (segment.actualDurationMinutes as number) < 1
      ) {
        throw new Error(
          `Segment ${position} needs a positive actual duration.`,
        );
      }

      const routeSlug = optionalString(
        segment.routeSlug,
        `Segment ${position} routeSlug`,
      );
      let actualFareCentavos: number | null = null;
      if (segment.kind === "walking") {
        if (routeSlug || segment.actualFareCentavos !== undefined) {
          throw new Error(
            `Walking segment ${position} cannot have a route or fare.`,
          );
        }
      } else {
        if (!routeSlug) {
          throw new Error(`Transit segment ${position} needs a routeSlug.`);
        }
        if (
          !Number.isInteger(segment.actualFareCentavos) ||
          (segment.actualFareCentavos as number) < 0
        ) {
          throw new Error(
            `Transit segment ${position} needs a nonnegative fare.`,
          );
        }
        actualFareCentavos = segment.actualFareCentavos as number;
      }

      if (!Array.isArray(segment.steps)) {
        throw new Error(`Segment ${position} steps must be an array.`);
      }
      const steps = segment.steps.map((step, stepIndex) => {
        const instruction = optionalString(
          step,
          `Segment ${position} step ${stepIndex + 1}`,
        );
        if (!instruction) {
          throw new Error(
            `Segment ${position} step ${stepIndex + 1} is blank.`,
          );
        }
        return instruction;
      });
      const path = parsePath(segment.path, position);

      return {
        position,
        kind: segment.kind as (typeof segmentKinds)[number],
        routeSlug,
        actualDurationMinutes: segment.actualDurationMinutes as number,
        actualFareCentavos,
        path,
        steps,
        notes: optionalString(segment.notes, `Segment ${position} notes`),
      };
    },
  );

  if (input.outcome === "confirmed") {
    if (
      segments.length === 0 ||
      segments.some(
        (segment) => segment.path === null || segment.steps.length === 0,
      )
    ) {
      throw new Error(
        "A confirmed journey observation requires every ordered segment, path, and instruction.",
      );
    }
  }

  const actualDurationMinutes =
    segments.length === 0
      ? null
      : segments.reduce(
          (total, segment) => total + segment.actualDurationMinutes,
          0,
        );
  const actualFareCentavos =
    segments.length === 0
      ? null
      : segments.reduce(
          (total, segment) => total + (segment.actualFareCentavos ?? 0),
          0,
        );
  const transitSegmentCount = segments.filter(
    (segment) => segment.kind === "transit",
  ).length;
  const actualTransferCount =
    segments.length === 0 ? null : Math.max(0, transitSegmentCount - 1);

  return {
    journeySlug,
    outcome: input.outcome as (typeof outcomes)[number],
    observedAt,
    observerLabel,
    notes,
    evidenceUrl,
    actualDurationMinutes,
    actualFareCentavos,
    actualTransferCount,
    segments,
  };
}
