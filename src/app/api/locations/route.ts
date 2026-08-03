import {
  locationSearchMaxLength,
  locationSearchMinLength,
  searchActiveLocations,
} from "@/server/locations/search-locations";
import { jsonNoStore } from "@/server/http/json-no-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const query = (searchParams.get("q") ?? "").trim();

  if (query.length > 0 && query.length < locationSearchMinLength) {
    return jsonNoStore(
      {
        error: {
          code: "LOCATION_QUERY_TOO_SHORT",
          message: `Search queries must contain at least ${locationSearchMinLength} characters.`,
        },
      },
      {
        status: 400,
      },
    );
  }

  if (query.length > locationSearchMaxLength) {
    return jsonNoStore(
      {
        error: {
          code: "LOCATION_QUERY_TOO_LONG",
          message: `Search queries cannot exceed ${locationSearchMaxLength} characters.`,
        },
      },
      {
        status: 400,
      },
    );
  }

  try {
    const result = await searchActiveLocations(query);

    return jsonNoStore({
      data: result,
      meta: {
        query,
        count: result.length,
      },
    });
  } catch (error) {
    console.error("Failed to search locations:", error);

    return jsonNoStore(
      {
        error: {
          code: "LOCATIONS_FETCH_FAILED",
          message: "Unable to fetch locations.",
        },
      },
      {
        status: 500,
      },
    );
  }
}
