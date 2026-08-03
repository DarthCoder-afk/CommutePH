"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { LocationOption } from "@/components/location-search-input";
import { pickupSearchRadiusMeters } from "@/config/pickup-search";
import { findNearbyLocations } from "@/lib/geolocation/find-nearest-location";
import {
  getGeolocationFailureStatus,
  type GeolocationStatus,
} from "@/lib/geolocation/geolocation-status";
import type { OriginSelection } from "@/lib/geolocation/origin-selection";

type CurrentLocationOriginUpdate = {
  origin: Extract<OriginSelection, { type: "CURRENT_LOCATION" }>;
  sequence: number;
};

type CurrentPositionUpdate = {
  coordinates: {
    latitude: number;
    longitude: number;
  };
  sequence: number;
};

type SupportedLocationsState =
  | { status: "loading"; locations: readonly LocationOption[] }
  | { status: "ready"; locations: readonly LocationOption[] }
  | { status: "error"; locations: readonly LocationOption[] };

type LocationSearchResponse = {
  data: LocationOption[];
};

export type PickupSearchStatus =
  "idle" | "loading" | "ready" | "empty" | "error";

type CurrentLocationOriginContextValue = {
  currentLocationOrigin: CurrentLocationOriginUpdate | null;
  currentPosition: CurrentPositionUpdate | null;
  geolocationStatus: GeolocationStatus;
  requestCurrentLocation: () => void;
  clearCurrentLocationOrigin: () => void;
  locateOnMap: () => void;
  activeSupportedLocations: readonly LocationOption[];
  supportedLocationsStatus: SupportedLocationsState["status"];
  nearbyPickupCandidates: ReturnType<
    typeof findNearbyLocations<LocationOption>
  >;
  selectedPickupCandidate:
    ReturnType<typeof findNearbyLocations<LocationOption>>[number] | null;
  selectPickupCandidate: (locationId: string) => void;
  pickupSearchStatus: PickupSearchStatus;
  pickupSearchRadiusMeters: number;
};

const CurrentLocationOriginContext =
  createContext<CurrentLocationOriginContextValue | null>(null);

export function CurrentLocationOriginProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [currentLocationOrigin, setCurrentLocationOrigin] =
    useState<CurrentLocationOriginUpdate | null>(null);
  const [currentPosition, setCurrentPosition] =
    useState<CurrentPositionUpdate | null>(null);
  const [geolocationStatus, setGeolocationStatus] =
    useState<GeolocationStatus>("idle");
  const [supportedLocations, setSupportedLocations] =
    useState<SupportedLocationsState>({
      status: "loading",
      locations: [],
    });
  const geolocationRequestRef = useRef(0);
  const [selectedPickupLocationId, setSelectedPickupLocationId] = useState<
    string | null
  >(null);

  const requestDeviceLocation = useCallback((selectAsOrigin: boolean) => {
    if (!("geolocation" in navigator)) {
      setGeolocationStatus("unsupported");
      return;
    }

    const requestId = geolocationRequestRef.current + 1;

    geolocationRequestRef.current = requestId;
    setGeolocationStatus("requesting");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (geolocationRequestRef.current !== requestId) {
          return;
        }

        const longitude = position.coords.longitude;
        const latitude = position.coords.latitude;

        if (
          !Number.isFinite(longitude) ||
          !Number.isFinite(latitude) ||
          longitude < -180 ||
          longitude > 180 ||
          latitude < -90 ||
          latitude > 90
        ) {
          setGeolocationStatus("position-unavailable");
          return;
        }

        setCurrentPosition((current) => ({
          coordinates: { latitude, longitude },
          sequence: (current?.sequence ?? 0) + 1,
        }));

        if (selectAsOrigin) {
          setCurrentLocationOrigin((current) => ({
            origin: {
              type: "CURRENT_LOCATION",
              latitude,
              longitude,
            },
            sequence: (current?.sequence ?? 0) + 1,
          }));
        }

        setGeolocationStatus("success");
      },
      (error) => {
        if (geolocationRequestRef.current !== requestId) {
          return;
        }

        setGeolocationStatus(getGeolocationFailureStatus(error.code));
      },
      {
        enableHighAccuracy: false,
        maximumAge: 60_000,
        timeout: 10_000,
      },
    );
  }, []);

  const requestCurrentLocation = useCallback(() => {
    requestDeviceLocation(true);
  }, [requestDeviceLocation]);

  const clearCurrentLocationOrigin = useCallback(() => {
    setCurrentLocationOrigin(null);
  }, []);

  const locateOnMap = useCallback(() => {
    requestDeviceLocation(false);
  }, [requestDeviceLocation]);

  const nearbyPickupCandidates = useMemo(() => {
    if (!currentLocationOrigin || supportedLocations.status !== "ready") {
      return [];
    }

    return findNearbyLocations(
      currentLocationOrigin.origin,
      supportedLocations.locations,
      pickupSearchRadiusMeters,
    );
  }, [currentLocationOrigin, supportedLocations]);

  const pickupSearchStatus: PickupSearchStatus = !currentLocationOrigin
    ? "idle"
    : supportedLocations.status === "loading"
      ? "loading"
      : supportedLocations.status === "error"
        ? "error"
        : nearbyPickupCandidates.length > 0
          ? "ready"
          : "empty";

  const selectedPickupCandidate = useMemo(
    () =>
      nearbyPickupCandidates.find(
        (candidate) => candidate.location.id === selectedPickupLocationId,
      ) ??
      nearbyPickupCandidates[0] ??
      null,
    [nearbyPickupCandidates, selectedPickupLocationId],
  );

  const selectPickupCandidate = useCallback((locationId: string) => {
    setSelectedPickupLocationId(locationId);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const loadSupportedLocations = async () => {
      try {
        const response = await fetch("/api/locations", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            `Location loading failed with status ${response.status}.`,
          );
        }

        const payload = (await response.json()) as LocationSearchResponse;

        if (!Array.isArray(payload.data)) {
          throw new Error(
            "The locations endpoint returned an invalid response.",
          );
        }

        setSupportedLocations({ status: "ready", locations: payload.data });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error("Failed to load supported locations:", error);
        setSupportedLocations({ status: "error", locations: [] });
      }
    };

    void loadSupportedLocations();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    return () => {
      geolocationRequestRef.current += 1;
    };
  }, []);

  const value = useMemo(
    () => ({
      currentLocationOrigin,
      currentPosition,
      geolocationStatus,
      requestCurrentLocation,
      clearCurrentLocationOrigin,
      locateOnMap,
      activeSupportedLocations: supportedLocations.locations,
      supportedLocationsStatus: supportedLocations.status,
      nearbyPickupCandidates,
      selectedPickupCandidate,
      selectPickupCandidate,
      pickupSearchStatus,
      pickupSearchRadiusMeters,
    }),
    [
      currentLocationOrigin,
      currentPosition,
      geolocationStatus,
      requestCurrentLocation,
      clearCurrentLocationOrigin,
      locateOnMap,
      supportedLocations,
      nearbyPickupCandidates,
      selectedPickupCandidate,
      selectPickupCandidate,
      pickupSearchStatus,
    ],
  );

  return (
    <CurrentLocationOriginContext.Provider value={value}>
      {children}
    </CurrentLocationOriginContext.Provider>
  );
}

export function useCurrentLocationOrigin() {
  const context = useContext(CurrentLocationOriginContext);

  if (!context) {
    throw new Error(
      "useCurrentLocationOrigin must be used inside CurrentLocationOriginProvider.",
    );
  }

  return context;
}
