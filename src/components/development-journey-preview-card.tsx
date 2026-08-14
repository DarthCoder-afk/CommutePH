"use client";

import { useRef, useState } from "react";
import {
  ArrowRight,
  BusFront,
  Check,
  CircleAlert,
  Clock3,
  Coins,
  Footprints,
  MapPinned,
  Share2,
  X,
} from "lucide-react";

import { useCurrentLocationOrigin } from "@/components/current-location-origin-context";
import type { DevelopmentJourneyPreview } from "@/lib/journeys/development-journey-preview";

type DevelopmentJourneyPreviewCardProps = {
  journey: DevelopmentJourneyPreview;
};

function formatMode(
  mode: "jeepney" | "modern_jeepney" | "city_bus" | "bgc_bus",
) {
  return mode.replaceAll("_", " ");
}

export function DevelopmentJourneyPreviewCard({
  journey,
}: DevelopmentJourneyPreviewCardProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const { setSelectedJourneySegmentPosition } = useCurrentLocationOrigin();

  function showJourneyOnMap(segmentPosition: number | null = null) {
    setSelectedJourneySegmentPosition(segmentPosition);
    dialogRef.current?.close();

    const mapRegion = document.getElementById("commute-map");

    mapRegion?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => mapRegion?.focus({ preventScroll: true }), 400);
  }

  async function copyJourneyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 2_000);
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <>
      <article className="rounded-2xl border border-amber-300 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.65rem] font-bold tracking-wide text-amber-800 uppercase">
              Local development preview
            </p>
            <h3 className="mt-1 text-base font-bold text-slate-950">
              {journey.title}
            </h3>
            <p className="mt-1 truncate text-xs text-slate-600">
              {journey.origin.name} <span aria-hidden="true">→</span>{" "}
              {journey.destination.name}
            </p>
          </div>

          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[0.65rem] font-bold text-amber-900">
            <CircleAlert aria-hidden="true" className="size-3" />
            Unverified
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-700">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1.5">
            <BusFront aria-hidden="true" className="size-3.5" />
            {journey.segments.length} draft steps
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1.5">
            <Clock3 aria-hidden="true" className="size-3.5" />
            Duration unknown
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1.5">
            <Coins aria-hidden="true" className="size-3.5" />
            Fare unknown
          </span>
        </div>

        <p className="mt-3 line-clamp-2 text-xs leading-5 text-amber-900">
          Inactive draft data for interface testing—not safe for a real trip.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => showJourneyOnMap()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-800 transition hover:bg-blue-100 focus:ring-4 focus:ring-blue-100 focus:outline-none"
          >
            <MapPinned aria-hidden="true" className="size-4" />
            Show map
          </button>

          <button
            type="button"
            onClick={() => dialogRef.current?.showModal()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 focus:ring-4 focus:ring-blue-200 focus:outline-none"
          >
            Directions
            <ArrowRight aria-hidden="true" className="size-4" />
          </button>
        </div>
      </article>

      <dialog
        ref={dialogRef}
        aria-labelledby={`preview-dialog-title-${journey.id}`}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            event.currentTarget.close();
          }
        }}
        className="m-auto max-h-[90dvh] w-[min(42rem,calc(100%-2rem))] overflow-hidden rounded-3xl border-0 bg-white p-0 shadow-2xl backdrop:bg-slate-950/55 open:flex open:flex-col"
      >
        <header className="shrink-0 border-b border-amber-200 bg-amber-50 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold tracking-wide text-amber-800 uppercase">
                Unverified development preview
              </p>
              <h3
                id={`preview-dialog-title-${journey.id}`}
                className="mt-1 text-xl font-bold text-slate-950"
              >
                {journey.title}
              </h3>
              <p className="mt-1 text-sm text-slate-700">
                {journey.origin.name} <span aria-hidden="true">→</span>{" "}
                {journey.destination.name}
              </p>
            </div>

            <button
              type="button"
              aria-label="Close draft directions"
              onClick={() => dialogRef.current?.close()}
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-white hover:text-slate-950 focus:ring-4 focus:ring-amber-200 focus:outline-none"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>

          <p className="mt-3 text-sm leading-6 text-amber-950">
            Do not use these directions for a real trip. Stop order and
            schematic lines are provisional; fares, timing, landmarks, and
            street instructions remain withheld until field verification.
          </p>
        </header>

        <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="flex items-center gap-2">
            <MapPinned aria-hidden="true" className="size-5 text-blue-700" />
            <h4 className="font-bold text-slate-950">Draft way to get there</h4>
          </div>

          <ol className="mt-4 space-y-3">
            {journey.segments.map((segment) => (
              <li
                key={segment.id}
                className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 rounded-2xl border border-slate-200 p-4"
              >
                <span
                  aria-hidden="true"
                  className="flex size-9 items-center justify-center rounded-full bg-slate-900 font-bold text-white"
                >
                  {segment.position}
                </span>

                <div>
                  <p className="flex items-center gap-2 text-xs font-bold tracking-wide text-slate-500 uppercase">
                    {segment.kind === "walking" ? (
                      <Footprints aria-hidden="true" className="size-4" />
                    ) : (
                      <BusFront aria-hidden="true" className="size-4" />
                    )}
                    {segment.kind}
                  </p>
                  <p className="mt-1 font-semibold text-slate-950">
                    {segment.summary}
                  </p>

                  {segment.kind === "walking" ? (
                    <p className="mt-2 text-sm text-slate-600">
                      {segment.from.name} <span aria-hidden="true">→</span>{" "}
                      {segment.to.name}
                    </p>
                  ) : (
                    <div className="mt-2 space-y-1 text-sm text-slate-600">
                      <p>
                        <span className="font-semibold text-slate-800">
                          Draft route:
                        </span>{" "}
                        {segment.route.name} ({formatMode(segment.route.mode)})
                      </p>
                      {segment.route.signboard ? (
                        <p>
                          <span className="font-semibold text-slate-800">
                            Draft signboard:
                          </span>{" "}
                          {segment.route.signboard}
                        </p>
                      ) : null}
                      <p>
                        <span className="font-semibold text-slate-800">
                          Board:
                        </span>{" "}
                        {segment.boardingStop.name}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-800">
                          Alight:
                        </span>{" "}
                        {segment.alightingStop.name}
                      </p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => showJourneyOnMap(segment.position)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 transition hover:bg-blue-100 focus:ring-4 focus:ring-blue-100 focus:outline-none"
                  >
                    <MapPinned aria-hidden="true" className="size-3.5" />
                    Show step {segment.position} on map
                  </button>
                </div>
              </li>
            ))}
          </ol>

          <h4 className="mt-6 font-bold text-slate-950">Draft stop sequence</h4>
          <ol className="mt-3 space-y-2 rounded-2xl bg-slate-50 p-4">
            {journey.map.markers.features.map((marker) => (
              <li
                key={marker.id}
                className="flex items-center gap-3 text-sm text-slate-700"
              >
                <span
                  aria-hidden="true"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white"
                >
                  {marker.properties.sequence}
                </span>
                <span className="font-medium text-slate-900">
                  {marker.properties.name}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <footer className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)] gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => void copyJourneyLink()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-800 transition hover:bg-slate-50 focus:ring-4 focus:ring-slate-200 focus:outline-none"
          >
            {copyStatus === "copied" ? (
              <Check aria-hidden="true" className="size-5 text-emerald-700" />
            ) : (
              <Share2 aria-hidden="true" className="size-5" />
            )}
            <span className="hidden sm:inline">
              {copyStatus === "copied"
                ? "Copied"
                : copyStatus === "error"
                  ? "Copy failed"
                  : "Copy link"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => showJourneyOnMap()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white transition hover:bg-blue-800 focus:ring-4 focus:ring-blue-200 focus:outline-none"
          >
            <MapPinned aria-hidden="true" className="size-5" />
            Show this journey on the map
          </button>
        </footer>
      </dialog>
    </>
  );
}
