import type { PlaceSearchOption } from "./search-location-option";

type MapTilerFeature = {
  id?: unknown;
  text?: unknown;
  place_name?: unknown;
  center?: unknown;
  place_type?: unknown;
  context?: unknown;
};

type MapTilerContext = {
  id?: unknown;
  text?: unknown;
};

function isFiniteCoordinatePair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1]) &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    value[1] >= -90 &&
    value[1] <= 90
  );
}

function getContextText(feature: MapTilerFeature, prefix: string) {
  if (!Array.isArray(feature.context)) {
    return null;
  }

  const match = (feature.context as MapTilerContext[]).find(
    (item) =>
      typeof item.id === "string" &&
      item.id.startsWith(prefix) &&
      typeof item.text === "string",
  );

  return typeof match?.text === "string" ? match.text : null;
}

export function parseMapTilerPlaces(payload: unknown): PlaceSearchOption[] {
  if (!payload || typeof payload !== "object") {
    throw new Error("The place search provider returned an invalid response.");
  }

  const features = (payload as { features?: unknown }).features;

  if (!Array.isArray(features)) {
    throw new Error("The place search provider returned an invalid response.");
  }

  return features.flatMap((rawFeature, index) => {
    if (!rawFeature || typeof rawFeature !== "object") {
      return [];
    }

    const feature = rawFeature as MapTilerFeature;

    if (
      typeof feature.text !== "string" ||
      !feature.text.trim() ||
      typeof feature.place_name !== "string" ||
      !isFiniteCoordinatePair(feature.center)
    ) {
      return [];
    }

    const [longitude, latitude] = feature.center;
    const providerId =
      typeof feature.id === "string" && feature.id.trim()
        ? feature.id
        : `${longitude},${latitude},${index}`;
    const placeType = Array.isArray(feature.place_type)
      ? feature.place_type.find(
          (value): value is string => typeof value === "string",
        )
      : null;

    return [
      {
        id: `maptiler:${providerId}`,
        source: "place" as const,
        provider: "maptiler" as const,
        name: feature.text.trim(),
        label: feature.place_name.trim(),
        kind: placeType ?? "place",
        city:
          getContextText(feature, "municipality") ??
          getContextText(feature, "place"),
        area:
          getContextText(feature, "neighbourhood") ??
          getContextText(feature, "locality"),
        longitude,
        latitude,
      },
    ];
  });
}
