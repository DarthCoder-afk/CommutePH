import assert from "node:assert/strict";
import test from "node:test";

import { searchPickupJourneys } from "./search-pickup-journeys";

const candidates = [
  { location: { id: "one-ayala", slug: "one-ayala-terminal" } },
  { location: { id: "bgc", slug: "bgc-high-street" } },
  { location: { id: "cubao", slug: "cubao-mrt-3-station" } },
];

test("returns only pickup candidates with a journey to the destination", async () => {
  const matches = await searchPickupJourneys({
    candidates,
    destinationSlug: "bgc-high-street",
    searchJourneys: async (originSlug) =>
      originSlug === "one-ayala-terminal" ? [{ id: "journey-one" }] : [],
  });

  assert.deepEqual(matches, [
    {
      candidate: candidates[0],
      journeys: [{ id: "journey-one" }],
    },
  ]);
});

test("does not request a journey whose pickup equals the destination", async () => {
  const requestedOrigins: string[] = [];

  await searchPickupJourneys({
    candidates,
    destinationSlug: "bgc-high-street",
    searchJourneys: async (originSlug) => {
      requestedOrigins.push(originSlug);
      return [];
    },
  });

  assert.deepEqual(requestedOrigins, [
    "one-ayala-terminal",
    "cubao-mrt-3-station",
  ]);
});

test("propagates a journey search failure instead of silently hiding it", async () => {
  await assert.rejects(
    searchPickupJourneys({
      candidates: candidates.slice(0, 1),
      destinationSlug: "bgc-high-street",
      searchJourneys: async () => {
        throw new Error("Journey service unavailable.");
      },
    }),
    /Journey service unavailable/,
  );
});
