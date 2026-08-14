import { jsonNoStore } from "@/server/http/json-no-store";
import { searchVerifiedDirectRoutes } from "@/server/routes/search-verified-direct-routes";

export const runtime = "nodejs";

const locationSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const origin = (searchParams.get("origin") ?? "").trim();
  const destination = (searchParams.get("destination") ?? "").trim();

  if (
    !origin ||
    !destination ||
    origin.length > 180 ||
    destination.length > 180 ||
    !locationSlugPattern.test(origin) ||
    !locationSlugPattern.test(destination) ||
    origin === destination
  ) {
    return jsonNoStore(
      {
        error: {
          code: "INVALID_DIRECT_ROUTE_ENDPOINTS",
          message:
            "Different valid origin and destination location slugs are required.",
        },
      },
      { status: 400 },
    );
  }

  try {
    const routes = await searchVerifiedDirectRoutes(origin, destination);

    return jsonNoStore({
      data: routes,
      meta: {
        origin,
        destination,
        count: routes.length,
        searchType: "verified-direct-routes",
      },
    });
  } catch (error) {
    console.error("Failed to search verified direct routes:", error);

    return jsonNoStore(
      {
        error: {
          code: "DIRECT_ROUTE_SEARCH_FAILED",
          message: "Unable to search verified direct routes.",
        },
      },
      { status: 500 },
    );
  }
}
