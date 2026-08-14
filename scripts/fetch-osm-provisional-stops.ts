import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { normalizeMetroManilaCity } from "@/server/locations/normalize-metro-manila-city";
import {
  buildOsmStopOverpassQuery,
  parseOsmStopElements,
  type OsmElement,
} from "@/server/locations/osm-provisional-stop-source";

type OverpassResponse = {
  elements?: OsmElement[];
};

function parseOptions(arguments_: string[]) {
  const values = arguments_.filter((argument) => argument !== "--");
  const outputPath = values[0];
  let city: string | null = null;

  for (let index = 1; index < values.length; index += 1) {
    if (values[index] !== "--city") {
      throw new Error(`Unknown argument: ${values[index]}.`);
    }

    const requestedCity = values[index + 1];
    const normalizedCity = requestedCity
      ? normalizeMetroManilaCity(requestedCity)
      : null;

    if (!normalizedCity) {
      throw new Error("--city requires a supported Metro Manila city name.");
    }

    city = normalizedCity;
    index += 1;
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
  const query = buildOsmStopOverpassQuery(options.city);

  for (const overpassUrl of overpassUrls) {
    try {
      const response = await fetch(overpassUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": "CommuteMap-PH provisional stop importer",
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(150_000),
      });

      if (response.ok) {
        return response;
      }

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
  if (!options.outputPath) {
    throw new Error(
      "Provide an output path. Example: pnpm db:fetch-osm-provisional-stops -- /tmp/pasig-osm-stops.json --city Pasig",
    );
  }

  const response = await fetchOverpassResponse();
  const payload = (await response.json()) as OverpassResponse;

  if (!Array.isArray(payload.elements)) {
    throw new Error("Overpass returned an invalid response.");
  }

  const { stops, skipped } = parseOsmStopElements(
    payload.elements,
    options.city,
  );

  if (stops.length === 0) {
    throw new Error(
      "No importable Metro Manila transport stops were returned.",
    );
  }

  const output = {
    sourceType: "openstreetmap",
    sourceUrl: "https://www.openstreetmap.org/copyright",
    stops,
  };
  const absoluteOutputPath = resolve(options.outputPath);

  await writeFile(absoluteOutputPath, `${JSON.stringify(output, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });

  console.log(
    `Prepared ${stops.length} provisional OpenStreetMap stops${options.city ? ` inside the ${options.city} administrative area` : " with supported city tags"}.`,
  );
  console.log(`Skipped ${skipped} malformed or uncategorized elements.`);
  console.log(`Wrote ${absoluteOutputPath}.`);
  console.log("No database records were modified by this command.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
