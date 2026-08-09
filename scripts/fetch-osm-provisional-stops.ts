import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { normalizeMetroManilaCity } from "@/server/locations/normalize-metro-manila-city";

type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: {
    lat?: number;
    lon?: number;
  };
  tags?: Record<string, string>;
};

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
const metroManilaBoundingBox = "14.349,120.906,14.785,121.135";
const citySelector =
  options.city === "Pasig"
    ? '["addr:city"~"^Pasig( City)?$",i]'
    : options.city
      ? `["addr:city"="${options.city}"]`
      : '["addr:city"]';

const query = `[out:json][timeout:120];
(
  nwr["highway"="bus_stop"]["name"]${citySelector}(${metroManilaBoundingBox});
  nwr["public_transport"~"^(station|platform)$"]["name"]${citySelector}(${metroManilaBoundingBox});
  nwr["railway"~"^(station|halt|tram_stop|subway_entrance)$"]["name"]${citySelector}(${metroManilaBoundingBox});
  nwr["amenity"="bus_station"]["name"]${citySelector}(${metroManilaBoundingBox});
);
out center tags;`;

async function fetchOverpassResponse() {
  const failures: string[] = [];

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

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180)
    .replace(/-+$/g, "");
}

function getKind(tags: Record<string, string>) {
  if (tags.railway === "subway_entrance") {
    return "entrance" as const;
  }

  if (tags.amenity === "bus_station" || tags.public_transport === "station") {
    return "terminal" as const;
  }

  if (
    tags.railway === "station" ||
    tags.railway === "halt" ||
    tags.railway === "tram_stop"
  ) {
    return "station" as const;
  }

  return "stop" as const;
}

function getCoordinates(element: OsmElement) {
  const longitude = element.lon ?? element.center?.lon;
  const latitude = element.lat ?? element.center?.lat;

  if (
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    return null;
  }

  return { longitude, latitude };
}

async function main() {
  if (!options.outputPath) {
    throw new Error(
      "Provide an output path. Example: pnpm db:fetch-osm-provisional-stops -- /tmp/metro-manila-osm-stops.json --city Pasig",
    );
  }

  const response = await fetchOverpassResponse();

  const payload = (await response.json()) as OverpassResponse;

  if (!Array.isArray(payload.elements)) {
    throw new Error("Overpass returned an invalid response.");
  }

  let skipped = 0;
  const stops = payload.elements.flatMap((element) => {
    const tags = element.tags;
    const coordinates = getCoordinates(element);
    const name = tags?.name?.trim();
    const sourceCity = tags?.["addr:city"]?.trim();
    const city = sourceCity ? normalizeMetroManilaCity(sourceCity) : null;

    if (!tags || !name || !city || !coordinates) {
      skipped += 1;
      return [];
    }

    if (options.city && city !== options.city) {
      return [];
    }

    const externalId = `${element.type}/${element.id}`;
    const kind = getKind(tags);
    const area =
      tags["addr:suburb"]?.trim() || tags["addr:neighbourhood"]?.trim() || null;

    return [
      {
        externalId,
        name: name.slice(0, 160),
        slug: slugify(`${name}-${city}-${element.type}-${element.id}`),
        kind,
        description: `Provisional OpenStreetMap ${kind}. Not verified for public commute guidance.`,
        city: city.slice(0, 80),
        area: area?.slice(0, 100) ?? null,
        ...coordinates,
        sourceUrl: `https://www.openstreetmap.org/${externalId}`,
      },
    ];
  });

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
    `Prepared ${stops.length} provisional OpenStreetMap stops${options.city ? ` for ${options.city}` : ""}.`,
  );
  console.log(`Skipped ${skipped} malformed or incomplete elements.`);
  console.log(`Wrote ${absoluteOutputPath}.`);
  console.log("No database records were modified by this command.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
