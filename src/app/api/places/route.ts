import {
  getMapTilerApiKey,
  placeSearchMaxLength,
  placeSearchMinLength,
} from "@/config/place-search";
import { jsonNoStore } from "@/server/http/json-no-store";
import { searchMapTilerPlaces } from "@/server/places/search-maptiler-places";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();

  if (query.length < placeSearchMinLength) {
    return jsonNoStore(
      {
        error: {
          code: "PLACE_QUERY_TOO_SHORT",
          message: `Search queries must contain at least ${placeSearchMinLength} characters.`,
        },
      },
      { status: 400 },
    );
  }

  if (query.length > placeSearchMaxLength) {
    return jsonNoStore(
      {
        error: {
          code: "PLACE_QUERY_TOO_LONG",
          message: `Search queries cannot exceed ${placeSearchMaxLength} characters.`,
        },
      },
      { status: 400 },
    );
  }

  const apiKey = getMapTilerApiKey();

  if (!apiKey) {
    return jsonNoStore(
      {
        error: {
          code: "PLACE_SEARCH_NOT_CONFIGURED",
          message: "General place search is not configured.",
        },
      },
      { status: 503 },
    );
  }

  try {
    const places = await searchMapTilerPlaces({
      apiKey,
      query,
      signal: request.signal,
    });

    return jsonNoStore({
      data: places,
      meta: { query, count: places.length },
    });
  } catch (error) {
    console.error("Failed to search general places:", error);

    return jsonNoStore(
      {
        error: {
          code: "PLACE_SEARCH_FAILED",
          message: "Unable to search general places.",
        },
      },
      { status: 502 },
    );
  }
}
