"use client";

import { useRef, useState, type FormEvent } from "react";
import { ArrowUpDown, SearchX } from "lucide-react";

import {
  JourneySummaryCard,
  type JourneySummary,
} from "@/components/journey-summary-card";
import {
  LocationSearchInput,
  type LocationOption,
} from "@/components/location-search-input";

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

type SubmissionStatus = "idle" | "loading" | "success" | "error";

export function CommuteSearchForm() {
  const [origin, setOrigin] = useState<LocationOption | null>(null);
  const [destination, setDestination] = useState<LocationOption | null>(null);
  const [originQuery, setOriginQuery] = useState("");
  const [destinationQuery, setDestinationQuery] = useState("");
  const [journeys, setJourneys] = useState<JourneySummary[]>([]);
  const [status, setStatus] = useState<SubmissionStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const activeRequest = useRef<AbortController | null>(null);

  function resetResults() {
    activeRequest.current?.abort();
    activeRequest.current = null;

    setJourneys([]);
    setStatus("idle");
    setMessage(null);
  }

  function handleOriginChange(location: LocationOption | null) {
    setOrigin(location);
    resetResults();
  }

  function handleDestinationChange(location: LocationOption | null) {
    setDestination(location);
    resetResults();
  }

  function handleSwapLocations() {
    const previousOrigin = origin;
    const previousDestination = destination;
    const previousOriginQuery = originQuery;
    const previousDestinationQuery = destinationQuery;

    setOrigin(previousDestination);
    setDestination(previousOrigin);
    setOriginQuery(previousDestinationQuery);
    setDestinationQuery(previousOriginQuery);

    resetResults();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!origin || !destination) {
      setJourneys([]);
      setStatus("error");
      setMessage("Select both an origin and a destination.");
      return;
    }

    if (origin.slug === destination.slug) {
      setJourneys([]);
      setStatus("error");
      setMessage("Origin and destination must be different.");
      return;
    }

    activeRequest.current?.abort();

    const controller = new AbortController();
    activeRequest.current = controller;

    setJourneys([]);
    setStatus("loading");
    setMessage(null);

    try {
      const searchParams = new URLSearchParams({
        origin: origin.slug,
        destination: destination.slug,
      });

      const response = await fetch(`/api/journeys?${searchParams.toString()}`, {
        signal: controller.signal,
      });

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
          value={origin}
          onQueryChange={setOriginQuery}
          onSelectionChange={handleOriginChange}
        />

        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="h-px flex-1 bg-slate-200" />

          <button
            type="button"
            aria-label="Swap starting location and destination"
            title="Swap locations"
            onClick={handleSwapLocations}
            className="flex size-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:ring-4 focus:ring-blue-100 focus:outline-none"
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
