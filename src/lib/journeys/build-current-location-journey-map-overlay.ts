import type { CurrentLocationJourneyOption } from "./build-current-location-journey-options";

type Coordinate = [number, number];

type PublishedJourneyMarkerCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: string;
    geometry: {
      type: "Point";
      coordinates: Coordinate;
    };
    properties: {
      sequence: number;
      slug: string;
      name: string;
      roles: Array<
        "origin" | "pickup" | "transfer" | "dropoff" | "destination"
      >;
      segmentPositions: number[];
    };
  }>;
};

type PublishedJourneyPathCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: string;
    geometry: {
      type: "LineString";
      coordinates: Coordinate[];
    };
    properties: {
      segmentId: string;
      segmentPosition: number;
      kind: "walking" | "transit";
      lastVerifiedAt: string;
    };
  }>;
};

export type PublishedJourneyMap = {
  markers: PublishedJourneyMarkerCollection;
  paths: PublishedJourneyPathCollection;
};

export type CurrentLocationJourneyMapOverlay = {
  optionId: string;
  title: string;
  initialWalkingPath: {
    type: "FeatureCollection";
    features: [
      {
        type: "Feature";
        id: string;
        geometry: {
          type: "LineString";
          coordinates: [Coordinate, Coordinate];
        };
        properties: {
          kind: "initial-walking";
          verificationStatus: "estimated";
        };
      },
    ];
  };
  publishedMap: PublishedJourneyMap;
  boundsCoordinates: Coordinate[];
};

function validateCoordinate(
  coordinate: Coordinate,
  description: string,
): Coordinate {
  const [longitude, latitude] = coordinate;

  if (
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new Error(`${description} has invalid coordinates.`);
  }

  return coordinate;
}

export function buildCurrentLocationJourneyMapOverlay({
  currentLocation,
  option,
  publishedMap,
}: {
  currentLocation: {
    longitude: number;
    latitude: number;
  };
  option: CurrentLocationJourneyOption;
  publishedMap: PublishedJourneyMap;
}): CurrentLocationJourneyMapOverlay {
  const currentLocationCoordinate = validateCoordinate(
    [currentLocation.longitude, currentLocation.latitude],
    "Current location",
  );
  const pickupCoordinate = validateCoordinate(
    [option.pickup.longitude, option.pickup.latitude],
    `Pickup point "${option.pickup.slug}"`,
  );

  const publishedCoordinates: Coordinate[] = [];

  for (const marker of publishedMap.markers.features) {
    publishedCoordinates.push(
      validateCoordinate(
        marker.geometry.coordinates,
        `Journey marker "${marker.id}"`,
      ),
    );
  }

  for (const path of publishedMap.paths.features) {
    for (const coordinate of path.geometry.coordinates) {
      publishedCoordinates.push(
        validateCoordinate(coordinate, `Journey path "${path.id}"`),
      );
    }
  }

  return {
    optionId: option.id,
    title: option.publishedJourney.title,
    initialWalkingPath: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: `initial-walk:${option.id}`,
          geometry: {
            type: "LineString",
            coordinates: [currentLocationCoordinate, pickupCoordinate],
          },
          properties: {
            kind: "initial-walking",
            verificationStatus: "estimated",
          },
        },
      ],
    },
    publishedMap,
    boundsCoordinates: [
      currentLocationCoordinate,
      pickupCoordinate,
      ...publishedCoordinates,
    ],
  };
}
