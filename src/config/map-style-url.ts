export const developmentMapStyleUrl =
  "https://demotiles.maplibre.org/style.json";

export function resolveMapStyleUrl(
  configuredValue: string | undefined,
  nodeEnvironment: string | undefined,
) {
  const configuredUrl = configuredValue?.trim();

  if (configuredUrl) {
    return configuredUrl;
  }

  return nodeEnvironment === "development" ? developmentMapStyleUrl : null;
}

export const publicMapStyleUrl = resolveMapStyleUrl(
  process.env.NEXT_PUBLIC_MAP_STYLE_URL,
  process.env.NODE_ENV,
);
