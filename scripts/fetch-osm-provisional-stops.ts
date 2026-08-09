import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

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

const outputPath = process.argv.slice(2).find((argument) => argument !== "--");
const overpassUrl = "https://overpass-api.de/api/interpreter";
const metroManilaBoundingBox = "14.349,120.906,14.785,121.135";
const metroManilaCities = new Map(
  [
    "Caloocan",
    "Las Piñas",
    "Makati",
    "Malabon",
    "Mandaluyong",
    "Manila",
    "Marikina",
    "Muntinlupa",
    "Navotas",
    "Parañaque",
    "Pasay",
    "Pasig",
    "Pateros",
    "Quezon City",
    "San Juan",
    "Taguig",
    "Valenzuela",
  ].map((city) => [city.toLocaleLowerCase(), city]),
);

metroManilaCities.set("caloocan city", "Caloocan");

const query = `[out:json][timeout:120];
(
  nwr["highway"="bus_stop"]["name"]["addr:city"](${metroManilaBoundingBox});
  nwr["public_transport"~"^(station|platform)$"]["name"]["addr:city"](${metroManilaBoundingBox});
  nwr["railway"~"^(station|halt|tram_stop|subway_entrance)$"]["name"]["addr:city"](${metroManilaBoundingBox});
  nwr["amenity"="bus_station"]["name"]["addr:city"](${metroManilaBoundingBox});
);
out center tags;`;

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
  if (!outputPath) {
    throw new Error(
      "Provide an output path. Example: pnpm db:fetch-osm-provisional-stops -- /tmp/metro-manila-osm-stops.json",
    );
  }

  const searchParams = new URLSearchParams({ data: query });
  const response = await fetch(`${overpassUrl}?${searchParams.toString()}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "CommuteMap-PH provisional stop importer",
    },
    signal: AbortSignal.timeout(150_000),
  });

  if (!response.ok) {
    throw new Error(`Overpass request failed with status ${response.status}.`);
  }

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
    const city = sourceCity
      ? metroManilaCities.get(sourceCity.toLocaleLowerCase())
      : null;

    if (!tags || !name || !city || !coordinates) {
      skipped += 1;
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

  const absoluteOutputPath = resolve(outputPath);

  await writeFile(absoluteOutputPath, `${JSON.stringify(output, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });

  console.log(`Prepared ${stops.length} provisional OpenStreetMap stops.`);
  console.log(`Skipped ${skipped} malformed or incomplete elements.`);
  console.log(`Wrote ${absoluteOutputPath}.`);
  console.log("No database records were modified by this command.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
