export function formatApproximateDistance(distanceMeters: number) {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
    return "Unknown distance";
  }

  if (distanceMeters < 1_000) {
    const roundedMeters = Math.max(10, Math.round(distanceMeters / 10) * 10);

    return `About ${roundedMeters} m away`;
  }

  return `About ${(distanceMeters / 1_000).toFixed(1)} km away`;
}
