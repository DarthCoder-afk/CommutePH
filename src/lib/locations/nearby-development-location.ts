import type { SupportedLocationOption } from "./search-location-option";

export type NearbyDevelopmentLocation = {
  location: SupportedLocationOption & {
    verificationStatus: "unverified" | "outdated";
    sourceType: "openstreetmap" | "gtfs";
  };
  distanceMeters: number;
};
