import { normalizeMetroManilaCity } from "@/server/locations/normalize-metro-manila-city";

export type OsmElement = {
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

export type ProvisionalOsmStop = {
  externalId: string;
  name: string;
  slug: string;
  kind: "station" | "terminal" | "stop" | "entrance";
  description: string;
  city: string;
  area: string | null;
  longitude: number;
  latitude: number;
  sourceUrl: string;
};

const metroManilaBoundingBox = "14.349,120.906,14.785,121.135";

function escapeOverpassRegularExpression(value: string) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

export function buildOsmStopOverpassQuery(city: string | null) {
  const searchArea = city
    ? `rel["boundary"="administrative"]["admin_level"="6"]["name"~"^(City of )?${escapeOverpassRegularExpression(city)}( City)?$",i](${metroManilaBoundingBox});
map_to_area->.searchArea;`
    : "";
  const locationSelector = city
    ? "(area.searchArea)"
    : `(${metroManilaBoundingBox})`;

  return `[out:json][timeout:120];
${searchArea}
(
  nwr["highway"="bus_stop"]${locationSelector};
  nwr["public_transport"~"^(station|platform)$"]${locationSelector};
  nwr["railway"~"^(station|halt|tram_stop|subway_entrance)$"]${locationSelector};
  nwr["amenity"="bus_station"]${locationSelector};
);
out center tags;`;
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

export function parseOsmStopElements(
  elements: readonly OsmElement[],
  requestedCity: string | null,
) {
  const stopsByExternalId = new Map<string, ProvisionalOsmStop>();
  let skipped = 0;

  for (const element of elements) {
    const tags = element.tags;
    const coordinates = getCoordinates(element);
    const sourceCity = tags?.["addr:city"]?.trim();
    const city = requestedCity
      ? requestedCity
      : sourceCity
        ? normalizeMetroManilaCity(sourceCity)
        : null;

    if (!tags || !coordinates || !city) {
      skipped += 1;
      continue;
    }

    const externalId = `${element.type}/${element.id}`;
    const kind = getKind(tags);
    const mappedName = tags.name?.trim();
    const name = mappedName || `Unnamed mapped ${kind} (${externalId})`;
    const area =
      tags["addr:suburb"]?.trim() || tags["addr:neighbourhood"]?.trim() || null;
    const identityNote = mappedName
      ? ""
      : " Its public identity is missing and requires field review.";

    stopsByExternalId.set(externalId, {
      externalId,
      name: name.slice(0, 160),
      slug: slugify(`${name}-${city}-${element.type}-${element.id}`),
      kind,
      description: `Provisional OpenStreetMap ${kind}. Not verified for public commute guidance.${identityNote}`,
      city,
      area: area?.slice(0, 100) ?? null,
      ...coordinates,
      sourceUrl: `https://www.openstreetmap.org/${externalId}`,
    });
  }

  return {
    stops: [...stopsByExternalId.values()],
    skipped,
  };
}
