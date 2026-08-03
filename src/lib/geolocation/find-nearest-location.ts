export type Coordinates = {
  longitude: number;
  latitude: number;
};

export type NearbyLocation<T extends Coordinates> = {
  location: T;
  distanceMeters: number;
};

const earthRadiusMeters = 6_371_000;

function isValidCoordinates(coordinates: Coordinates) {
  return (
    Number.isFinite(coordinates.longitude) &&
    Number.isFinite(coordinates.latitude) &&
    coordinates.longitude >= -180 &&
    coordinates.longitude <= 180 &&
    coordinates.latitude >= -90 &&
    coordinates.latitude <= 90
  );
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function getAngularDistance(first: Coordinates, second: Coordinates) {
  const firstLatitude = toRadians(first.latitude);
  const secondLatitude = toRadians(second.latitude);
  const latitudeDifference = secondLatitude - firstLatitude;
  const longitudeDifference = toRadians(second.longitude - first.longitude);

  return (
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDifference / 2) ** 2
  );
}

export function getDistanceMeters(
  first: Coordinates,
  second: Coordinates,
): number | null {
  if (!isValidCoordinates(first) || !isValidCoordinates(second)) {
    return null;
  }

  const angularDistance = Math.min(getAngularDistance(first, second), 1);
  const centralAngle =
    2 * Math.atan2(Math.sqrt(angularDistance), Math.sqrt(1 - angularDistance));

  return earthRadiusMeters * centralAngle;
}

export function findNearbyLocations<T extends Coordinates>(
  position: Coordinates,
  candidates: readonly T[],
  maximumRadiusMeters: number,
): NearbyLocation<T>[] {
  if (
    !isValidCoordinates(position) ||
    !Number.isFinite(maximumRadiusMeters) ||
    maximumRadiusMeters <= 0
  ) {
    return [];
  }

  return candidates
    .flatMap((location) => {
      const distanceMeters = getDistanceMeters(position, location);

      return distanceMeters !== null && distanceMeters <= maximumRadiusMeters
        ? [{ location, distanceMeters }]
        : [];
    })
    .sort((first, second) => first.distanceMeters - second.distanceMeters);
}

export function findNearestLocation<T extends Coordinates>(
  position: Coordinates,
  candidates: readonly T[],
): T | null {
  if (!isValidCoordinates(position)) {
    return null;
  }

  let nearestLocation: T | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (!isValidCoordinates(candidate)) {
      continue;
    }

    const distance = getDistanceMeters(position, candidate);

    if (distance === null) {
      continue;
    }

    if (distance < nearestDistance) {
      nearestLocation = candidate;
      nearestDistance = distance;
    }
  }

  return nearestLocation;
}
