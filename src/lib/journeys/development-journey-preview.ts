import type { JourneyMarkerFeatureCollection } from "@/server/journeys/build-journey-map-geojson";

export type DevelopmentJourneyPreviewSegment =
  | {
      id: string;
      position: number;
      kind: "walking";
      summary: string;
      from: { name: string };
      to: { name: string };
    }
  | {
      id: string;
      position: number;
      kind: "transit";
      summary: string;
      route: {
        name: string;
        mode: "jeepney" | "modern_jeepney" | "city_bus" | "bgc_bus";
        operator: string | null;
        signboard: string | null;
      };
      boardingStop: { name: string };
      alightingStop: { name: string };
    };

export type DevelopmentJourneyPreview = {
  previewType: "development";
  id: string;
  slug: string;
  title: string;
  summary: string;
  origin: { slug: string; name: string };
  destination: { slug: string; name: string };
  verificationStatus: "unverified";
  segments: DevelopmentJourneyPreviewSegment[];
  map: {
    markers: JourneyMarkerFeatureCollection;
    paths: {
      type: "FeatureCollection";
      features: {
        type: "Feature";
        id: string;
        geometry: {
          type: "LineString";
          coordinates: [number, number][];
        };
        properties: {
          segmentId: string;
          segmentPosition: number;
          kind: "walking" | "transit";
          provisional: true;
          source: "schematic_development_connector";
        };
      }[];
    };
  };
};

export function isDevelopmentJourneyPreview(
  value: unknown,
): value is DevelopmentJourneyPreview {
  return (
    typeof value === "object" &&
    value !== null &&
    "previewType" in value &&
    value.previewType === "development"
  );
}
