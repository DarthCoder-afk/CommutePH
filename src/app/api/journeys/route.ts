import { jsonNoStore } from "@/server/http/json-no-store";
import { canExposeDevelopmentJourneyPreviews } from "@/server/journeys/development-journey-preview-policy";
import { searchDevelopmentJourneyPreviews } from "@/server/journeys/search-development-journey-previews";
import { searchPublishedJourneys } from "@/server/journeys/search-published-journeys";

export const runtime = "nodejs";

const locationSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isValidLocationSlug(value: string) {
  return value.length <= 180 && locationSlugPattern.test(value);
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;

  const origin = (searchParams.get("origin") ?? "").trim();

  const destination = (searchParams.get("destination") ?? "").trim();

  if (!origin || !destination) {
    return jsonNoStore(
      {
        error: {
          code: "JOURNEY_ENDPOINTS_REQUIRED",
          message: "Both origin and destination are required.",
        },
      },
      {
        status: 400,
      },
    );
  }

  if (!isValidLocationSlug(origin) || !isValidLocationSlug(destination)) {
    return jsonNoStore(
      {
        error: {
          code: "INVALID_LOCATION_SLUG",
          message: "Origin and destination must be valid location slugs.",
        },
      },
      {
        status: 400,
      },
    );
  }

  if (origin === destination) {
    return jsonNoStore(
      {
        error: {
          code: "IDENTICAL_JOURNEY_ENDPOINTS",
          message: "Origin and destination must be different.",
        },
      },
      {
        status: 400,
      },
    );
  }

  try {
    const publishedJourneys = await searchPublishedJourneys(
      origin,
      destination,
    );
    const developmentPreviews =
      publishedJourneys.length === 0 && canExposeDevelopmentJourneyPreviews()
        ? await searchDevelopmentJourneyPreviews(origin, destination)
        : [];
    const result = [...publishedJourneys, ...developmentPreviews];

    return jsonNoStore({
      data: result,
      meta: {
        origin,
        destination,
        count: result.length,
        searchType: "direct-and-one-transfer",
        includesDevelopmentPreview: developmentPreviews.length > 0,
      },
    });
  } catch (error) {
    console.error("Failed to search journeys:", error);

    return jsonNoStore(
      {
        error: {
          code: "JOURNEY_SEARCH_FAILED",
          message: "Unable to search journeys.",
        },
      },
      {
        status: 500,
      },
    );
  }
}
