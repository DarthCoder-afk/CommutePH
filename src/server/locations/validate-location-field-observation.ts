export const locationFieldObservationOutcomes = [
  "confirmed",
  "not_found",
  "needs_follow_up",
] as const;

export const locationKinds = [
  "area",
  "landmark",
  "station",
  "terminal",
  "stop",
  "entrance",
] as const;

type LocationFieldObservationInput = {
  locationSlug?: unknown;
  outcome?: unknown;
  observedAt?: unknown;
  observerLabel?: unknown;
  notes?: unknown;
  observedName?: unknown;
  observedKind?: unknown;
  longitude?: unknown;
  latitude?: unknown;
  accuracyMeters?: unknown;
  evidenceUrl?: unknown;
};

function optionalTrimmedString(value: unknown, field: string) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`${field} must be a string when provided.`);
  }

  return value.trim() || null;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function validateLocationFieldObservation(
  value: unknown,
  currentTime = new Date(),
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The observation file must contain a JSON object.");
  }

  const input = value as LocationFieldObservationInput;
  const locationSlug = optionalTrimmedString(
    input.locationSlug,
    "locationSlug",
  );
  const observerLabel = optionalTrimmedString(
    input.observerLabel,
    "observerLabel",
  );
  const notes = optionalTrimmedString(input.notes, "notes");
  const observedName = optionalTrimmedString(
    input.observedName,
    "observedName",
  );
  const evidenceUrl = optionalTrimmedString(input.evidenceUrl, "evidenceUrl");

  if (!locationSlug) {
    throw new Error("locationSlug is required.");
  }

  if (
    typeof input.outcome !== "string" ||
    !locationFieldObservationOutcomes.includes(
      input.outcome as (typeof locationFieldObservationOutcomes)[number],
    )
  ) {
    throw new Error(
      `outcome must be one of: ${locationFieldObservationOutcomes.join(", ")}.`,
    );
  }

  if (typeof input.observedAt !== "string") {
    throw new Error("observedAt must be an ISO date-time string.");
  }

  const observedAt = new Date(input.observedAt);

  if (
    Number.isNaN(observedAt.getTime()) ||
    observedAt.toISOString() !== input.observedAt
  ) {
    throw new Error(
      "observedAt must be an exact ISO date-time such as 2026-08-09T08:30:00.000Z.",
    );
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

  const coordinatesProvided =
    input.longitude !== undefined ||
    input.latitude !== undefined ||
    input.accuracyMeters !== undefined;
  let longitude: number | null = null;
  let latitude: number | null = null;
  let accuracyMeters: number | null = null;

  if (coordinatesProvided) {
    if (
      typeof input.longitude !== "number" ||
      !Number.isFinite(input.longitude) ||
      input.longitude < -180 ||
      input.longitude > 180
    ) {
      throw new Error("longitude must be a number between -180 and 180.");
    }

    if (
      typeof input.latitude !== "number" ||
      !Number.isFinite(input.latitude) ||
      input.latitude < -90 ||
      input.latitude > 90
    ) {
      throw new Error("latitude must be a number between -90 and 90.");
    }

    if (
      typeof input.accuracyMeters !== "number" ||
      !Number.isInteger(input.accuracyMeters) ||
      input.accuracyMeters < 1 ||
      input.accuracyMeters > 10000
    ) {
      throw new Error(
        "accuracyMeters must be an integer between 1 and 10000 when coordinates are supplied.",
      );
    }

    longitude = input.longitude;
    latitude = input.latitude;
    accuracyMeters = input.accuracyMeters;
  }

  const observedKind = optionalTrimmedString(
    input.observedKind,
    "observedKind",
  );

  if (
    observedKind &&
    !locationKinds.includes(observedKind as (typeof locationKinds)[number])
  ) {
    throw new Error(
      `observedKind must be one of: ${locationKinds.join(", ")}.`,
    );
  }

  if (input.outcome === "confirmed") {
    if (!observedName || !observedKind || longitude === null) {
      throw new Error(
        "A confirmed observation requires observedName, observedKind, longitude, latitude, and accuracyMeters.",
      );
    }
  }

  if (evidenceUrl && !isHttpUrl(evidenceUrl)) {
    throw new Error("evidenceUrl must be an HTTP or HTTPS URL when provided.");
  }

  return {
    locationSlug,
    outcome: input.outcome as (typeof locationFieldObservationOutcomes)[number],
    observedAt,
    observerLabel,
    notes,
    observedName,
    observedKind: observedKind as (typeof locationKinds)[number] | null,
    longitude,
    latitude,
    accuracyMeters,
    evidenceUrl,
  };
}
