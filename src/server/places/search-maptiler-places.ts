import "server-only";

import {
  metroManilaBoundingBox,
  placeSearchLimit,
} from "@/config/place-search";
import { parseMapTilerPlaces } from "@/lib/locations/parse-maptiler-places";

export async function searchMapTilerPlaces({
  apiKey,
  query,
  signal,
  fetchImplementation = fetch,
}: {
  apiKey: string;
  query: string;
  signal?: AbortSignal;
  fetchImplementation?: typeof fetch;
}) {
  const encodedQuery = encodeURIComponent(query.trim());
  const searchParams = new URLSearchParams({
    key: apiKey,
    bbox: metroManilaBoundingBox.join(","),
    country: "ph",
    language: "en",
    limit: String(placeSearchLimit),
    autocomplete: "true",
  });
  const response = await fetchImplementation(
    `https://api.maptiler.com/geocoding/${encodedQuery}.json?${searchParams.toString()}`,
    {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
      signal,
    },
  );

  if (!response.ok) {
    throw new Error(`Place search failed with status ${response.status}.`);
  }

  return parseMapTilerPlaces(await response.json());
}
