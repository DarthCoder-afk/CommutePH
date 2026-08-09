const outcomes = ["confirmed", "not_found", "needs_follow_up"] as const;
const transportModes = [
  "jeepney",
  "modern_jeepney",
  "city_bus",
  "bgc_bus",
] as const;

type RouteObservationInput = {
  routeSlug?: unknown;
  outcome?: unknown;
  observedAt?: unknown;
  observerLabel?: unknown;
  notes?: unknown;
  observedName?: unknown;
  observedMode?: unknown;
  observedOperator?: unknown;
  observedSignboard?: unknown;
  serviceDays?: unknown;
  operatingHours?: unknown;
  fareMinCentavos?: unknown;
  fareMaxCentavos?: unknown;
  paymentMethod?: unknown;
  evidenceUrl?: unknown;
  stops?: unknown;
};

type StopInput = {
  position?: unknown;
  locationSlug?: unknown;
  canBoard?: unknown;
  canAlight?: unknown;
  notes?: unknown;
};

function optionalString(value: unknown, field: string) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string when provided.`);
  }
  return value.trim() || null;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateRouteFieldObservation(
  value: unknown,
  currentTime = new Date(),
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The route observation file must contain a JSON object.");
  }

  const input = value as RouteObservationInput;
  const routeSlug = optionalString(input.routeSlug, "routeSlug");
  const observerLabel = optionalString(input.observerLabel, "observerLabel");
  const notes = optionalString(input.notes, "notes");

  if (!routeSlug) throw new Error("routeSlug is required.");
  if (
    typeof input.outcome !== "string" ||
    !outcomes.includes(input.outcome as (typeof outcomes)[number])
  ) {
    throw new Error(`outcome must be one of: ${outcomes.join(", ")}.`);
  }
  if (typeof input.observedAt !== "string") {
    throw new Error("observedAt must be an exact ISO date-time string.");
  }

  const observedAt = new Date(input.observedAt);
  if (
    Number.isNaN(observedAt.getTime()) ||
    observedAt.toISOString() !== input.observedAt
  ) {
    throw new Error("observedAt must be an exact ISO date-time string.");
  }
  if (observedAt > currentTime) {
    throw new Error("observedAt cannot be in the future.");
  }
  if (!observerLabel || observerLabel.length < 2) {
    throw new Error("observerLabel must contain at least 2 characters.");
  }
  if (!notes || notes.length < 20) {
    throw new Error("notes must contain at least 20 characters.");
  }

  const observedName = optionalString(input.observedName, "observedName");
  const observedOperator = optionalString(
    input.observedOperator,
    "observedOperator",
  );
  const observedSignboard = optionalString(
    input.observedSignboard,
    "observedSignboard",
  );
  const serviceDays = optionalString(input.serviceDays, "serviceDays");
  const operatingHours = optionalString(input.operatingHours, "operatingHours");
  const paymentMethod = optionalString(input.paymentMethod, "paymentMethod");
  const evidenceUrl = optionalString(input.evidenceUrl, "evidenceUrl");
  const observedMode = optionalString(input.observedMode, "observedMode");

  if (
    observedMode &&
    !transportModes.includes(observedMode as (typeof transportModes)[number])
  ) {
    throw new Error(
      `observedMode must be one of: ${transportModes.join(", ")}.`,
    );
  }
  if (evidenceUrl && !isHttpUrl(evidenceUrl)) {
    throw new Error("evidenceUrl must be an HTTP or HTTPS URL when provided.");
  }

  const faresProvided =
    input.fareMinCentavos !== undefined || input.fareMaxCentavos !== undefined;
  let fareMinCentavos: number | null = null;
  let fareMaxCentavos: number | null = null;

  if (faresProvided) {
    if (
      !Number.isInteger(input.fareMinCentavos) ||
      !Number.isInteger(input.fareMaxCentavos) ||
      (input.fareMinCentavos as number) < 0 ||
      (input.fareMaxCentavos as number) < (input.fareMinCentavos as number)
    ) {
      throw new Error(
        "fareMinCentavos and fareMaxCentavos must be nonnegative integers forming a valid range.",
      );
    }
    fareMinCentavos = input.fareMinCentavos as number;
    fareMaxCentavos = input.fareMaxCentavos as number;
  }

  if (input.stops !== undefined && !Array.isArray(input.stops)) {
    throw new Error("stops must be an array when provided.");
  }

  const stops = ((input.stops as unknown[] | undefined) ?? []).map(
    (rawStop, index) => {
      if (!rawStop || typeof rawStop !== "object" || Array.isArray(rawStop)) {
        throw new Error(`Stop ${index + 1} must be an object.`);
      }
      const stop = rawStop as StopInput;
      const locationSlug = optionalString(
        stop.locationSlug,
        `Stop ${index + 1} locationSlug`,
      );
      const stopNotes = optionalString(stop.notes, `Stop ${index + 1} notes`);

      if (!Number.isInteger(stop.position) || (stop.position as number) < 1) {
        throw new Error(`Stop ${index + 1} needs a positive integer position.`);
      }
      if (stop.position !== index + 1) {
        throw new Error("Stop positions must be ordered and gapless from 1.");
      }
      if (!locationSlug) {
        throw new Error(`Stop ${index + 1} needs a locationSlug.`);
      }
      if (
        typeof stop.canBoard !== "boolean" ||
        typeof stop.canAlight !== "boolean"
      ) {
        throw new Error(
          `Stop ${index + 1} needs boolean boarding and alighting values.`,
        );
      }
      if (!stop.canBoard && !stop.canAlight) {
        throw new Error(`Stop ${index + 1} must allow boarding or alighting.`);
      }

      return {
        position: stop.position as number,
        locationSlug,
        canBoard: stop.canBoard,
        canAlight: stop.canAlight,
        notes: stopNotes,
      };
    },
  );

  if (new Set(stops.map((stop) => stop.locationSlug)).size !== stops.length) {
    throw new Error("A confirmed route observation cannot repeat a location.");
  }

  if (input.outcome === "confirmed") {
    if (
      !observedName ||
      !observedMode ||
      !observedSignboard ||
      !serviceDays ||
      !operatingHours ||
      fareMinCentavos === null ||
      fareMaxCentavos === null ||
      !paymentMethod ||
      stops.length < 2
    ) {
      throw new Error(
        "A confirmed route observation requires identity, signboard, schedule, fare, payment method, and at least two ordered stops.",
      );
    }
  }

  return {
    routeSlug,
    outcome: input.outcome as (typeof outcomes)[number],
    observedAt,
    observerLabel,
    notes,
    observedName,
    observedMode: observedMode as (typeof transportModes)[number] | null,
    observedOperator,
    observedSignboard,
    serviceDays,
    operatingHours,
    fareMinCentavos,
    fareMaxCentavos,
    paymentMethod,
    evidenceUrl,
    stops,
  };
}
