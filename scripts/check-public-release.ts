import assert from "node:assert/strict";

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

  return payload;
}

async function main() {
  console.log(`Checking public application at ${applicationUrl}`);

  const activeLocationResponse = (await fetchJson("/api/locations", 200, {
    q: "One Ayala",
  })) as LocationSearchResponse;

  assert(
    activeLocationResponse.data.some(
      (location) => location.slug === "one-ayala-terminal",
    ),
    "The active One Ayala location was not returned.",
  );

  const inactiveLocationResponse = (await fetchJson("/api/locations", 200, {
    q: "HSBC",
  })) as LocationSearchResponse;

  assert.equal(
    inactiveLocationResponse.data.length,
    0,
    "The inactive HSBC fixture leaked through public location search.",
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
