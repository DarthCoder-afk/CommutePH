import { getPublishedJourneyDetail } from "@/server/journeys/get-published-journey-detail";
import { jsonNoStore } from "@/server/http/json-no-store";

export const runtime = "nodejs";

const journeySlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type JourneyRouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

export async function GET(_request: Request, context: JourneyRouteContext) {
  const { slug } = await context.params;

  if (slug.length > 200 || !journeySlugPattern.test(slug)) {
    return jsonNoStore(
      {
        error: {
          code: "INVALID_JOURNEY_SLUG",
          message: "The journey slug is invalid.",
        },
      },
      {
        status: 400,
      },
    );
  }

  try {
    const journey = await getPublishedJourneyDetail(slug);

    if (!journey) {
      return jsonNoStore(
        {
          error: {
            code: "JOURNEY_NOT_FOUND",
            message: "The journey was not found.",
          },
        },
        {
          status: 404,
        },
      );
    }

    return jsonNoStore({
      data: journey,
    });
  } catch (error) {
    console.error("Failed to load journey detail:", error);

    return jsonNoStore(
      {
        error: {
          code: "JOURNEY_DETAIL_FAILED",
          message: "Unable to load the journey.",
        },
      },
      {
        status: 500,
      },
    );
  }
}
