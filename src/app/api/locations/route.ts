import {
  findActiveLocationsBySlugs,
  locationSearchMaxLength,
  locationSearchMinLength,
  searchActiveLocations,
} from "@/server/locations/search-locations";
import { jsonNoStore } from "@/server/http/json-no-store";

export const runtime = "nodejs";

const locationSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const query = (searchParams.get("q") ?? "").trim();
  const rawSlugs = (searchParams.get("slugs") ?? "").trim();

  if (query && rawSlugs) {
    return jsonNoStore(
      {
        error: {
          code: "LOCATION_SEARCH_MODE_CONFLICT",
          message: "Use either a text query or exact location slugs.",
        },
      },
      { status: 400 },
    );
  }

  const slugs = rawSlugs
    ? [...new Set(rawSlugs.split(",").map((slug) => slug.trim()))]
    : [];

  if (
    slugs.length > 2 ||
    slugs.some((slug) => slug.length > 180 || !locationSlugPattern.test(slug))
  ) {
    return jsonNoStore(
      {
        error: {
          code: "INVALID_LOCATION_SLUGS",
          message: "Supply at most two valid location slugs.",
        },
      },
      { status: 400 },
    );
  }

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
    const result = rawSlugs
      ? await findActiveLocationsBySlugs(slugs)
      : await searchActiveLocations(query);

    return jsonNoStore({
      data: result,
      meta: {
        query,
        slugs,
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
