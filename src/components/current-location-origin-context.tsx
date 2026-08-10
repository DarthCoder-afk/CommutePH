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
import type { PlaceSearchOption } from "@/lib/locations/search-location-option";
import { pickupSearchRadiusMeters } from "@/config/pickup-search";
import { findNearbyLocations } from "@/lib/geolocation/find-nearest-location";
import {
  getGeolocationFailureStatus,
  type GeolocationStatus,
} from "@/lib/geolocation/geolocation-status";
import type { OriginSelection } from "@/lib/geolocation/origin-selection";
import type { JourneySummary } from "@/lib/journeys/journey-summary";
import {
  buildCurrentLocationJourneyMapOverlay,
  type CurrentLocationJourneyMapOverlay,
} from "@/lib/journeys/build-current-location-journey-map-overlay";
import type { CurrentLocationJourneyOption } from "@/lib/journeys/build-current-location-journey-options";
import type { DevelopmentJourneyPreview } from "@/lib/journeys/development-journey-preview";
import type { PublishedJourneyDetail } from "@/lib/journeys/published-journey-detail";
import {
  searchPickupJourneys,
  type PickupJourneyMatch,
} from "@/lib/journeys/search-pickup-journeys";

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

type JourneySearchResponse = {
  data: JourneySummary[];
};

type JourneyDetailResponse = {
  data: PublishedJourneyDetail;
};

export type PickupSearchStatus =
  "idle" | "loading" | "ready" | "empty" | "error";

export type PickupJourneySearchStatus =
  "idle" | "loading" | "ready" | "empty" | "error";

export type SelectedJourneyDetailStatus =
  "idle" | "loading" | "ready" | "error";

type NearbyPickupCandidate = ReturnType<
  typeof findNearbyLocations<LocationOption>
>[number];

type CurrentLocationOriginContextValue = {
  currentLocationOrigin: CurrentLocationOriginUpdate | null;
  currentPosition: CurrentPositionUpdate | null;
  geolocationStatus: GeolocationStatus;
  requestCurrentLocation: () => void;
  clearCurrentLocationOrigin: () => void;
  locateOnMap: () => void;
  selectedOriginPlace: PlaceSearchOption | null;
  selectedDestinationPlace: PlaceSearchOption | null;
  setSelectedOriginPlace: (place: PlaceSearchOption | null) => void;
  setSelectedDestinationPlace: (place: PlaceSearchOption | null) => void;
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
  setPickupDestination: (destination: LocationOption | null) => void;
  pickupJourneyMatches: PickupJourneyMatch<
    NearbyPickupCandidate,
    JourneySummary
  >[];
  pickupJourneySearchStatus: PickupJourneySearchStatus;
  selectedCurrentLocationJourneyOption: CurrentLocationJourneyOption | null;
  selectedCurrentLocationJourneyDetail: PublishedJourneyDetail | null;
  selectedCurrentLocationJourneyMap: CurrentLocationJourneyMapOverlay | null;
  selectedSearchJourneyPreviewMap: DevelopmentJourneyPreview["map"] | null;
  setSelectedSearchJourneyPreviewMap: (
    map: DevelopmentJourneyPreview["map"] | null,
  ) => void;
  selectedJourneyDetailStatus: SelectedJourneyDetailStatus;
  selectCurrentLocationJourneyOption: (
    option: CurrentLocationJourneyOption | null,
  ) => void;
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
  const [selectedOriginPlace, setSelectedOriginPlace] =
    useState<PlaceSearchOption | null>(null);
  const [selectedDestinationPlace, setSelectedDestinationPlace] =
    useState<PlaceSearchOption | null>(null);
  const [supportedLocations, setSupportedLocations] =
    useState<SupportedLocationsState>({
      status: "loading",
      locations: [],
    });
  const geolocationRequestRef = useRef(0);
  const [selectedPickupLocationId, setSelectedPickupLocationId] = useState<
    string | null
  >(null);
  const [pickupDestination, setPickupDestinationState] =
    useState<LocationOption | null>(null);
  const [pickupJourneyMatches, setPickupJourneyMatches] = useState<
    PickupJourneyMatch<NearbyPickupCandidate, JourneySummary>[]
  >([]);
  const [pickupJourneySearchStatus, setPickupJourneySearchStatus] =
    useState<PickupJourneySearchStatus>("idle");
  const [selectedCurrentLocationJourneyOption, setSelectedJourneyOption] =
    useState<CurrentLocationJourneyOption | null>(null);
  const [selectedCurrentLocationJourneyDetail, setSelectedJourneyDetail] =
    useState<PublishedJourneyDetail | null>(null);
  const [selectedCurrentLocationJourneyMap, setSelectedJourneyMap] =
    useState<CurrentLocationJourneyMapOverlay | null>(null);
  const [selectedSearchJourneyPreviewMap, setSelectedSearchJourneyPreviewMap] =
    useState<DevelopmentJourneyPreview["map"] | null>(null);
  const [selectedJourneyDetailStatus, setSelectedJourneyDetailStatus] =
    useState<SelectedJourneyDetailStatus>("idle");

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
          setSelectedJourneyOption(null);
          setSelectedJourneyDetail(null);
          setSelectedJourneyMap(null);
          setSelectedJourneyDetailStatus("idle");
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
    setSelectedJourneyOption(null);
    setSelectedJourneyDetail(null);
    setSelectedJourneyMap(null);
    setSelectedJourneyDetailStatus("idle");
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

  const pickupCandidatesForSelection = useMemo(() => {
    if (!pickupDestination) {
      return nearbyPickupCandidates;
    }

    if (pickupJourneySearchStatus === "loading") {
      return nearbyPickupCandidates;
    }

    if (pickupJourneySearchStatus === "ready") {
      return pickupJourneyMatches.map((match) => match.candidate);
    }

    return [];
  }, [
    nearbyPickupCandidates,
    pickupDestination,
    pickupJourneyMatches,
    pickupJourneySearchStatus,
  ]);

  const selectedPickupCandidate = useMemo(
    () =>
      pickupCandidatesForSelection.find(
        (candidate) => candidate.location.id === selectedPickupLocationId,
      ) ??
      pickupCandidatesForSelection[0] ??
      null,
    [pickupCandidatesForSelection, selectedPickupLocationId],
  );

  const selectPickupCandidate = useCallback((locationId: string) => {
    setSelectedPickupLocationId(locationId);
  }, []);

  const selectCurrentLocationJourneyOption = useCallback(
    (option: CurrentLocationJourneyOption | null) => {
      setSelectedJourneyOption(option);
      setSelectedJourneyDetail(null);
      setSelectedJourneyMap(null);

      if (option) {
        setSelectedPickupLocationId(option.pickup.id);
        setSelectedJourneyDetailStatus("loading");
      } else {
        setSelectedJourneyDetailStatus("idle");
      }
    },
    [],
  );

  const setPickupDestination = useCallback(
    (destination: LocationOption | null) => {
      setPickupDestinationState(destination);
      setSelectedJourneyOption(null);
      setSelectedJourneyDetail(null);
      setSelectedJourneyMap(null);
      setSelectedJourneyDetailStatus("idle");
    },
    [],
  );

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
    const controller = new AbortController();

    const findConnectedPickups = async () => {
      if (!pickupDestination || pickupSearchStatus !== "ready") {
        setPickupJourneyMatches([]);
        setPickupJourneySearchStatus("idle");
        return;
      }

      setPickupJourneyMatches([]);
      setPickupJourneySearchStatus("loading");

      try {
        const matches = await searchPickupJourneys({
          candidates: nearbyPickupCandidates,
          destinationSlug: pickupDestination.slug,
          searchJourneys: async (originSlug, destinationSlug) => {
            const searchParams = new URLSearchParams({
              origin: originSlug,
              destination: destinationSlug,
            });
            const response = await fetch(
              "/api/journeys?" + searchParams.toString(),
              {
                signal: controller.signal,
              },
            );

            if (!response.ok) {
              throw new Error(
                "Pickup journey search failed with status " +
                  response.status +
                  ".",
              );
            }

            const payload = (await response.json()) as JourneySearchResponse;

            if (!Array.isArray(payload.data)) {
              throw new Error(
                "The pickup journey search returned an invalid response.",
              );
            }

            return payload.data;
          },
        });

        setPickupJourneyMatches(matches);
        setPickupJourneySearchStatus(matches.length > 0 ? "ready" : "empty");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error("Failed to search journeys from nearby pickups:", error);
        setPickupJourneyMatches([]);
        setPickupJourneySearchStatus("error");
      }
    };

    void findConnectedPickups();

    return () => {
      controller.abort();
    };
  }, [nearbyPickupCandidates, pickupDestination, pickupSearchStatus]);

  useEffect(() => {
    const controller = new AbortController();

    const loadSelectedJourneyDetail = async () => {
      if (!selectedCurrentLocationJourneyOption || !currentLocationOrigin) {
        setSelectedJourneyDetail(null);
        setSelectedJourneyMap(null);
        setSelectedJourneyDetailStatus("idle");
        return;
      }

      setSelectedJourneyDetail(null);
      setSelectedJourneyMap(null);
      setSelectedJourneyDetailStatus("loading");

      try {
        const response = await fetch(
          `/api/journeys/${selectedCurrentLocationJourneyOption.publishedJourney.slug}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error(
            `Selected journey map loading failed with status ${response.status}.`,
          );
        }

        const payload = (await response.json()) as JourneyDetailResponse;

        if (!payload.data?.map || !Array.isArray(payload.data.segments)) {
          throw new Error(
            "The selected journey endpoint returned an invalid detail response.",
          );
        }

        const overlay = buildCurrentLocationJourneyMapOverlay({
          currentLocation: currentLocationOrigin.origin,
          option: selectedCurrentLocationJourneyOption,
          publishedMap: payload.data.map,
        });

        setSelectedJourneyDetail(payload.data);
        setSelectedJourneyMap(overlay);
        setSelectedJourneyDetailStatus("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error("Failed to load the selected journey detail:", error);
        setSelectedJourneyDetail(null);
        setSelectedJourneyMap(null);
        setSelectedJourneyDetailStatus("error");
      }
    };

    void loadSelectedJourneyDetail();

    return () => {
      controller.abort();
    };
  }, [currentLocationOrigin, selectedCurrentLocationJourneyOption]);

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
      selectedOriginPlace,
      selectedDestinationPlace,
      setSelectedOriginPlace,
      setSelectedDestinationPlace,
      activeSupportedLocations: supportedLocations.locations,
      supportedLocationsStatus: supportedLocations.status,
      nearbyPickupCandidates,
      selectedPickupCandidate,
      selectPickupCandidate,
      pickupSearchStatus,
      pickupSearchRadiusMeters,
      setPickupDestination,
      pickupJourneyMatches,
      pickupJourneySearchStatus,
      selectedCurrentLocationJourneyOption,
      selectedCurrentLocationJourneyDetail,
      selectedCurrentLocationJourneyMap,
      selectedSearchJourneyPreviewMap,
      setSelectedSearchJourneyPreviewMap,
      selectedJourneyDetailStatus,
      selectCurrentLocationJourneyOption,
    }),
    [
      currentLocationOrigin,
      currentPosition,
      geolocationStatus,
      requestCurrentLocation,
      clearCurrentLocationOrigin,
      locateOnMap,
      selectedOriginPlace,
      selectedDestinationPlace,
      supportedLocations,
      nearbyPickupCandidates,
      selectedPickupCandidate,
      selectPickupCandidate,
      pickupSearchStatus,
      setPickupDestination,
      pickupJourneyMatches,
      pickupJourneySearchStatus,
      selectedCurrentLocationJourneyOption,
      selectedCurrentLocationJourneyDetail,
      selectedCurrentLocationJourneyMap,
      selectedSearchJourneyPreviewMap,
      selectedJourneyDetailStatus,
      selectCurrentLocationJourneyOption,
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
