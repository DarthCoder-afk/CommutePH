"use client";

import { useEffect, useMemo, useState } from "react";

import type { NearbySupportedLocation } from "@/lib/locations/nearby-supported-location";
import type { PlaceSearchOption } from "@/lib/locations/search-location-option";

type ResolutionStatus = "idle" | "loading" | "ready" | "empty" | "error";

type NearbyLocationsResponse = {
  data: NearbySupportedLocation[];
};

function isNearbySupportedLocation(
  value: unknown,
): value is NearbySupportedLocation {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<NearbySupportedLocation>;
  const location = candidate.location;

  return (
    Boolean(location) &&
    typeof location?.id === "string" &&
    typeof location.name === "string" &&
    typeof location.slug === "string" &&
    typeof location.longitude === "number" &&
    Number.isFinite(location.longitude) &&
    typeof location.latitude === "number" &&
    Number.isFinite(location.latitude) &&
    typeof candidate.distanceMeters === "number" &&
    Number.isFinite(candidate.distanceMeters) &&
    candidate.distanceMeters >= 0
  );
}

export function useNearbySupportedLocations(
  place: PlaceSearchOption | null,
  radiusMeters: number,
) {
  const [status, setStatus] = useState<ResolutionStatus>("idle");
  const [activePlaceId, setActivePlaceId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<NearbySupportedLocation[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!place) {
      return;
    }

    const controller = new AbortController();

    const loadNearbyLocations = async () => {
      setActivePlaceId(place.id);
      setStatus("loading");
      setCandidates([]);
      setSelectedLocationId(null);

      try {
        const searchParams = new URLSearchParams({
          longitude: String(place.longitude),
          latitude: String(place.latitude),
          radiusMeters: String(radiusMeters),
          limit: "5",
        });
        const response = await fetch(
          `/api/locations/nearby?${searchParams.toString()}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error(
            `Nearby supported-location search failed with status ${response.status}.`,
          );
        }

        const payload = (await response.json()) as NearbyLocationsResponse;

        if (!Array.isArray(payload.data)) {
          throw new Error(
            "The nearby supported-location endpoint returned an invalid response.",
          );
        }

        const validCandidates = payload.data.filter(isNearbySupportedLocation);

        setCandidates(validCandidates);
        setSelectedLocationId(validCandidates[0]?.location.id ?? null);
        setStatus(validCandidates.length > 0 ? "ready" : "empty");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error("Failed to resolve a general place:", error);
        setCandidates([]);
        setSelectedLocationId(null);
        setStatus("error");
      }
    };

    void loadNearbyLocations();

    return () => {
      controller.abort();
    };
  }, [place, radiusMeters]);

  const selectedCandidate = useMemo(
    () =>
      candidates.find(
        (candidate) => candidate.location.id === selectedLocationId,
      ) ?? null,
    [candidates, selectedLocationId],
  );
  const isCurrentPlace = Boolean(place && activePlaceId === place.id);

  return {
    candidates: isCurrentPlace ? candidates : [],
    selectedCandidate: isCurrentPlace ? selectedCandidate : null,
    selectCandidate: setSelectedLocationId,
    status: !place ? ("idle" as const) : isCurrentPlace ? status : "loading",
  };
}
