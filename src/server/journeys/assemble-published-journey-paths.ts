import {
  isPublicVerificationCurrent,
  publicVerificationMaxAgeDays,
} from "@/server/verification/verification-freshness";

export type RawJourneySegmentPathRecord = {
  id: string;
  position: number;
  kind: "walking" | "transit";
  pathGeoJson: string | null;
  pathLastVerifiedAt: Date | null;
};

export type JourneyPathCoordinate = [number, number];

export type JourneyPathFeature = {
  type: "Feature";
  id: string;
  geometry: {
    type: "LineString";
    coordinates: JourneyPathCoordinate[];
  };
  properties: {
    segmentId: string;
    segmentPosition: number;
    kind: "walking" | "transit";
    lastVerifiedAt: string;
  };
};

export type JourneyPathFeatureCollection = {
  type: "FeatureCollection";
  features: JourneyPathFeature[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCoordinate(
  value: unknown,
  segmentPosition: number,
): JourneyPathCoordinate {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(
      `Segment ${segmentPosition} path contains an invalid coordinate.`,
    );
  }

  const [longitude, latitude] = value;

  if (
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error(
      `Segment ${segmentPosition} path contains an invalid longitude.`,
    );
  }

  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new Error(
      `Segment ${segmentPosition} path contains an invalid latitude.`,
    );
  }

  return [longitude, latitude];
}

function parseLineString(
  pathGeoJson: string,
  segmentPosition: number,
): JourneyPathCoordinate[] {
  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(pathGeoJson);
  } catch {
    throw new Error(`Segment ${segmentPosition} path is not valid GeoJSON.`);
  }

  if (
    !isRecord(parsedValue) ||
    parsedValue.type !== "LineString" ||
    !Array.isArray(parsedValue.coordinates)
  ) {
    throw new Error(
      `Segment ${segmentPosition} path must be a GeoJSON LineString.`,
    );
  }

  if (parsedValue.coordinates.length < 2) {
    throw new Error(
      `Segment ${segmentPosition} path needs at least two coordinates.`,
    );
  }

  return parsedValue.coordinates.map((coordinate) =>
    parseCoordinate(coordinate, segmentPosition),
  );
}

export function assemblePublishedJourneyPaths(
  records: readonly RawJourneySegmentPathRecord[],
  currentTime = new Date(),
): JourneyPathFeatureCollection {
  if (Number.isNaN(currentTime.getTime())) {
    throw new Error("The current time is invalid.");
  }

  const orderedRecords = [...records].sort(
    (first, second) => first.position - second.position,
  );

  for (const [index, record] of orderedRecords.entries()) {
    const expectedPosition = index + 1;

    if (record.position !== expectedPosition) {
      throw new Error(
        `Journey segment positions must be gapless. Expected ${expectedPosition}, received ${record.position}.`,
      );
    }

    if (!record.id.trim()) {
      throw new Error(`Segment ${record.position} needs an ID.`);
    }
  }

  const features: JourneyPathFeature[] = [];

  for (const record of orderedRecords) {
    const { pathGeoJson, pathLastVerifiedAt } = record;

    if (pathGeoJson === null && pathLastVerifiedAt === null) {
      continue;
    }

    if (pathGeoJson === null || pathLastVerifiedAt === null) {
      throw new Error(
        `Segment ${record.position} path and verification date must both be present.`,
      );
    }

    if (Number.isNaN(pathLastVerifiedAt.getTime())) {
      throw new Error(
        `Segment ${record.position} path has an invalid verification date.`,
      );
    }

    if (pathLastVerifiedAt > currentTime) {
      throw new Error(
        `Segment ${record.position} path has a future verification date.`,
      );
    }

    if (!isPublicVerificationCurrent(pathLastVerifiedAt, currentTime)) {
      throw new Error(
        `Segment ${record.position} path verification is older than ${publicVerificationMaxAgeDays} days.`,
      );
    }

    features.push({
      type: "Feature",
      id: record.id,
      geometry: {
        type: "LineString",
        coordinates: parseLineString(pathGeoJson, record.position),
      },
      properties: {
        segmentId: record.id,
        segmentPosition: record.position,
        kind: record.kind,
        lastVerifiedAt: pathLastVerifiedAt.toISOString(),
      },
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}
