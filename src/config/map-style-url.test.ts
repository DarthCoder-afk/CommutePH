import assert from "node:assert/strict";
import test from "node:test";

import { developmentMapStyle, resolveMapStyle } from "./map-style-url";

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
});
