const transportModes = [
  "jeepney",
  "modern_jeepney",
  "city_bus",
  "bgc_bus",
] as const;

type TransportMode = (typeof transportModes)[number];

export type RouteCandidatePromotionInput = {
  sourceType: "openstreetmap" | "gtfs";
  sourceExternalId: string;
  slug: string;
  name: string;
  mode: TransportMode;
  operator: string | null;
  signboard: string;
  description: string;
  stops: Array<{
    candidatePosition: number;
    canBoard: boolean;
    canAlight: boolean;
    pickupLandmark: string | null;
    dropoffLandmark: string | null;
  }>;
  schedule: {
    serviceDays: string;
    operatingHours: string;
    publicNotes: string | null;
  };
  promotedBy: string;
  notes: string;
  evidenceUrl: string | null;
};

function requiredString(value: unknown, label: string, maximum: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }

  if (value.trim().length > maximum) {
    throw new Error(`${label} must contain at most ${maximum} characters.`);
  }

  return value.trim();
}

function optionalString(value: unknown, label: string, maximum: number) {
  if (value === null || value === undefined || value === "") return null;

  return requiredString(value, label, maximum);
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function validateRouteCandidatePromotion(
  value: unknown,
): RouteCandidatePromotionInput {
  if (!value || typeof value !== "object") {
    throw new Error("The promotion file must contain a JSON object.");
  }

  const input = value as Record<string, unknown>;
  if (input.sourceType !== "openstreetmap" && input.sourceType !== "gtfs") {
    throw new Error('sourceType must be either "openstreetmap" or "gtfs".');
  }
  const sourceExternalId = requiredString(
    input.sourceExternalId,
    "sourceExternalId",
    200,
  );
  const slug = requiredString(input.slug, "slug", 180);

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("slug must use lowercase words separated by hyphens.");
  }

  if (
    typeof input.mode !== "string" ||
    !transportModes.includes(input.mode as TransportMode)
  ) {
    throw new Error(`mode must be one of: ${transportModes.join(", ")}.`);
  }

  if (!Array.isArray(input.stops) || input.stops.length < 2) {
    throw new Error("stops must contain at least two reviewed route stops.");
  }

  const selectedPositions = new Set<number>();
  let previousCandidatePosition = 0;
  const stops = input.stops.map((value, index) => {
    if (!value || typeof value !== "object") {
      throw new Error(`Stop ${index + 1} must be an object.`);
    }

    const stop = value as Record<string, unknown>;
    const candidatePosition = stop.candidatePosition;

    if (
      !Number.isInteger(candidatePosition) ||
      (candidatePosition as number) < 1 ||
      selectedPositions.has(candidatePosition as number)
    ) {
      throw new Error(`Stop ${index + 1} has an invalid candidatePosition.`);
    }
    if ((candidatePosition as number) <= previousCandidatePosition) {
      throw new Error("Selected candidate stop positions must be increasing.");
    }
    if (
      typeof stop.canBoard !== "boolean" ||
      typeof stop.canAlight !== "boolean"
    ) {
      throw new Error(`Stop ${index + 1} requires boolean access flags.`);
    }
    if (!stop.canBoard && !stop.canAlight) {
      throw new Error(`Stop ${index + 1} must allow boarding or alighting.`);
    }

    selectedPositions.add(candidatePosition as number);
    previousCandidatePosition = candidatePosition as number;

    return {
      candidatePosition: candidatePosition as number,
      canBoard: stop.canBoard,
      canAlight: stop.canAlight,
      pickupLandmark: optionalString(
        stop.pickupLandmark,
        `Stop ${index + 1} pickupLandmark`,
        240,
      ),
      dropoffLandmark: optionalString(
        stop.dropoffLandmark,
        `Stop ${index + 1} dropoffLandmark`,
        240,
      ),
    };
  });

  if (!input.schedule || typeof input.schedule !== "object") {
    throw new Error("schedule is required.");
  }

  const schedule = input.schedule as Record<string, unknown>;
  const promotedBy = requiredString(input.promotedBy, "promotedBy", 120);
  const notes = requiredString(input.notes, "notes", 5_000);

  if (promotedBy.length < 2) {
    throw new Error("promotedBy must contain at least two characters.");
  }
  if (notes.length < 20) {
    throw new Error("notes must contain at least 20 characters.");
  }

  const evidenceUrl = optionalString(input.evidenceUrl, "evidenceUrl", 2_000);

  if (evidenceUrl && !isHttpUrl(evidenceUrl)) {
    throw new Error("evidenceUrl must be a valid HTTP URL.");
  }

  return {
    sourceType: input.sourceType,
    sourceExternalId,
    slug,
    name: requiredString(input.name, "name", 180),
    mode: input.mode as TransportMode,
    operator: optionalString(input.operator, "operator", 160),
    signboard: requiredString(input.signboard, "signboard", 200),
    description: requiredString(input.description, "description", 5_000),
    stops,
    schedule: {
      serviceDays: requiredString(
        schedule.serviceDays,
        "schedule.serviceDays",
        100,
      ),
      operatingHours: requiredString(
        schedule.operatingHours,
        "schedule.operatingHours",
        160,
      ),
      publicNotes: optionalString(
        schedule.publicNotes,
        "schedule.publicNotes",
        5_000,
      ),
    },
    promotedBy,
    notes,
    evidenceUrl,
  };
}
