"use client";

import { useRef, useState, type FormEvent } from "react";

import {
  LocationSearchInput,
  type LocationOption,
} from "@/components/location-search-input";

type JourneySummary = {
  id: string;
  slug: string;
  title: string;
};

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
          ? "No verified direct journeys were found for these locations."
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
      <LocationSearchInput
        id="origin-location"
        name="origin"
        label="Starting location"
        placeholder="Try One Ayala"
        onSelectionChange={handleOriginChange}
      />

      <LocationSearchInput
        id="destination-location"
        name="destination"
        label="Destination"
        placeholder="Try BGC High Street"
        onSelectionChange={handleDestinationChange}
      />

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
          <p>{message}</p>

          {status === "success" && journeys.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {journeys.map((journey) => (
                <li key={journey.id} className="font-semibold">
                  {journey.title}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
