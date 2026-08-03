export const defaultPickupSearchRadiusMeters = 2_000;

const minimumPickupSearchRadiusMeters = 100;
const maximumPickupSearchRadiusMeters = 10_000;

export function resolvePickupSearchRadiusMeters(configuredValue?: string) {
  if (!configuredValue?.trim()) {
    return defaultPickupSearchRadiusMeters;
  }

  const parsedValue = Number(configuredValue);

  if (
    !Number.isInteger(parsedValue) ||
    parsedValue < minimumPickupSearchRadiusMeters ||
    parsedValue > maximumPickupSearchRadiusMeters
  ) {
    return defaultPickupSearchRadiusMeters;
  }

  return parsedValue;
}

export const pickupSearchRadiusMeters = resolvePickupSearchRadiusMeters(
  process.env.NEXT_PUBLIC_PICKUP_SEARCH_RADIUS_METERS,
);
