export const metroManilaBoundingBox = [
  120.906, 14.349, 121.135, 14.785,
] as const;

export const placeSearchMinLength = 2;
export const placeSearchMaxLength = 80;
export const placeSearchLimit = 6;

export function getMapTilerApiKey() {
  const value = process.env.MAPTILER_API_KEY?.trim();

  return value || null;
}
