import assert from "node:assert/strict";
import test from "node:test";

import { findLikelyLocationDuplicates } from "./find-likely-location-duplicates";

const first = {
  id: "first",
  name: "Ayala Bus Stop",
  slug: "ayala-bus-stop-first",
  longitude: 121.0279,
  latitude: 14.5505,
};

test("flags matching normalized names within 150 meters", () => {
  const duplicates = findLikelyLocationDuplicates([
    first,
    {
      ...first,
      id: "second",
      name: "AYALA--BUS STOP",
      slug: "ayala-bus-stop-second",
      longitude: 121.028,
    },
  ]);

  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0]?.reason, "same_normalized_name");
});

test("flags differently named locations within 25 meters", () => {
  const duplicates = findLikelyLocationDuplicates([
    first,
    {
      ...first,
      id: "second",
      name: "EDSA Loading Bay",
      slug: "edsa-loading-bay",
      longitude: 121.02795,
    },
  ]);

  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0]?.reason, "very_close_proximity");
});

test("does not flag distant locations", () => {
  assert.deepEqual(
    findLikelyLocationDuplicates([
      first,
      {
        ...first,
        id: "second",
        slug: "distant-ayala-bus-stop",
        longitude: 121.05,
      },
    ]),
    [],
  );
});
