import type {
  AssembledJourneySegment,
  AssembledTransitSegment,
} from "./assemble-journey-segments";

export type JourneyMarkerRole =
  "origin" | "pickup" | "transfer" | "dropoff" | "destination";

export type JourneyMapLocation = {
  slug: string;
  name: string;
  longitude: number;
  latitude: number;
};

export type JourneyMarkerProperties = {
  sequence: number;
  slug: string;
  name: string;
  roles: JourneyMarkerRole[];
  segmentPositions: number[];
};

export type JourneyMarkerFeature = {
  type: "Feature";
  id: string;
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: JourneyMarkerProperties;
};

export type JourneyMarkerFeatureCollection = {
  type: "FeatureCollection";
  features: JourneyMarkerFeature[];
};

type BuildJourneyMapGeoJsonInput = {
  origin: JourneyMapLocation;
  destination: JourneyMapLocation;
  segments: readonly AssembledJourneySegment[];
};

type MutableJourneyMarker = {
  location: JourneyMapLocation;
  roles: Set<JourneyMarkerRole>;
  segmentPositions: Set<number>;
};

const markerRoleOrder: readonly JourneyMarkerRole[] = [
  "origin",
  "pickup",
  "transfer",
  "dropoff",
  "destination",
];

function validateLocation(location: JourneyMapLocation) {
  const validLongitude =
    Number.isFinite(location.longitude) &&
    location.longitude >= -180 &&
    location.longitude <= 180;

  const validLatitude =
    Number.isFinite(location.latitude) &&
    location.latitude >= -90 &&
    location.latitude <= 90;

  if (!validLongitude || !validLatitude) {
    throw new Error(`Location "${location.slug}" has invalid coordinates.`);
  }

  if (!location.slug.trim() || !location.name.trim()) {
    throw new Error("Map locations require a slug and name.");
  }
}

function locationsMatch(first: JourneyMapLocation, second: JourneyMapLocation) {
  return (
    first.name === second.name &&
    first.longitude === second.longitude &&
    first.latitude === second.latitude
  );
}

export function buildJourneyMapGeoJson({
  origin,
  destination,
  segments,
}: BuildJourneyMapGeoJsonInput): JourneyMarkerFeatureCollection {
  if (segments.length === 0) {
    throw new Error("A journey map requires at least one segment.");
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

  const markersBySlug = new Map<string, MutableJourneyMarker>();

  function addMarker(
    location: JourneyMapLocation,
    role: JourneyMarkerRole,
    segmentPosition?: number,
  ) {
    validateLocation(location);

    const existingMarker = markersBySlug.get(location.slug);

    if (existingMarker) {
      if (!locationsMatch(existingMarker.location, location)) {
        throw new Error(
          `Location "${location.slug}" has conflicting map data.`,
        );
      }

      existingMarker.roles.add(role);

      if (segmentPosition !== undefined) {
        existingMarker.segmentPositions.add(segmentPosition);
      }

      return;
    }

    markersBySlug.set(location.slug, {
      location,
      roles: new Set([role]),
      segmentPositions:
        segmentPosition === undefined ? new Set() : new Set([segmentPosition]),
    });
  }

  addMarker(origin, "origin");

  const transitSegments = orderedSegments.filter(
    (segment): segment is AssembledTransitSegment => segment.kind === "transit",
  );

  for (const [index, segment] of transitSegments.entries()) {
    const boardingRole: JourneyMarkerRole = index === 0 ? "pickup" : "transfer";

    const alightingRole: JourneyMarkerRole =
      index === transitSegments.length - 1 ? "dropoff" : "transfer";

    addMarker(segment.boardingStop.location, boardingRole, segment.position);

    addMarker(segment.alightingStop.location, alightingRole, segment.position);
  }

  addMarker(destination, "destination");

  return {
    type: "FeatureCollection",
    features: [...markersBySlug.values()].map((marker, index) => ({
      type: "Feature",
      id: marker.location.slug,
      geometry: {
        type: "Point",
        coordinates: [marker.location.longitude, marker.location.latitude],
      },
      properties: {
        sequence: index + 1,
        slug: marker.location.slug,
        name: marker.location.name,
        roles: markerRoleOrder.filter((role) => marker.roles.has(role)),
        segmentPositions: [...marker.segmentPositions].sort(
          (first, second) => first - second,
        ),
      },
    })),
  };
}
