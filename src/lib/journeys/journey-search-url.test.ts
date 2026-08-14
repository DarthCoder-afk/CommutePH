import assert from "node:assert/strict";
import test from "node:test";

import {
  buildJourneySearchUrl,
  readJourneySearchSlugs,
} from "./journey-search-url";

test("reads a valid shared journey search", () => {
  assert.deepEqual(
    readJourneySearchSlugs(
      "?origin=one-ayala-terminal&destination=bgc-high-street",
    ),
    {
      origin: "one-ayala-terminal",
      destination: "bgc-high-street",
    },
  );
});

test("rejects invalid or identical shared endpoints", () => {
  assert.equal(
    readJourneySearchSlugs("?origin=One%20Ayala&destination=bgc"),
    null,
  );
  assert.equal(readJourneySearchSlugs("?origin=bgc&destination=bgc"), null);
  assert.equal(readJourneySearchSlugs("?origin=bgc"), null);
});

test("adds and removes journey parameters without discarding other state", () => {
  const populated = buildJourneySearchUrl(
    "https://example.test/?theme=light#map",
    { origin: "one-ayala", destination: "bgc" },
  );

  assert.equal(populated, "/?theme=light&origin=one-ayala&destination=bgc#map");
  assert.equal(
    buildJourneySearchUrl(`https://example.test${populated}`, null),
    "/?theme=light#map",
  );
});
