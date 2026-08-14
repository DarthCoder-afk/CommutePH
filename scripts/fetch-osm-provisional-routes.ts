import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { normalizeMetroManilaCity } from "@/server/locations/normalize-metro-manila-city";
import {
  buildOsmRouteOverpassQuery,
  parseOsmRouteCandidates,
  type OsmRouteElement,
} from "@/server/routes/osm-route-candidate-source";

type OverpassResponse = { elements?: OsmRouteElement[] };

function parseOptions(arguments_: string[]) {
  const values = arguments_.filter((argument) => argument !== "--");
  const outputPath = values[0];
  const cityIndex = values.indexOf("--city");
  const requestedCity = cityIndex === -1 ? null : values[cityIndex + 1];
  const city = requestedCity ? normalizeMetroManilaCity(requestedCity) : null;

  if (!outputPath || !city) {
    throw new Error(
      "Usage: pnpm db:fetch-osm-provisional-routes -- <output.json> --city <Metro Manila city>",
    );
  }

  if (values.length !== 3 || cityIndex !== 1) {
    throw new Error("Only an output path and --city are supported.");
  }

  return { outputPath, city };
}

const options = parseOptions(process.argv.slice(2));
const overpassUrls = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
] as const;

async function fetchOverpassResponse() {
  const failures: string[] = [];
  const query = buildOsmRouteOverpassQuery(options.city);

  for (const overpassUrl of overpassUrls) {
    try {
      const response = await fetch(overpassUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": "CommuteMap-PH provisional route importer",
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(210_000),
      });

      if (response.ok) return response;

      failures.push(`${overpassUrl}: HTTP ${response.status}`);
    } catch (error) {
      failures.push(
        `${overpassUrl}: ${error instanceof Error ? error.message : "request failed"}`,
      );
    }
  }

  throw new Error(`All Overpass requests failed:\n${failures.join("\n")}`);
}

async function main() {
  const response = await fetchOverpassResponse();
  const payload = (await response.json()) as OverpassResponse;

  if (!Array.isArray(payload.elements)) {
    throw new Error("Overpass returned an invalid response.");
  }

  const { candidates, skipped } = parseOsmRouteCandidates(
    payload.elements,
    options.city,
  );

  if (candidates.length === 0) {
    throw new Error("No mapped route candidates were returned for this city.");
  }

  const absoluteOutputPath = resolve(options.outputPath);

  await writeFile(
    absoluteOutputPath,
    `${JSON.stringify(
      {
        sourceType: "openstreetmap",
        sourceUrl: "https://www.openstreetmap.org/copyright",
        city: options.city,
        candidates,
      },
      null,
      2,
    )}\n`,
    { encoding: "utf8", flag: "wx" },
  );

  console.log(
    `Prepared ${candidates.length} provisional route candidates for ${options.city}.`,
  );
  console.log(
    `Found ${candidates.reduce((total, candidate) => total + candidate.stops.length, 0)} ordered route-member stop references.`,
  );
  console.log(`Skipped ${skipped} malformed or unsupported relations.`);
  console.log(
    `Wrote ${absoluteOutputPath}. No database records were modified.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
