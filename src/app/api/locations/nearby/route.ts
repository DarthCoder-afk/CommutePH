import { defaultPickupSearchRadiusMeters } from "@/config/pickup-search";
import { jsonNoStore } from "@/server/http/json-no-store";
import {
  nearbyLocationDefaultLimit,
  nearbyLocationMaximumLimit,
  nearbyLocationMaximumRadiusMeters,
  searchNearbyActiveLocations,
} from "@/server/locations/search-nearby-locations";

export const runtime = "nodejs";

function parseFiniteNumber(value: string | null) {
  if (value === null || value.trim() === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value: string | null, fallback: number) {
  const parsed = parseFiniteNumber(value);

  return parsed !== null && Number.isInteger(parsed) ? parsed : fallback;
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const longitude = parseFiniteNumber(searchParams.get("longitude"));
  const latitude = parseFiniteNumber(searchParams.get("latitude"));
  const radiusMeters = parseInteger(
    searchParams.get("radiusMeters"),
    defaultPickupSearchRadiusMeters,
  );
  const limit = parseInteger(
    searchParams.get("limit"),
    nearbyLocationDefaultLimit,
  );

  if (
    longitude === null ||
    longitude < -180 ||
    longitude > 180 ||
    latitude === null ||
    latitude < -90 ||
    latitude > 90
  ) {
    return jsonNoStore(
      {
        error: {
          code: "INVALID_NEARBY_LOCATION_COORDINATES",
          message: "Valid longitude and latitude values are required.",
        },
      },
      { status: 400 },
    );
  }

  if (radiusMeters < 100 || radiusMeters > nearbyLocationMaximumRadiusMeters) {
    return jsonNoStore(
      {
        error: {
          code: "INVALID_NEARBY_LOCATION_RADIUS",
          message: `The search radius must be between 100 and ${nearbyLocationMaximumRadiusMeters} meters.`,
        },
      },
      { status: 400 },
    );
  }

  if (limit < 1 || limit > nearbyLocationMaximumLimit) {
    return jsonNoStore(
      {
        error: {
          code: "INVALID_NEARBY_LOCATION_LIMIT",
          message: `The result limit must be between 1 and ${nearbyLocationMaximumLimit}.`,
        },
      },
      { status: 400 },
    );
  }

  try {
    const candidates = await searchNearbyActiveLocations({
      longitude,
      latitude,
      radiusMeters,
      limit,
    });

    return jsonNoStore({
      data: candidates,
      meta: {
        count: candidates.length,
        radiusMeters,
      },
    });
  } catch (error) {
    console.error("Failed to search nearby supported locations:", error);

    return jsonNoStore(
      {
        error: {
          code: "NEARBY_LOCATIONS_FETCH_FAILED",
          message: "Unable to search nearby supported locations.",
        },
      },
      { status: 500 },
    );
  }
}
