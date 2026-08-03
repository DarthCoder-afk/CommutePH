export type Coordinates = {
  longitude: number;
  latitude: number;
};

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

    const distance = getAngularDistance(position, candidate);

    if (distance < nearestDistance) {
      nearestLocation = candidate;
      nearestDistance = distance;
    }
  }

  return nearestLocation;
}
