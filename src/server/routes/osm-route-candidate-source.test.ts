import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOsmRouteOverpassQuery,
  parseOsmRouteCandidates,
} from "./osm-route-candidate-source";

test("builds a city-boundary public transport route query", () => {
  const query = buildOsmRouteOverpassQuery("Pasig");

  assert.match(query, /map_to_area->\.searchArea/);
  assert.match(query, /bus\|minibus\|share_taxi\|jeepney/);
  assert.match(query, /\(area\.searchArea\)/);
});

test("parses route metadata and ordered stop members", () => {
  const result = parseOsmRouteCandidates(
    [
      {
        type: "relation",
        id: 100,
        tags: {
          type: "route",
          route: "bus",
          name: "Mapped sample route",
          from: "Sample origin",
          to: "Sample destination",
          operator: "Sample operator",
        },
        members: [
          { type: "way", ref: 900, role: "" },
          { type: "node", ref: 1, role: "stop" },
          { type: "node", ref: 2, role: "platform" },
        ],
      },
      { type: "node", id: 1, tags: { name: "First mapped stop" } },
      { type: "node", id: 2, tags: { name: "Second mapped stop" } },
    ],
    "Pasig",
  );

  assert.equal(result.skipped, 0);
  assert.equal(result.candidates[0]?.externalId, "relation/100");
  assert.equal(result.candidates[0]?.rawMode, "bus");
  assert.deepEqual(result.candidates[0]?.stops, [
    {
      sourceExternalId: "node/1",
      rawRole: "stop",
      mappedName: "First mapped stop",
      position: 1,
    },
    {
      sourceExternalId: "node/2",
      rawRole: "platform",
      mappedName: "Second mapped stop",
      position: 2,
    },
  ]);
});

test("keeps unnamed routes explicitly provisional", () => {
  const result = parseOsmRouteCandidates(
    [
      {
        type: "relation",
        id: 101,
        tags: { type: "route", route: "share_taxi" },
      },
    ],
    "Pasig",
  );

  assert.equal(
    result.candidates[0]?.name,
    "Unnamed mapped route (relation/101)",
  );
});

test("rejects unsupported and malformed route relations", () => {
  const result = parseOsmRouteCandidates(
    [
      {
        type: "relation",
        id: 102,
        tags: { type: "route", route: "hiking" },
      },
      { type: "relation", id: 103 },
    ],
    "Pasig",
  );

  assert.deepEqual(result.candidates, []);
  assert.equal(result.skipped, 2);
});
