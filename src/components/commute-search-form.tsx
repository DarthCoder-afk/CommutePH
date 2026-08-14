"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ArrowUpDown, SearchX } from "lucide-react";

import { useCurrentLocationOrigin } from "@/components/current-location-origin-context";
import { CurrentLocationJourneyOptionCard } from "@/components/current-location-journey-option-card";
import { DevelopmentJourneyPreviewCard } from "@/components/development-journey-preview-card";
import { JourneySummaryCard } from "@/components/journey-summary-card";
import {
  LocationSearchInput,
  type LocationOption,
  type PlaceSearchOption,
  type SearchLocationOption,
} from "@/components/location-search-input";
import { NearbySupportedLocationSelector } from "@/components/nearby-supported-location-selector";
import { useNearbySupportedLocations } from "@/components/use-nearby-supported-locations";
import {
  geolocationStatusMessages,
  isGeolocationFailure,
} from "@/lib/geolocation/geolocation-status";
import { formatApproximateDistance } from "@/lib/geolocation/format-distance";
import type { OriginSelection } from "@/lib/geolocation/origin-selection";
import {
  buildCurrentLocationJourneyOptions,
  type CurrentLocationJourneyOption,
} from "@/lib/journeys/build-current-location-journey-options";
import {
  isDevelopmentJourneyPreview,
  type DevelopmentJourneyPreview,
} from "@/lib/journeys/development-journey-preview";
import {
  buildJourneySearchUrl,
  readJourneySearchSlugs,
} from "@/lib/journeys/journey-search-url";
import type { JourneySummary } from "@/lib/journeys/journey-summary";
import {
  isPlaceSearchOption,
  isSupportedLocationOption,
} from "@/lib/locations/search-location-option";

type JourneySearchSuccess = {
  data: (JourneySummary | DevelopmentJourneyPreview)[];
  meta: {
    origin: string;
    destination: string;
    count: number;
    searchType: "direct-and-one-transfer";
    includesDevelopmentPreview: boolean;
  };
};

type JourneySearchFailure = {
  error: {
    code: string;
    message: string;
  };
};

type ExactLocationsResponse = {
  data: LocationOption[];
};

type SubmissionStatus = "idle" | "loading" | "success" | "notice" | "error";

const persistedSearchKey = "commutemap:last-search";

type PersistedSearch = {
  origin: LocationOption;
  destination: LocationOption;
};

type SearchOriginSelection =
  | OriginSelection
  | {
      type: "SEARCHED_PLACE";
      place: PlaceSearchOption;
    };

function isLocationOption(value: unknown): value is LocationOption {
  if (!value || typeof value !== "object") {
    return false;
  }

  const location = value as Partial<LocationOption>;

  return (
    typeof location.id === "string" &&
    typeof location.name === "string" &&
    typeof location.slug === "string" &&
    typeof location.kind === "string" &&
    typeof location.city === "string" &&
    (location.area === null || typeof location.area === "string") &&
    typeof location.longitude === "number" &&
    Number.isFinite(location.longitude) &&
    typeof location.latitude === "number" &&
    Number.isFinite(location.latitude)
  );
}

function readPersistedSearch(): PersistedSearch | null {
  const storedValue = window.sessionStorage.getItem(persistedSearchKey);

  if (!storedValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(storedValue) as Partial<PersistedSearch>;

    if (
      !isLocationOption(parsedValue.origin) ||
      !isLocationOption(parsedValue.destination)
    ) {
      window.sessionStorage.removeItem(persistedSearchKey);
      return null;
    }

    return {
      origin: parsedValue.origin,
      destination: parsedValue.destination,
    };
  } catch {
    window.sessionStorage.removeItem(persistedSearchKey);
    return null;
  }
}

export function CommuteSearchForm() {
  const {
    clearCurrentLocationOrigin,
    currentLocationOrigin,
    geolocationStatus,
    nearbyDevelopmentPickupCandidates,
    nearbyDevelopmentPickupStatus,
    nearbyPickupCandidates,
    pickupJourneyMatches,
    pickupJourneySearchStatus,
    pickupSearchRadiusMeters,
    pickupSearchStatus,
    requestCurrentLocation,
    selectCurrentLocationJourneyOption,
    selectedCurrentLocationJourneyOption,
    selectedPickupCandidate,
    selectPickupCandidate,
    setSelectedDestinationPlace,
    setSelectedJourneySegmentPosition,
    setSelectedOriginPlace,
    setSelectedSearchJourneyPreviewMap,
    setPickupDestination,
  } = useCurrentLocationOrigin();
  const [origin, setOrigin] = useState<SearchOriginSelection | null>(null);
  const [destination, setDestination] = useState<SearchLocationOption | null>(
    null,
  );
  const [originQuery, setOriginQuery] = useState("");
  const [destinationQuery, setDestinationQuery] = useState("");
  const [journeys, setJourneys] = useState<
    (JourneySummary | DevelopmentJourneyPreview)[]
  >([]);
  const [currentLocationJourneyOptions, setCurrentLocationJourneyOptions] =
    useState<CurrentLocationJourneyOption[]>([]);
  const [status, setStatus] = useState<SubmissionStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const originPlace = origin?.type === "SEARCHED_PLACE" ? origin.place : null;
  const destinationPlace =
    destination && isPlaceSearchOption(destination) ? destination : null;
  const originPlaceResolution = useNearbySupportedLocations(
    originPlace,
    pickupSearchRadiusMeters,
  );
  const destinationPlaceResolution = useNearbySupportedLocations(
    destinationPlace,
    pickupSearchRadiusMeters,
  );

  const activeRequest = useRef<AbortController | null>(null);
  const resultsRegionRef = useRef<HTMLDivElement | null>(null);
  const shouldFocusResultsRef = useRef(false);
  const pickupJourneyMatchesByLocationId = useMemo(
    () =>
      new Map(
        pickupJourneyMatches.map((match) => [
          match.candidate.location.id,
          match,
        ]),
      ),
    [pickupJourneyMatches],
  );
  const displayedPickupCandidates = useMemo(() => {
    if (
      !destination ||
      isPlaceSearchOption(destination) ||
      pickupJourneySearchStatus === "loading"
    ) {
      return nearbyPickupCandidates;
    }

    if (pickupJourneySearchStatus === "ready") {
      return pickupJourneyMatches.map((match) => match.candidate);
    }

    return [];
  }, [
    destination,
    nearbyPickupCandidates,
    pickupJourneyMatches,
    pickupJourneySearchStatus,
  ]);

  const searchJourneys = useCallback(
    async (
      selectedOrigin: LocationOption,
      selectedDestination: LocationOption,
      options: {
        persist?: boolean;
        resolutionMessage?: string;
        urlMode?: "push" | "replace" | "none";
      } = {},
    ) => {
      activeRequest.current?.abort();

      const controller = new AbortController();
      activeRequest.current = controller;

      setJourneys([]);
      setSelectedJourneySegmentPosition(null);
      setSelectedSearchJourneyPreviewMap(null);
      setCurrentLocationJourneyOptions([]);
      selectCurrentLocationJourneyOption(null);
      setStatus("loading");
      setMessage(null);

      try {
        const searchParams = new URLSearchParams({
          origin: selectedOrigin.slug,
          destination: selectedDestination.slug,
        });

        const response = await fetch(
          `/api/journeys?${searchParams.toString()}`,
          {
            signal: controller.signal,
          },
        );

        const payload = (await response.json()) as
          JourneySearchSuccess | JourneySearchFailure;

        if (!response.ok) {
          const errorMessage =
            "error" in payload
              ? payload.error.message
              : "Unable to search journeys.";

          throw new Error(errorMessage);
        }

        if (!("data" in payload)) {
          throw new Error("The journey search returned an invalid response.");
        }

        if (options.persist !== false) {
          window.sessionStorage.setItem(
            persistedSearchKey,
            JSON.stringify({
              origin: selectedOrigin,
              destination: selectedDestination,
            } satisfies PersistedSearch),
          );
        }

        if (options.urlMode !== "none") {
          const nextUrl = buildJourneySearchUrl(window.location.href, {
            origin: selectedOrigin.slug,
            destination: selectedDestination.slug,
          });
          const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

          if (nextUrl !== currentUrl) {
            const method =
              options.urlMode === "replace" ? "replaceState" : "pushState";
            window.history[method](null, "", nextUrl);
          }
        }

        setJourneys(payload.data);
        setSelectedJourneySegmentPosition(null);
        setSelectedSearchJourneyPreviewMap(
          payload.data.find(isDevelopmentJourneyPreview)?.map ?? null,
        );
        setCurrentLocationJourneyOptions([]);
        setStatus("success");

        const developmentPreviewCount = payload.data.filter(
          isDevelopmentJourneyPreview,
        ).length;
        const verifiedJourneyCount =
          payload.data.length - developmentPreviewCount;
        const resultMessage =
          payload.data.length === 0
            ? "No verified journey connects these supported commute points yet."
            : developmentPreviewCount > 0
              ? `${developmentPreviewCount} unverified local development preview found.`
              : `${verifiedJourneyCount} verified ${
                  verifiedJourneyCount === 1 ? "journey" : "journeys"
                } found.`;

        setMessage(
          options.resolutionMessage
            ? `${options.resolutionMessage} ${resultMessage}`
            : payload.data.length === 0
              ? null
              : resultMessage,
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error("Failed to search journeys:", error);

        setJourneys([]);
        setSelectedJourneySegmentPosition(null);
        setSelectedSearchJourneyPreviewMap(null);
        setCurrentLocationJourneyOptions([]);
        setStatus("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to search journeys. Please try again.",
        );
      } finally {
        if (activeRequest.current === controller) {
          activeRequest.current = null;
        }
      }
    },
    [
      selectCurrentLocationJourneyOption,
      setSelectedJourneySegmentPosition,
      setSelectedSearchJourneyPreviewMap,
    ],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function restoreSearch() {
      const currentSearchParams = new URLSearchParams(window.location.search);
      const hasSharedSearchParameters =
        currentSearchParams.has("origin") ||
        currentSearchParams.has("destination");
      const sharedSearch = readJourneySearchSlugs(window.location.search);

      if (hasSharedSearchParameters && !sharedSearch) {
        setStatus("notice");
        setMessage("This shared commute link has invalid journey endpoints.");
        return;
      }

      if (sharedSearch) {
        const searchParams = new URLSearchParams({
          slugs: `${sharedSearch.origin},${sharedSearch.destination}`,
        });
        const response = await fetch(
          `/api/locations?${searchParams.toString()}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error("Unable to restore the shared commute search.");
        }

        const payload = (await response.json()) as ExactLocationsResponse;
        const restoredOrigin = payload.data.find(
          (location) => location.slug === sharedSearch.origin,
        );
        const restoredDestination = payload.data.find(
          (location) => location.slug === sharedSearch.destination,
        );

        if (!restoredOrigin || !restoredDestination) {
          setStatus("notice");
          setMessage(
            "This shared commute link uses a location that is no longer publicly available.",
          );
          return;
        }

        setOrigin({ type: "CURATED_LOCATION", location: restoredOrigin });
        setDestination(restoredDestination);
        setSelectedOriginPlace(null);
        setSelectedDestinationPlace(null);
        setPickupDestination(restoredDestination);
        setOriginQuery(restoredOrigin.name);
        setDestinationQuery(restoredDestination.name);

        await searchJourneys(restoredOrigin, restoredDestination, {
          urlMode: "none",
        });
        return;
      }

      const persistedSearch = readPersistedSearch();

      if (!persistedSearch) {
        return;
      }

      setOrigin({
        type: "CURATED_LOCATION",
        location: persistedSearch.origin,
      });
      setDestination(persistedSearch.destination);
      setSelectedOriginPlace(null);
      setSelectedDestinationPlace(null);
      setPickupDestination(persistedSearch.destination);
      setOriginQuery(persistedSearch.origin.name);
      setDestinationQuery(persistedSearch.destination.name);

      await searchJourneys(
        persistedSearch.origin,
        persistedSearch.destination,
        {
          urlMode: "replace",
        },
      );
    }

    void restoreSearch().catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      console.error("Failed to restore commute search:", error);
      setStatus("error");
      setMessage("The saved commute search could not be restored.");
    });

    return () => {
      controller.abort();
      activeRequest.current?.abort();
    };
  }, [
    searchJourneys,
    setPickupDestination,
    setSelectedDestinationPlace,
    setSelectedOriginPlace,
  ]);

  useEffect(() => {
    if (!currentLocationOrigin) {
      return;
    }

    activeRequest.current?.abort();
    activeRequest.current = null;
    window.sessionStorage.removeItem(persistedSearchKey);
    window.history.replaceState(
      null,
      "",
      buildJourneySearchUrl(window.location.href, null),
    );

    const applySuggestionTimeout = window.setTimeout(() => {
      setOrigin(currentLocationOrigin.origin);
      setSelectedOriginPlace(null);
      setOriginQuery("Current location");
      setJourneys([]);
      setSelectedJourneySegmentPosition(null);
      setSelectedSearchJourneyPreviewMap(null);
      setCurrentLocationJourneyOptions([]);
      setStatus("idle");
      setMessage(null);
    }, 0);

    return () => {
      window.clearTimeout(applySuggestionTimeout);
    };
  }, [
    currentLocationOrigin,
    setSelectedJourneySegmentPosition,
    setSelectedOriginPlace,
    setSelectedSearchJourneyPreviewMap,
  ]);

  useEffect(() => {
    if (!destinationPlace) {
      return;
    }

    setPickupDestination(
      destinationPlaceResolution.selectedCandidate?.location ?? null,
    );
  }, [
    destinationPlace,
    destinationPlaceResolution.selectedCandidate,
    setPickupDestination,
  ]);

  useEffect(() => {
    if (
      !shouldFocusResultsRef.current ||
      status === "idle" ||
      status === "loading"
    ) {
      return;
    }

    shouldFocusResultsRef.current = false;

    const focusFrame = window.requestAnimationFrame(() => {
      resultsRegionRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
    };
  }, [status]);

  function resetResults() {
    activeRequest.current?.abort();
    activeRequest.current = null;

    window.sessionStorage.removeItem(persistedSearchKey);
    window.history.replaceState(
      null,
      "",
      buildJourneySearchUrl(window.location.href, null),
    );

    setJourneys([]);
    setSelectedJourneySegmentPosition(null);
    setSelectedSearchJourneyPreviewMap(null);
    setCurrentLocationJourneyOptions([]);
    selectCurrentLocationJourneyOption(null);
    setStatus("idle");
    setMessage(null);
  }

  function handleOriginChange(location: SearchLocationOption | null) {
    clearCurrentLocationOrigin();
    setSelectedOriginPlace(
      location && isPlaceSearchOption(location) ? location : null,
    );
    setOrigin(
      location
        ? isPlaceSearchOption(location)
          ? {
              type: "SEARCHED_PLACE",
              place: location,
            }
          : {
              type: "CURATED_LOCATION",
              location,
            }
        : null,
    );
    resetResults();
  }

  function handleDestinationChange(location: SearchLocationOption | null) {
    setDestination(location);
    setSelectedDestinationPlace(
      location && isPlaceSearchOption(location) ? location : null,
    );
    setPickupDestination(
      location && isSupportedLocationOption(location) ? location : null,
    );
    resetResults();
  }

  function handleSwapLocations() {
    if (origin?.type === "CURRENT_LOCATION") {
      return;
    }

    const previousOrigin =
      origin?.type === "CURATED_LOCATION"
        ? origin.location
        : origin?.type === "SEARCHED_PLACE"
          ? origin.place
          : null;
    const previousDestination = destination;
    const previousOriginQuery = originQuery;
    const previousDestinationQuery = destinationQuery;

    setOrigin(
      previousDestination
        ? isPlaceSearchOption(previousDestination)
          ? { type: "SEARCHED_PLACE", place: previousDestination }
          : { type: "CURATED_LOCATION", location: previousDestination }
        : null,
    );
    setDestination(previousOrigin);
    setSelectedOriginPlace(
      previousDestination && isPlaceSearchOption(previousDestination)
        ? previousDestination
        : null,
    );
    setSelectedDestinationPlace(
      previousOrigin && isPlaceSearchOption(previousOrigin)
        ? previousOrigin
        : null,
    );
    setPickupDestination(
      previousOrigin && isSupportedLocationOption(previousOrigin)
        ? previousOrigin
        : null,
    );
    setOriginQuery(previousDestinationQuery);
    setDestinationQuery(previousOriginQuery);

    resetResults();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    shouldFocusResultsRef.current = true;

    if (!origin || !destination) {
      setJourneys([]);
      setStatus("error");
      setMessage("Select both an origin and a destination.");
      return;
    }

    const usesGeneralOrigin = origin.type === "SEARCHED_PLACE";
    const usesGeneralDestination = isPlaceSearchOption(destination);

    if (
      (usesGeneralOrigin && originPlaceResolution.status === "loading") ||
      (usesGeneralDestination &&
        destinationPlaceResolution.status === "loading")
    ) {
      setJourneys([]);
      setCurrentLocationJourneyOptions([]);
      setStatus("notice");
      setMessage(
        "Wait while nearby supported commute points are being checked.",
      );
      return;
    }

    if (
      (usesGeneralOrigin && originPlaceResolution.status === "error") ||
      (usesGeneralDestination && destinationPlaceResolution.status === "error")
    ) {
      setJourneys([]);
      setCurrentLocationJourneyOptions([]);
      setStatus("error");
      setMessage(
        "A nearby supported commute point could not be loaded. Select the place again and retry.",
      );
      return;
    }

    if (
      (usesGeneralOrigin && !originPlaceResolution.selectedCandidate) ||
      (usesGeneralDestination && !destinationPlaceResolution.selectedCandidate)
    ) {
      setJourneys([]);
      setCurrentLocationJourneyOptions([]);
      setStatus("notice");
      setMessage(
        `No supported commute point is available within ${pickupSearchRadiusMeters / 1_000} km of the selected general place.`,
      );
      return;
    }

    const resolvedDestination = usesGeneralDestination
      ? destinationPlaceResolution.selectedCandidate?.location
      : destination;

    if (!resolvedDestination) {
      setJourneys([]);
      setCurrentLocationJourneyOptions([]);
      setStatus("error");
      setMessage("Select a supported destination.");
      return;
    }

    if (origin.type === "CURRENT_LOCATION") {
      setJourneys([]);
      setCurrentLocationJourneyOptions([]);
      selectCurrentLocationJourneyOption(null);
      setStatus("notice");

      if (pickupSearchStatus === "loading") {
        setMessage("Checking for supported pickup points near you.");
      } else if (pickupSearchStatus === "error") {
        setMessage(
          "Supported pickup points could not be loaded. Please try again.",
        );
      } else if (pickupSearchStatus === "empty") {
        setMessage(
          "No supported commute pickup point was found near your current location.",
        );
      } else if (pickupJourneySearchStatus === "loading") {
        setMessage(
          "Checking which nearby pickup points connect to your destination.",
        );
      } else if (pickupJourneySearchStatus === "error") {
        setStatus("error");
        setMessage(
          "Journey availability from nearby pickup points could not be checked. Please try again.",
        );
      } else if (pickupJourneySearchStatus === "empty") {
        setMessage(
          "No verified journey connects a nearby pickup point to this destination yet.",
        );
      } else {
        let completeOptions: CurrentLocationJourneyOption[];

        try {
          completeOptions =
            buildCurrentLocationJourneyOptions(pickupJourneyMatches);
        } catch (error) {
          console.error("Failed to assemble current-location journeys:", error);
          setStatus("error");
          setMessage("Complete commute options could not be assembled.");
          return;
        }

        if (completeOptions.length === 0) {
          setMessage(
            "No complete commute option is available for this destination yet.",
          );
          return;
        }

        setCurrentLocationJourneyOptions(completeOptions);
        selectCurrentLocationJourneyOption(completeOptions[0] ?? null);
        setStatus("success");
        setMessage(
          `${completeOptions.length} complete commute ${
            completeOptions.length === 1 ? "option" : "options"
          } found and ranked.`,
        );
      }

      return;
    }

    const resolvedOrigin = usesGeneralOrigin
      ? originPlaceResolution.selectedCandidate?.location
      : origin.location;

    if (!resolvedOrigin) {
      setJourneys([]);
      setStatus("error");
      setMessage("Select a supported starting point.");
      return;
    }

    if (resolvedOrigin.slug === resolvedDestination.slug) {
      setJourneys([]);
      setStatus("error");
      setMessage(
        "The selected places resolve to the same supported commute point. Choose a different origin or destination.",
      );
      return;
    }

    const resolutionParts = [
      usesGeneralOrigin
        ? `Starting from ${resolvedOrigin.name}, the selected supported point near ${originPlace?.name}.`
        : null,
      usesGeneralDestination
        ? `Ending at ${resolvedDestination.name}, the selected supported point near ${destinationPlace?.name}.`
        : null,
    ].filter((part) => part !== null);

    void searchJourneys(resolvedOrigin, resolvedDestination, {
      persist: !usesGeneralOrigin && !usesGeneralDestination,
      resolutionMessage: resolutionParts.join(" "),
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={status === "loading"}
      className="space-y-6"
    >
      <div className="space-y-4">
        <LocationSearchInput
          id="origin-location"
          name="origin"
          label="Starting location"
          placeholder="Try One Ayala"
          query={originQuery}
          value={
            origin?.type === "CURATED_LOCATION"
              ? origin.location
              : origin?.type === "SEARCHED_PLACE"
                ? origin.place
                : null
          }
          selectedLabel={
            origin?.type === "CURRENT_LOCATION"
              ? "Current location"
              : origin?.type === "CURATED_LOCATION"
                ? origin.location.name
                : origin?.place.name
          }
          actionOption={{
            label: "Current location",
            description:
              geolocationStatus === "requesting"
                ? "Requesting your device location…"
                : "Use your device position as the journey starting point.",
            disabled: geolocationStatus === "requesting",
            onSelect: requestCurrentLocation,
          }}
          onQueryChange={setOriginQuery}
          onSelectionChange={handleOriginChange}
        />

        {originPlace ? (
          <NearbySupportedLocationSelector
            candidates={originPlaceResolution.candidates}
            fieldName="origin-supported-location"
            label="Supported starting points nearby"
            radiusMeters={pickupSearchRadiusMeters}
            selectedLocationId={
              originPlaceResolution.selectedCandidate?.location.id ?? null
            }
            status={originPlaceResolution.status}
            onSelectionChange={originPlaceResolution.selectCandidate}
          />
        ) : null}

        {isGeolocationFailure(geolocationStatus) ? (
          <p role="alert" className="text-sm leading-6 text-red-700">
            {geolocationStatusMessages[geolocationStatus]}
          </p>
        ) : null}

        {origin?.type === "CURRENT_LOCATION" ? (
          <p
            role={pickupSearchStatus === "error" ? "alert" : "status"}
            aria-live="polite"
            className={`text-sm leading-6 ${
              pickupSearchStatus === "error"
                ? "text-red-700"
                : pickupSearchStatus === "empty"
                  ? "text-amber-800"
                  : "text-emerald-700"
            }`}
          >
            {pickupSearchStatus === "loading"
              ? "Checking for supported pickup points near you…"
              : pickupSearchStatus === "error"
                ? "Supported pickup points could not be loaded. Please refresh and try again."
                : pickupSearchStatus === "empty"
                  ? nearbyDevelopmentPickupStatus === "loading"
                    ? "No verified pickup point was found nearby. Checking mapped transit stops…"
                    : nearbyDevelopmentPickupStatus === "ready"
                      ? `No verified pickup point was found, but ${nearbyDevelopmentPickupCandidates.length} unverified mapped ${nearbyDevelopmentPickupCandidates.length === 1 ? "stop was" : "stops were"} found nearby.`
                      : "No verified supported pickup point was found near your current location."
                  : `${nearbyPickupCandidates.length} nearby pickup ${
                      nearbyPickupCandidates.length === 1 ? "point" : "points"
                    } found within ${pickupSearchRadiusMeters / 1_000} km.`}
          </p>
        ) : null}

        {origin?.type === "CURRENT_LOCATION" &&
        nearbyDevelopmentPickupStatus === "ready" ? (
          <section
            aria-labelledby="nearby-mapped-stops-heading"
            className="rounded-xl border border-amber-200 bg-amber-50 p-3"
          >
            <h3
              id="nearby-mapped-stops-heading"
              className="text-sm font-bold text-amber-950"
            >
              Nearby mapped stops — unverified
            </h3>
            <p className="mt-1 text-xs leading-5 text-amber-900">
              These imported OpenStreetMap or GTFS points are shown for local
              development only. They cannot be used for public directions until
              their identity, pickup access, and route connections are verified.
            </p>

            <ol className="mt-3 space-y-2">
              {nearbyDevelopmentPickupCandidates.map((candidate) => (
                <li
                  key={candidate.location.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-amber-100 bg-white p-3 text-sm"
                >
                  <span>
                    <span className="block font-semibold text-slate-950">
                      {candidate.location.name}
                    </span>
                    <span className="mt-1 block text-xs text-slate-600">
                      {candidate.location.kind} · {candidate.location.city} ·{" "}
                      {candidate.location.sourceType.toUpperCase()}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-amber-900">
                    {formatApproximateDistance(candidate.distanceMeters)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {origin?.type === "CURRENT_LOCATION" &&
        destination &&
        isSupportedLocationOption(destination) ? (
          <p
            role={pickupJourneySearchStatus === "error" ? "alert" : "status"}
            aria-live="polite"
            className={`text-sm leading-6 ${
              pickupJourneySearchStatus === "error"
                ? "text-red-700"
                : pickupJourneySearchStatus === "empty"
                  ? "text-amber-800"
                  : "text-blue-700"
            }`}
          >
            {pickupJourneySearchStatus === "loading"
              ? "Checking verified journeys from nearby pickup points…"
              : pickupJourneySearchStatus === "error"
                ? "Journey availability could not be checked. Please try again."
                : pickupJourneySearchStatus === "empty"
                  ? "No verified journey connects a nearby pickup point to this destination yet."
                  : pickupJourneySearchStatus === "ready"
                    ? `${pickupJourneyMatches.length} journey-connected ${
                        pickupJourneyMatches.length === 1
                          ? "pickup point"
                          : "pickup points"
                      } available.`
                    : null}
          </p>
        ) : null}

        {origin?.type === "CURRENT_LOCATION" &&
        pickupSearchStatus === "ready" &&
        displayedPickupCandidates.length > 0 ? (
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-800">
              {destination && pickupJourneySearchStatus === "ready"
                ? "Journey-connected pickup points"
                : "Suggested pickup points"}
            </legend>

            <p className="text-xs leading-5 text-slate-500">
              {destination && pickupJourneySearchStatus === "loading"
                ? "Checking each nearby point against published journey guidance."
                : "Ordered by straight-line proximity. Actual walking distance may be longer."}
            </p>

            <div className="space-y-2">
              {displayedPickupCandidates.map((candidate, index) => {
                const isSelected =
                  selectedPickupCandidate?.location.id ===
                  candidate.location.id;
                const journeyMatch = pickupJourneyMatchesByLocationId.get(
                  candidate.location.id,
                );
                const isCheckingJourney =
                  Boolean(destination) &&
                  pickupJourneySearchStatus === "loading";

                return (
                  <label
                    key={candidate.location.id}
                    className={`block cursor-pointer rounded-xl border p-3 transition ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100"
                        : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50"
                    }`}
                  >
                    <span className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="pickup-location"
                        value={candidate.location.slug}
                        checked={isSelected}
                        disabled={isCheckingJourney}
                        onChange={() => {
                          selectPickupCandidate(candidate.location.id);
                          selectCurrentLocationJourneyOption(null);
                        }}
                        className="mt-1 size-4 accent-emerald-700 disabled:cursor-wait"
                      />

                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-950">
                            {candidate.location.name}
                          </span>

                          {index === 0 ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                              Nearest
                            </span>
                          ) : null}

                          {isSelected ? (
                            <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-xs font-semibold text-white">
                              Selected
                            </span>
                          ) : null}

                          {journeyMatch ? (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-900">
                              {journeyMatch.journeys.length} verified{" "}
                              {journeyMatch.journeys.length === 1
                                ? "journey"
                                : "journeys"}
                            </span>
                          ) : null}
                        </span>

                        <span className="mt-1 block text-sm text-slate-600">
                          {candidate.location.area
                            ? `${candidate.location.area}, ${candidate.location.city}`
                            : candidate.location.city}
                        </span>

                        <span className="mt-1 block text-xs font-medium text-slate-500">
                          {formatApproximateDistance(candidate.distanceMeters)}
                        </span>
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="h-px flex-1 bg-slate-200" />

          <button
            type="button"
            aria-label="Swap starting location and destination"
            title={
              origin?.type === "CURRENT_LOCATION"
                ? "Current location cannot be used as a destination"
                : "Swap locations"
            }
            disabled={origin?.type === "CURRENT_LOCATION"}
            onClick={handleSwapLocations}
            className="flex size-11 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:ring-4 focus:ring-blue-100 focus:outline-none disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
          >
            <ArrowUpDown aria-hidden="true" className="size-5" />
          </button>

          <span aria-hidden="true" className="h-px flex-1 bg-slate-200" />
        </div>

        <LocationSearchInput
          id="destination-location"
          name="destination"
          label="Destination"
          placeholder="Try BGC High Street"
          query={destinationQuery}
          value={destination}
          onQueryChange={setDestinationQuery}
          onSelectionChange={handleDestinationChange}
        />

        {destinationPlace ? (
          <NearbySupportedLocationSelector
            candidates={destinationPlaceResolution.candidates}
            fieldName="destination-supported-location"
            label="Supported destinations nearby"
            radiusMeters={pickupSearchRadiusMeters}
            selectedLocationId={
              destinationPlaceResolution.selectedCandidate?.location.id ?? null
            }
            status={destinationPlaceResolution.status}
            onSelectionChange={destinationPlaceResolution.selectCandidate}
          />
        ) : null}
      </div>

      <button
        type="submit"
        disabled={status === "loading"}
        className="h-12 w-full rounded-xl bg-blue-700 px-5 font-semibold text-white transition hover:bg-blue-800 focus:ring-4 focus:ring-blue-200 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {status === "loading" ? "Finding journeys…" : "Find a commute"}
      </button>

      <div
        ref={resultsRegionRef}
        role="region"
        aria-labelledby="search-results-heading"
        tabIndex={-1}
        className="space-y-4 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:outline-none"
      >
        <h3 id="search-results-heading" className="sr-only">
          Commute search results
        </h3>

        {message ? (
          <div
            role={status === "error" ? "alert" : "status"}
            aria-live="polite"
            className={`rounded-xl border p-4 text-sm ${
              status === "error"
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-blue-200 bg-blue-50 text-blue-900"
            }`}
          >
            {message}
          </div>
        ) : null}

        {status === "success" &&
        journeys.length === 0 &&
        currentLocationJourneyOptions.length === 0 ? (
          <section
            role="status"
            aria-live="polite"
            className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center"
          >
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-slate-200 text-slate-600">
              <SearchX aria-hidden="true" className="size-6" />
            </span>

            <h4 className="mt-4 font-bold text-slate-950">
              No verified journey yet
            </h4>

            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">
              This route may still be awaiting review or field verification. Try
              another pair of active locations.
            </p>
          </section>
        ) : null}

        {status === "success" && currentLocationJourneyOptions.length > 0 ? (
          <ol
            aria-label="Ranked complete commute options"
            className="space-y-4"
          >
            {currentLocationJourneyOptions.map((option) => (
              <li key={option.id}>
                <CurrentLocationJourneyOptionCard
                  option={option}
                  isSelectedPickup={
                    selectedPickupCandidate?.location.id === option.pickup.id
                  }
                  isSelectedJourney={
                    selectedCurrentLocationJourneyOption?.id === option.id
                  }
                  onSelect={() => {
                    selectCurrentLocationJourneyOption(option);
                  }}
                />
              </li>
            ))}
          </ol>
        ) : null}

        {status === "success" && journeys.length > 0 ? (
          <ul aria-label="Journey results" className="space-y-4">
            {journeys.map((journey) => (
              <li key={journey.id}>
                {isDevelopmentJourneyPreview(journey) ? (
                  <DevelopmentJourneyPreviewCard journey={journey} />
                ) : (
                  <JourneySummaryCard journey={journey} />
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </form>
  );
}
