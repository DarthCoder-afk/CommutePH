import { getDistanceMeters } from "@/lib/geolocation/find-nearest-location";

export type DuplicateCandidateLocation = {
  id: string;
  name: string;
  slug: string;
  longitude: number;
  latitude: number;
};

export type LikelyLocationDuplicate = {
  first: DuplicateCandidateLocation;
  second: DuplicateCandidateLocation;
  distanceMeters: number;
  reason: "same_normalized_name" | "very_close_proximity";
};

const sameNameMaximumDistanceMeters = 150;
const veryCloseMaximumDistanceMeters = 25;

function normalizeLocationName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findLikelyLocationDuplicates(
  locations: readonly DuplicateCandidateLocation[],
) {
  const duplicates: LikelyLocationDuplicate[] = [];

  for (const [firstIndex, first] of locations.entries()) {
    const normalizedFirstName = normalizeLocationName(first.name);

    for (const second of locations.slice(firstIndex + 1)) {
      const distanceMeters = getDistanceMeters(first, second);

      if (distanceMeters === null) {
        continue;
      }

      const namesMatch =
        normalizedFirstName.length > 0 &&
        normalizedFirstName === normalizeLocationName(second.name);

      if (namesMatch && distanceMeters <= sameNameMaximumDistanceMeters) {
        duplicates.push({
          first,
          second,
          distanceMeters,
          reason: "same_normalized_name",
        });
      } else if (distanceMeters <= veryCloseMaximumDistanceMeters) {
        duplicates.push({
          first,
          second,
          distanceMeters,
          reason: "very_close_proximity",
        });
      }
    }
  }

  return duplicates.sort(
    (first, second) => first.distanceMeters - second.distanceMeters,
  );
}
