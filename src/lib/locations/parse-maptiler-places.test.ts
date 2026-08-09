import assert from "node:assert/strict";
import test from "node:test";

import { parseMapTilerPlaces } from "./parse-maptiler-places";

test("parses valid MapTiler features into unverified place options", () => {
  const places = parseMapTilerPlaces({
    features: [
      {
        id: "poi.123",
        text: "SM Megamall",
        place_name: "SM Megamall, Mandaluyong, Metro Manila, Philippines",
        center: [121.0567, 14.5842],
        place_type: ["poi"],
        context: [
          { id: "municipality.1", text: "Mandaluyong" },
          { id: "region.1", text: "Metro Manila" },
        ],
      },
    ],
  });

  assert.deepEqual(places, [
    {
      id: "maptiler:poi.123",
      source: "place",
      provider: "maptiler",
      name: "SM Megamall",
      label: "SM Megamall, Mandaluyong, Metro Manila, Philippines",
      kind: "poi",
      city: "Mandaluyong",
      area: null,
      longitude: 121.0567,
      latitude: 14.5842,
    },
  ]);
});

test("ignores malformed MapTiler features", () => {
  assert.deepEqual(
    parseMapTilerPlaces({
      features: [
        null,
        { text: "Missing coordinate", place_name: "Metro Manila" },
        {
          text: "Invalid coordinate",
          place_name: "Metro Manila",
          center: [999, 14.5],
        },
      ],
    }),
    [],
  );
});

test("rejects malformed provider responses", () => {
  assert.throws(
    () => parseMapTilerPlaces({}),
    /place search provider returned an invalid response/,
  );
});
