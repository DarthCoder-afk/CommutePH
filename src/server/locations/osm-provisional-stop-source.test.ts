import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOsmStopOverpassQuery,
  parseOsmStopElements,
} from "./osm-provisional-stop-source";

test("builds a city-boundary query without requiring addr:city on stops", () => {
  const query = buildOsmStopOverpassQuery("Pasig");

  assert.match(query, /boundary"="administrative/);
  assert.match(query, /map_to_area->\.searchArea/);
  assert.match(query, /\(area\.searchArea\)/);
  assert.doesNotMatch(query, /addr:city/);
});

test("keeps the Metro Manila bounding-box fallback", () => {
  const query = buildOsmStopOverpassQuery(null);

  assert.match(query, /14\.349,120\.906,14\.785,121\.135/);
  assert.doesNotMatch(query, /map_to_area/);
});

test("assigns a city-area result even when the stop has no city tag", () => {
  const result = parseOsmStopElements(
    [
      {
        type: "node",
        id: 123,
        lat: 14.58,
        lon: 121.1,
        tags: {
          highway: "bus_stop",
          name: "Sample Stop",
          "addr:neighbourhood": "Santa Lucia",
        },
      },
    ],
    "Pasig",
  );

  assert.equal(result.skipped, 0);
  assert.deepEqual(result.stops[0], {
    externalId: "node/123",
    name: "Sample Stop",
    slug: "sample-stop-pasig-node-123",
    kind: "stop",
    description:
      "Provisional OpenStreetMap stop. Not verified for public commute guidance.",
    city: "Pasig",
    area: "Santa Lucia",
    longitude: 121.1,
    latitude: 14.58,
    sourceUrl: "https://www.openstreetmap.org/node/123",
  });
});

test("keeps unnamed mapped stops visibly provisional for review", () => {
  const result = parseOsmStopElements(
    [
      {
        type: "node",
        id: 456,
        lat: 14.59,
        lon: 121.11,
        tags: {
          public_transport: "platform",
        },
      },
    ],
    "Pasig",
  );

  assert.equal(result.stops[0]?.name, "Unnamed mapped stop (node/456)");
  assert.match(result.stops[0]?.description ?? "", /requires field review/);
});

test("requires a supported city tag for the bounding-box fallback", () => {
  const result = parseOsmStopElements(
    [
      {
        type: "node",
        id: 789,
        lat: 14.6,
        lon: 121.05,
        tags: {
          highway: "bus_stop",
          name: "Untagged City Stop",
        },
      },
    ],
    null,
  );

  assert.deepEqual(result.stops, []);
  assert.equal(result.skipped, 1);
});
