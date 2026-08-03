import assert from "node:assert/strict";

import { noStoreCacheControl } from "@/server/http/json-no-store";

type LocationSearchResponse = {
  data: Array<{
    id: string;
    name: string;
    slug: string;
    isActive?: boolean;
  }>;
};

type JourneySearchResponse = {
  data: Array<{
    id: string;
    slug: string;
  }>;
  meta: {
    origin: string;
    destination: string;
    count: number;
    searchType: "direct";
  };
};

type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
  };
};

type HealthResponse = {
  status: "ok" | "unavailable";
  checks: {
    database: "ok" | "unavailable";
  };
};

const applicationUrl = process.env.APP_URL ?? "http://localhost:3000";

function createUrl(pathname: string, parameters?: Record<string, string>) {
  const url = new URL(pathname, applicationUrl);

  if (parameters) {
    for (const [name, value] of Object.entries(parameters)) {
      url.searchParams.set(name, value);
    }
  }

  return url;
}

async function fetchJson(
  pathname: string,
  expectedStatus: number,
  parameters?: Record<string, string>,
) {
  const url = createUrl(pathname, parameters);
  const response = await fetch(url);
  const payload = (await response.json()) as unknown;

  assert.equal(
    response.status,
    expectedStatus,
    `${url.pathname} expected status ${expectedStatus}, received ${
      response.status
    }. Response: ${JSON.stringify(payload)}`,
  );

  assert.match(
    response.headers.get("content-type") ?? "",
    /^application\/json\b/i,
    `${url.pathname} did not return an application/json response.`,
  );

  assert.equal(
    response.headers.get("cache-control"),
    noStoreCacheControl,
    `${url.pathname} did not return the required no-store cache policy.`,
  );

  return payload;
}

async function main() {
  console.log(`Checking public application at ${applicationUrl}`);

  const healthResponse = (await fetchJson(
    "/api/health",
    200,
  )) as HealthResponse;

  assert.equal(
    healthResponse.status,
    "ok",
    "The application health status is not ok.",
  );

  assert.equal(
    healthResponse.checks.database,
    "ok",
    "The database health status is not ok.",
  );

  const activeLocationResponse = (await fetchJson("/api/locations", 200, {
    q: "One Ayala",
  })) as LocationSearchResponse;

  assert(
    activeLocationResponse.data.some(
      (location) => location.slug === "one-ayala-terminal",
    ),
    "The active One Ayala location was not returned.",
  );

  assert(
    activeLocationResponse.data.every((location) => !("isActive" in location)),
    "Internal location activation state leaked through the public API.",
  );

  const shortLocationQueryResponse = (await fetchJson("/api/locations", 400, {
    q: "a",
  })) as ApiErrorResponse;

  assert.equal(
    shortLocationQueryResponse.error.code,
    "LOCATION_QUERY_TOO_SHORT",
    "Location search did not reject a one-character query.",
  );

  const longLocationQueryResponse = (await fetchJson("/api/locations", 400, {
    q: "a".repeat(81),
  })) as ApiErrorResponse;

  assert.equal(
    longLocationQueryResponse.error.code,
    "LOCATION_QUERY_TOO_LONG",
    "Location search did not reject a query exceeding 80 characters.",
  );

  const inactiveLocationResponse = (await fetchJson("/api/locations", 200, {
    q: "HSBC",
  })) as LocationSearchResponse;

  assert.equal(
    inactiveLocationResponse.data.length,
    0,
    "The inactive HSBC fixture leaked through public location search.",
  );

  const missingEndpointResponse = (await fetchJson("/api/journeys", 400, {
    origin: "one-ayala-terminal",
  })) as ApiErrorResponse;

  assert.equal(
    missingEndpointResponse.error.code,
    "JOURNEY_ENDPOINTS_REQUIRED",
    "Journey search did not require both endpoints.",
  );

  const invalidEndpointResponse = (await fetchJson("/api/journeys", 400, {
    origin: "INVALID_SLUG",
    destination: "bgc-high-street",
  })) as ApiErrorResponse;

  assert.equal(
    invalidEndpointResponse.error.code,
    "INVALID_LOCATION_SLUG",
    "Journey search did not reject an invalid location slug.",
  );

  const identicalEndpointResponse = (await fetchJson("/api/journeys", 400, {
    origin: "one-ayala-terminal",
    destination: "one-ayala-terminal",
  })) as ApiErrorResponse;

  assert.equal(
    identicalEndpointResponse.error.code,
    "IDENTICAL_JOURNEY_ENDPOINTS",
    "Journey search did not reject identical endpoints.",
  );

  const journeySearchResponse = (await fetchJson("/api/journeys", 200, {
    origin: "one-ayala-terminal",
    destination: "bgc-high-street",
  })) as JourneySearchResponse;

  assert.deepEqual(
    journeySearchResponse.data,
    [],
    "The unpublished provisional journey leaked through public search.",
  );

  assert.equal(
    journeySearchResponse.meta.count,
    0,
    "The public journey count should be zero.",
  );

  const draftDetailResponse = (await fetchJson(
    "/api/journeys/one-ayala-to-bgc-high-street-via-bgc-bus",
    404,
  )) as ApiErrorResponse;

  assert.equal(
    draftDetailResponse.error.code,
    "JOURNEY_NOT_FOUND",
    "The draft detail API did not return JOURNEY_NOT_FOUND.",
  );

  const invalidSlugResponse = (await fetchJson(
    "/api/journeys/INVALID_SLUG",
    400,
  )) as ApiErrorResponse;

  assert.equal(
    invalidSlugResponse.error.code,
    "INVALID_JOURNEY_SLUG",
    "The detail API did not reject an invalid slug.",
  );

  const draftPageResponse = await fetch(
    createUrl("/journeys/one-ayala-to-bgc-high-street-via-bgc-bus"),
    {
      redirect: "manual",
    },
  );

  assert.equal(
    draftPageResponse.status,
    404,
    "The unpublished journey page must return 404.",
  );

  console.log("Public release smoke checks passed.");
  console.log("Inactive provisional locations and journeys remain private.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
