import assert from "node:assert/strict";
import test from "node:test";

import { jsonNoStore, noStoreCacheControl } from "./json-no-store";

test("creates a JSON response with no-store caching", async () => {
  const response = jsonNoStore({
    status: "ok",
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), noStoreCacheControl);

  assert.match(
    response.headers.get("content-type") ?? "",
    /^application\/json\b/i,
  );

  assert.deepEqual(await response.json(), {
    status: "ok",
  });
});

test("preserves status and custom headers while overriding caching", () => {
  const response = jsonNoStore(
    {
      error: {
        code: "PROVISIONAL_TEST_ERROR",
      },
    },
    {
      status: 400,
      headers: {
        "Cache-Control": "public, max-age=3600",
        "X-Test-Header": "preserved",
      },
    },
  );

  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), noStoreCacheControl);
  assert.equal(response.headers.get("x-test-header"), "preserved");
});
