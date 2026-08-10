import "server-only";

import type { DevelopmentJourneyPreview } from "@/lib/journeys/development-journey-preview";
import { canExposeDevelopmentJourneyPreviews } from "@/server/journeys/development-journey-preview-policy";
import { getOperationsCatalog } from "@/server/operations/get-operations-catalog";
import type {
  JourneyMarkerRole,
  JourneyMarkerFeatureCollection,
} from "@/server/journeys/build-journey-map-geojson";

type Catalog = Awaited<ReturnType<typeof getOperationsCatalog>>;
type CatalogLocation = Catalog["locations"][number];
type PreviewPathFeature =
  DevelopmentJourneyPreview["map"]["paths"]["features"][number];

type PreviewPathRequest = {
  segmentId: string;
  segmentPosition: number;
  kind: "walking" | "transit";
  from: CatalogLocation;
  to: CatalogLocation;
};

function buildDevelopmentPath(request: PreviewPathRequest): PreviewPathFeature {
  const from: [number, number] = [
    request.from.longitude,
    request.from.latitude,
  ];
  const to: [number, number] = [request.to.longitude, request.to.latitude];

  return {
    type: "Feature",
    id: `development-path-${request.segmentId}`,
    geometry: { type: "LineString", coordinates: [from, to] },
    properties: {
      segmentId: request.segmentId,
      segmentPosition: request.segmentPosition,
      kind: request.kind,
      provisional: true,
      source: "schematic_development_connector",
    },
  };
}

function buildPreviewMarkers(
  locations: readonly {
    location: CatalogLocation;
    role: JourneyMarkerRole;
    segmentPosition?: number;
  }[],
): JourneyMarkerFeatureCollection {
  const markers = new Map<
    string,
    {
      location: CatalogLocation;
      roles: Set<JourneyMarkerRole>;
      segmentPositions: Set<number>;
    }
  >();

  for (const item of locations) {
    const existing = markers.get(item.location.slug);

    if (existing) {
      existing.roles.add(item.role);
      if (item.segmentPosition !== undefined) {
        existing.segmentPositions.add(item.segmentPosition);
      }
      continue;
    }

    markers.set(item.location.slug, {
      location: item.location,
      roles: new Set([item.role]),
      segmentPositions:
        item.segmentPosition === undefined
          ? new Set()
          : new Set([item.segmentPosition]),
    });
  }

  return {
    type: "FeatureCollection",
    features: [...markers.values()].map((marker, index) => ({
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
        roles: [...marker.roles],
        segmentPositions: [...marker.segmentPositions].sort(
          (first, second) => first - second,
        ),
      },
    })),
  };
}

export async function searchDevelopmentJourneyPreviews(
  originSlug: string,
  destinationSlug: string,
): Promise<DevelopmentJourneyPreview[]> {
  if (!canExposeDevelopmentJourneyPreviews()) {
    return [];
  }

  const catalog = await getOperationsCatalog();
  const locationsById = new Map(
    catalog.locations.map((location) => [location.id, location]),
  );
  const routeStopsById = new Map(
    catalog.routeStops.map((routeStop) => [routeStop.id, routeStop]),
  );
  const routesById = new Map(catalog.routes.map((route) => [route.id, route]));

  const matchingJourneys = catalog.journeys.filter((journey) => {
    const origin = locationsById.get(journey.originLocationId);
    const destination = locationsById.get(journey.destinationLocationId);

    return (
      journey.status !== "verified" &&
      !journey.isActive &&
      origin?.slug === originSlug &&
      destination?.slug === destinationSlug
    );
  });

  return Promise.all(
    matchingJourneys.map(async (journey) => {
      const origin = locationsById.get(journey.originLocationId);
      const destination = locationsById.get(journey.destinationLocationId);

      if (!origin || !destination) {
        throw new Error(
          `Draft journey "${journey.slug}" has missing endpoints.`,
        );
      }

      const markerLocations: Parameters<
        typeof buildPreviewMarkers
      >[0][number][] = [{ location: origin, role: "origin" }];
      const pathRequests: PreviewPathRequest[] = [];

      const segments = catalog.segments
        .filter((segment) => segment.journeyId === journey.id)
        .sort((first, second) => first.position - second.position)
        .map((segment) => {
          if (segment.kind === "walking") {
            const from = segment.walkingFromLocationId
              ? locationsById.get(segment.walkingFromLocationId)
              : null;
            const to = segment.walkingToLocationId
              ? locationsById.get(segment.walkingToLocationId)
              : null;

            if (!from || !to) {
              throw new Error(
                `Draft walking segment ${segment.position} has missing locations.`,
              );
            }

            pathRequests.push({
              segmentId: segment.id,
              segmentPosition: segment.position,
              kind: segment.kind,
              from,
              to,
            });

            return {
              id: segment.id,
              position: segment.position,
              kind: "walking" as const,
              summary: segment.summary,
              from: { name: from.name },
              to: { name: to.name },
            };
          }

          const boardingStop = segment.boardingRouteStopId
            ? routeStopsById.get(segment.boardingRouteStopId)
            : null;
          const alightingStop = segment.alightingRouteStopId
            ? routeStopsById.get(segment.alightingRouteStopId)
            : null;

          if (!boardingStop || !alightingStop) {
            throw new Error(
              `Draft transit segment ${segment.position} has missing stops.`,
            );
          }

          const boardingLocation = locationsById.get(boardingStop.locationId);
          const alightingLocation = locationsById.get(alightingStop.locationId);
          const route = routesById.get(boardingStop.transportRouteId);

          if (!boardingLocation || !alightingLocation || !route) {
            throw new Error(
              `Draft transit segment ${segment.position} has incomplete route data.`,
            );
          }

          markerLocations.push(
            {
              location: boardingLocation,
              role: "pickup",
              segmentPosition: segment.position,
            },
            {
              location: alightingLocation,
              role: "dropoff",
              segmentPosition: segment.position,
            },
          );
          pathRequests.push({
            segmentId: segment.id,
            segmentPosition: segment.position,
            kind: segment.kind,
            from: boardingLocation,
            to: alightingLocation,
          });

          return {
            id: segment.id,
            position: segment.position,
            kind: "transit" as const,
            summary: segment.summary,
            route: {
              name: route.name,
              mode: route.mode,
              operator: route.operator,
              signboard: route.signboard,
            },
            boardingStop: { name: boardingLocation.name },
            alightingStop: { name: alightingLocation.name },
          };
        });

      markerLocations.push({ location: destination, role: "destination" });
      const pathFeatures = pathRequests.map(buildDevelopmentPath);

      return {
        previewType: "development",
        id: journey.id,
        slug: journey.slug,
        title: journey.title,
        summary: journey.summary,
        origin: { slug: origin.slug, name: origin.name },
        destination: { slug: destination.slug, name: destination.name },
        verificationStatus: "unverified",
        segments,
        map: {
          markers: buildPreviewMarkers(markerLocations),
          paths: { type: "FeatureCollection", features: pathFeatures },
        },
      } satisfies DevelopmentJourneyPreview;
    }),
  );
}
