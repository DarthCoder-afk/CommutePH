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
import { JourneySummaryCard } from "@/components/journey-summary-card";
import {
  LocationSearchInput,
  type LocationOption,
} from "@/components/location-search-input";
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
import type { JourneySummary } from "@/lib/journeys/journey-summary";

type JourneySearchSuccess = {
  data: JourneySummary[];
  meta: {
    origin: string;
    destination: string;
    count: number;
    searchType: "direct";
  };
};

type JourneySearchFailure = {
  error: {
    code: string;
    message: string;
  };
};

type SubmissionStatus = "idle" | "loading" | "success" | "notice" | "error";

const persistedSearchKey = "commutemap:last-search";

type PersistedSearch = {
  origin: LocationOption;
  destination: LocationOption;
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
    setPickupDestination,
  } = useCurrentLocationOrigin();
  const [origin, setOrigin] = useState<OriginSelection | null>(null);
  const [destination, setDestination] = useState<LocationOption | null>(null);
  const [originQuery, setOriginQuery] = useState("");
  const [destinationQuery, setDestinationQuery] = useState("");
  const [journeys, setJourneys] = useState<JourneySummary[]>([]);
  const [currentLocationJourneyOptions, setCurrentLocationJourneyOptions] =
    useState<CurrentLocationJourneyOption[]>([]);
  const [status, setStatus] = useState<SubmissionStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const activeRequest = useRef<AbortController | null>(null);
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
    if (!destination || pickupJourneySearchStatus === "loading") {
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
    ) => {
      activeRequest.current?.abort();

      const controller = new AbortController();
      activeRequest.current = controller;

      setJourneys([]);
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

        window.sessionStorage.setItem(
          persistedSearchKey,
          JSON.stringify({
            origin: selectedOrigin,
            destination: selectedDestination,
          } satisfies PersistedSearch),
        );

        setJourneys(payload.data);
        setCurrentLocationJourneyOptions([]);
        setStatus("success");

        setMessage(
          payload.data.length === 0
            ? null
            : `${payload.data.length} verified ${
                payload.data.length === 1 ? "journey" : "journeys"
              } found.`,
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error("Failed to search journeys:", error);

        setJourneys([]);
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
    [selectCurrentLocationJourneyOption],
  );

  useEffect(() => {
    const persistedSearch = readPersistedSearch();

    if (!persistedSearch) {
      return;
    }

    const restoreTimeout = window.setTimeout(() => {
      setOrigin({
        type: "CURATED_LOCATION",
        location: persistedSearch.origin,
      });
      setDestination(persistedSearch.destination);
      setPickupDestination(persistedSearch.destination);
      setOriginQuery(persistedSearch.origin.name);
      setDestinationQuery(persistedSearch.destination.name);

      void searchJourneys(persistedSearch.origin, persistedSearch.destination);
    }, 0);

    return () => {
      window.clearTimeout(restoreTimeout);
      activeRequest.current?.abort();
    };
  }, [searchJourneys, setPickupDestination]);

  useEffect(() => {
    if (!currentLocationOrigin) {
      return;
    }

    activeRequest.current?.abort();
    activeRequest.current = null;
    window.sessionStorage.removeItem(persistedSearchKey);

    const applySuggestionTimeout = window.setTimeout(() => {
      setOrigin(currentLocationOrigin.origin);
      setOriginQuery("Current location");
      setJourneys([]);
      setCurrentLocationJourneyOptions([]);
      setStatus("idle");
      setMessage(null);
    }, 0);

    return () => {
      window.clearTimeout(applySuggestionTimeout);
    };
  }, [currentLocationOrigin]);

  function resetResults() {
    activeRequest.current?.abort();
    activeRequest.current = null;

    window.sessionStorage.removeItem(persistedSearchKey);

    setJourneys([]);
    setCurrentLocationJourneyOptions([]);
    selectCurrentLocationJourneyOption(null);
    setStatus("idle");
    setMessage(null);
  }

  function handleOriginChange(location: LocationOption | null) {
    clearCurrentLocationOrigin();
    setOrigin(
      location
        ? {
            type: "CURATED_LOCATION",
            location,
          }
        : null,
    );
    resetResults();
  }

  function handleDestinationChange(location: LocationOption | null) {
    setDestination(location);
    setPickupDestination(location);
    resetResults();
  }

  function handleSwapLocations() {
    if (origin?.type === "CURRENT_LOCATION") {
      return;
    }

    const previousOrigin = origin?.location ?? null;
    const previousDestination = destination;
    const previousOriginQuery = originQuery;
    const previousDestinationQuery = destinationQuery;

    setOrigin(
      previousDestination
        ? {
            type: "CURATED_LOCATION",
            location: previousDestination,
          }
        : null,
    );
    setDestination(previousOrigin);
    setPickupDestination(previousOrigin);
    setOriginQuery(previousDestinationQuery);
    setDestinationQuery(previousOriginQuery);

    resetResults();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!origin || !destination) {
      setJourneys([]);
      setStatus("error");
      setMessage("Select both an origin and a destination.");
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

    if (origin.location.slug === destination.slug) {
      setJourneys([]);
      setStatus("error");
      setMessage("Origin and destination must be different.");
      return;
    }

    void searchJourneys(origin.location, destination);
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
          value={origin?.type === "CURATED_LOCATION" ? origin.location : null}
          selectedLabel={
            origin?.type === "CURRENT_LOCATION"
              ? "Current location"
              : origin?.location.name
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
                  ? "No supported commute pickup point was found near your current location."
                  : `${nearbyPickupCandidates.length} nearby pickup ${
                      nearbyPickupCandidates.length === 1 ? "point" : "points"
                    } found within ${pickupSearchRadiusMeters / 1_000} km.`}
          </p>
        ) : null}

        {origin?.type === "CURRENT_LOCATION" && destination ? (
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
            className="flex size-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:ring-4 focus:ring-blue-100 focus:outline-none disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
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
      </div>

      <button
        type="submit"
        disabled={status === "loading"}
        className="h-12 w-full rounded-xl bg-blue-700 px-5 font-semibold text-white transition hover:bg-blue-800 focus:ring-4 focus:ring-blue-200 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {status === "loading" ? "Finding journeys…" : "Find a commute"}
      </button>

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

          <h3 className="mt-4 font-bold text-slate-950">
            No verified journey yet
          </h3>

          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">
            This route may still be awaiting review or field verification. Try
            another pair of active locations.
          </p>
        </section>
      ) : null}

      {status === "success" && currentLocationJourneyOptions.length > 0 ? (
        <ol aria-label="Ranked complete commute options" className="space-y-4">
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
              <JourneySummaryCard journey={journey} />
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
