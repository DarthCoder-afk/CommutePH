import type { LocationOption } from "@/components/location-search-input";

export type OriginSelection =
  | {
      type: "CURATED_LOCATION";
      location: LocationOption;
    }
  | {
      type: "CURRENT_LOCATION";
      latitude: number;
      longitude: number;
    };
