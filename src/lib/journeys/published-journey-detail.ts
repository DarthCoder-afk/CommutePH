import type { AssembledJourneySegment } from "@/server/journeys/assemble-journey-segments";

import type { JourneySummary } from "./journey-summary";
import type { PublishedJourneyMap } from "./build-current-location-journey-map-overlay";

export type PublishedJourneyDetail = Omit<
  JourneySummary,
  "origin" | "destination"
> & {
  origin: JourneySummary["origin"] & {
    longitude: number;
    latitude: number;
  };
  destination: JourneySummary["destination"] & {
    longitude: number;
    latitude: number;
  };
  segments: AssembledJourneySegment[];
  map: PublishedJourneyMap;
};
