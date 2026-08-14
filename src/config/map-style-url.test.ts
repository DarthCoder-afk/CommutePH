import assert from "node:assert/strict";
import test from "node:test";

import {
  developmentMapStyle,
  parsePublicMapStyleUrl,
  resolveMapStyle,
} from "./map-style-url";

test("uses the configured public map style URL", () => {
  assert.equal(
    resolveMapStyle(" https://maps.example.test/style.json ", "production"),
    "https://maps.example.test/style.json",
  );
});

test("uses the raster development basemap only during development", () => {
  assert.equal(resolveMapStyle(undefined, "development"), developmentMapStyle);
});

test("requires an explicitly configured basemap in production", () => {
  assert.equal(resolveMapStyle(undefined, "production"), null);
  assert.equal(resolveMapStyle("   ", "production"), null);
  assert.throws(
    () => parsePublicMapStyleUrl(undefined, "production"),
    /NEXT_PUBLIC_MAP_STYLE_URL is required/,
  );
  assert.throws(
    () => parsePublicMapStyleUrl("   ", "production"),
    /NEXT_PUBLIC_MAP_STYLE_URL is required/,
  );
});

test("rejects malformed and unsafe map style URLs", () => {
  assert.throws(
    () => parsePublicMapStyleUrl("not-a-url", "production"),
    /must be a valid URL/,
  );
  assert.throws(
    () => parsePublicMapStyleUrl("file:///tmp/style.json", "production"),
    /must use the https: or http: protocol/,
  );
});
