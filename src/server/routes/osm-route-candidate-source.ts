export type OsmRouteMember = {
  type: "node" | "way" | "relation";
  ref: number;
  role?: string;
};

export type OsmRouteElement = {
  type: "node" | "way" | "relation";
  id: number;
  tags?: Record<string, string>;
  members?: OsmRouteMember[];
};

export type ProvisionalOsmRouteCandidate = {
  externalId: string;
  sourceUrl: string;
  city: string;
  name: string;
  rawMode: string;
  operator: string | null;
  reference: string | null;
  originName: string | null;
  destinationName: string | null;
  via: string | null;
  rawTags: Record<string, string>;
  stops: Array<{
    sourceExternalId: string;
    rawRole: string | null;
    mappedName: string | null;
    position: number;
  }>;
};

const metroManilaBoundingBox = "14.349,120.906,14.785,121.135";
const supportedRouteModes = new Set([
  "bus",
  "minibus",
  "share_taxi",
  "jeepney",
]);

function escapeOverpassRegularExpression(value: string) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

export function buildOsmRouteOverpassQuery(city: string) {
  return `[out:json][timeout:180];
rel["boundary"="administrative"]["admin_level"="6"]["name"~"^(City of )?${escapeOverpassRegularExpression(city)}( City)?$",i](${metroManilaBoundingBox});
map_to_area->.searchArea;
rel["type"="route"]["route"~"^(bus|minibus|share_taxi|jeepney)$"](area.searchArea);
out body;
>;
out body;`;
}

function normalizedOptionalTag(value: string | undefined, maximum: number) {
  const normalized = value?.trim();

  return normalized ? normalized.slice(0, maximum) : null;
}

function isStopMember(member: OsmRouteMember) {
  const role = member.role?.trim().toLocaleLowerCase() ?? "";

  return /^(stop|platform|stop_entry|stop_exit|hail_and_ride)(?:_|$)/.test(
    role,
  );
}

export function parseOsmRouteCandidates(
  elements: readonly OsmRouteElement[],
  city: string,
) {
  const elementsByExternalId = new Map(
    elements.map((element) => [`${element.type}/${element.id}`, element]),
  );
  const candidates: ProvisionalOsmRouteCandidate[] = [];
  let skipped = 0;

  for (const element of elements) {
    if (element.type !== "relation") {
      continue;
    }

    const tags = element.tags;
    const rawMode = tags?.route?.trim().toLocaleLowerCase();

    if (
      !tags ||
      tags.type !== "route" ||
      !rawMode ||
      !supportedRouteModes.has(rawMode)
    ) {
      skipped += 1;
      continue;
    }

    const externalId = `relation/${element.id}`;
    const reference = normalizedOptionalTag(tags.ref, 120);
    const mappedName = normalizedOptionalTag(tags.name, 180);
    const name =
      mappedName || reference || `Unnamed mapped route (${externalId})`;
    const stops = (element.members ?? [])
      .filter(isStopMember)
      .map((member, index) => {
        const memberExternalId = `${member.type}/${member.ref}`;
        const memberElement = elementsByExternalId.get(memberExternalId);

        return {
          sourceExternalId: memberExternalId,
          rawRole: normalizedOptionalTag(member.role, 80),
          mappedName: normalizedOptionalTag(memberElement?.tags?.name, 180),
          position: index + 1,
        };
      });

    candidates.push({
      externalId,
      sourceUrl: `https://www.openstreetmap.org/${externalId}`,
      city,
      name: name.slice(0, 180),
      rawMode,
      operator: normalizedOptionalTag(tags.operator, 160),
      reference,
      originName: normalizedOptionalTag(tags.from, 180),
      destinationName: normalizedOptionalTag(tags.to, 180),
      via: normalizedOptionalTag(tags.via, 180),
      rawTags: tags,
      stops,
    });
  }

  return { candidates, skipped };
}
