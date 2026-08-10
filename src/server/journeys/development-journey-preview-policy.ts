export function canExposeDevelopmentJourneyPreviews(
  environment = process.env.NODE_ENV,
) {
  return environment === "development";
}
