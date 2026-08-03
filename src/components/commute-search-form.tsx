"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ArrowUpDown, SearchX } from "lucide-react";

import { useCurrentLocationOrigin } from "@/components/current-location-origin-context";
import {
  JourneySummaryCard,
  type JourneySummary,
} from "@/components/journey-summary-card";
import {
  LocationSearchInput,
  type LocationOption,
} from "@/components/location-search-input";
import type { OriginSelection } from "@/lib/geolocation/origin-selection";

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
  const { currentLocationOrigin } = useCurrentLocationOrigin();
  const [origin, setOrigin] = useState<OriginSelection | null>(null);
  const [destination, setDestination] = useState<LocationOption | null>(null);
  const [originQuery, setOriginQuery] = useState("");
  const [destinationQuery, setDestinationQuery] = useState("");
  const [journeys, setJourneys] = useState<JourneySummary[]>([]);
  const [status, setStatus] = useState<SubmissionStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const activeRequest = useRef<AbortController | null>(null);

  const searchJourneys = useCallback(
    async (
      selectedOrigin: LocationOption,
      selectedDestination: LocationOption,
    ) => {
      activeRequest.current?.abort();

      const controller = new AbortController();
      activeRequest.current = controller;

      setJourneys([]);
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
    [],
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
      setOriginQuery(persistedSearch.origin.name);
      setDestinationQuery(persistedSearch.destination.name);

      void searchJourneys(persistedSearch.origin, persistedSearch.destination);
    }, 0);

    return () => {
      window.clearTimeout(restoreTimeout);
      activeRequest.current?.abort();
    };
  }, [searchJourneys]);

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
    setStatus("idle");
    setMessage(null);
  }

  function handleOriginChange(location: LocationOption | null) {
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
      setStatus("notice");
      setMessage(
        "Current location is selected. Nearby pickup journey search will be enabled after pickup candidates are added.",
      );
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
          onQueryChange={setOriginQuery}
          onSelectionChange={handleOriginChange}
        />

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

      {status === "success" && journeys.length === 0 ? (
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
