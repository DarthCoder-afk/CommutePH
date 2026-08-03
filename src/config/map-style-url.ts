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

export function resolveMapStyle(
  configuredValue: string | undefined,
  nodeEnvironment: string | undefined,
): string | StyleSpecification | null {
  const configuredUrl = configuredValue?.trim();

  if (configuredUrl) {
    return configuredUrl;
  }

  return nodeEnvironment === "development" ? developmentMapStyle : null;
}

export const publicMapStyle = resolveMapStyle(
  process.env.NEXT_PUBLIC_MAP_STYLE_URL,
  process.env.NODE_ENV,
);
