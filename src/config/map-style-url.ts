import type { StyleSpecification } from "maplibre-gl";

export const developmentMapStyle = {
  version: 8,
  sources: {
    openStreetMap: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "open-street-map",
      type: "raster",
      source: "openStreetMap",
    },
  ],
} satisfies StyleSpecification;

export function parsePublicMapStyleUrl(
  configuredValue: string | undefined,
  nodeEnvironment: string | undefined,
) {
  const configuredUrl = configuredValue?.trim();

  if (!configuredUrl) {
    if (nodeEnvironment === "production") {
      throw new Error(
        "NEXT_PUBLIC_MAP_STYLE_URL is required for a production build.",
      );
    }

    return null;
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(configuredUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_MAP_STYLE_URL must be a valid URL.");
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new Error(
      "NEXT_PUBLIC_MAP_STYLE_URL must use the https: or http: protocol.",
    );
  }

  return configuredUrl;
}

export function resolveMapStyle(
  configuredValue: string | undefined,
  nodeEnvironment: string | undefined,
): string | StyleSpecification | null {
  const configuredUrl = configuredValue?.trim();

  if (configuredUrl) {
    return parsePublicMapStyleUrl(configuredUrl, nodeEnvironment);
  }

  return nodeEnvironment === "development" ? developmentMapStyle : null;
}

export const publicMapStyle = resolveMapStyle(
  process.env.NEXT_PUBLIC_MAP_STYLE_URL,
  process.env.NODE_ENV,
);
