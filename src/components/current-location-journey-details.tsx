"use client";

import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Clock3,
  Footprints,
  MapPin,
} from "lucide-react";

import { useCurrentLocationOrigin } from "@/components/current-location-origin-context";
import { JourneySegmentCard } from "@/components/journey-segment-card";
import { formatApproximateDistance } from "@/lib/geolocation/format-distance";

function formatDuration(minMinutes: number, maxMinutes: number) {
  return minMinutes === maxMinutes
    ? minMinutes + " min"
    : minMinutes + "–" + maxMinutes + " min";
}

function formatVerificationDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

export function CurrentLocationJourneyDetails() {
  const {
    selectedCurrentLocationJourneyDetail,
    selectedCurrentLocationJourneyOption,
    selectedJourneyDetailStatus,
  } = useCurrentLocationOrigin();

  if (!selectedCurrentLocationJourneyOption) {
    return null;
  }

  if (selectedJourneyDetailStatus === "loading") {
    return (
      <section
        aria-labelledby="complete-directions-heading"
        aria-busy="true"
        className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <h3
          id="complete-directions-heading"
          className="text-2xl font-bold text-slate-950"
        >
          Complete directions
        </h3>

        <p role="status" aria-live="polite" className="mt-3 text-slate-600">
          Loading verified journey instructions…
        </p>
      </section>
    );
  }

  if (
    selectedJourneyDetailStatus === "error" ||
    !selectedCurrentLocationJourneyDetail
  ) {
    return (
      <section
        aria-labelledby="complete-directions-heading"
        className="mt-8 rounded-3xl border border-amber-200 bg-amber-50 p-6 sm:p-8"
      >
        <h3
          id="complete-directions-heading"
          className="text-xl font-bold text-amber-950"
        >
          Complete directions are unavailable
        </h3>

        <p role="alert" className="mt-2 text-sm leading-6 text-amber-900">
          The selected verified journey could not be loaded. You can still open
          its standalone transit directions.
        </p>

        <Link
          href={
            "/journeys/" +
            selectedCurrentLocationJourneyOption.publishedJourney.slug
          }
          className="mt-4 inline-flex items-center gap-2 font-semibold text-amber-950 underline underline-offset-4 focus:ring-4 focus:ring-amber-200 focus:outline-none"
        >
          Open transit directions
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </section>
    );
  }

  const { initialWalkingSegment } = selectedCurrentLocationJourneyOption;
  const journey = selectedCurrentLocationJourneyDetail;

  return (
    <section
      aria-labelledby="complete-directions-heading"
      className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm sm:p-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-blue-700">
            Selected commute option
          </p>

          <h3
            id="complete-directions-heading"
            className="mt-2 text-2xl font-bold tracking-tight text-slate-950"
          >
            Complete directions from your current location
          </h3>

          <p className="mt-2 max-w-3xl leading-7 text-slate-600">
            Start with an estimated walk to{" "}
            {selectedCurrentLocationJourneyOption.pickup.name}, then follow the
            verified steps for {journey.title}.
          </p>
        </div>

        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-800">
          <BadgeCheck aria-hidden="true" className="size-4" />
          Transit verified{" "}
          <time dateTime={journey.lastVerifiedAt}>
            {formatVerificationDate(journey.lastVerifiedAt)}
          </time>
        </span>
      </div>

      <aside className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        The first walking segment is an estimate based on straight-line
        proximity. It is not a pedestrian route and has not been field-verified.
        All following instructions come from the selected verified journey.
      </aside>

      <ol aria-label="Complete journey instructions" className="mt-6 space-y-5">
        <li>
          <article className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                Segment 1
              </span>

              <span className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                <Footprints aria-hidden="true" className="size-4" />
                Estimated walking
              </span>
            </div>

            <h4 className="mt-4 text-lg font-bold text-slate-950">
              {initialWalkingSegment.summary}
            </h4>

            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-amber-50 p-3">
                <dt className="flex items-center gap-2 text-xs font-semibold tracking-wide text-amber-800 uppercase">
                  <MapPin aria-hidden="true" className="size-4" />
                  From
                </dt>
                <dd className="mt-1 font-semibold text-slate-950">
                  Current location
                </dd>
              </div>

              <div className="rounded-xl bg-amber-50 p-3">
                <dt className="flex items-center gap-2 text-xs font-semibold tracking-wide text-amber-800 uppercase">
                  <MapPin aria-hidden="true" className="size-4" />
                  To
                </dt>
                <dd className="mt-1 font-semibold text-slate-950">
                  {selectedCurrentLocationJourneyOption.pickup.name}
                </dd>
              </div>

              <div className="rounded-xl bg-amber-50 p-3">
                <dt className="flex items-center gap-2 text-xs font-semibold tracking-wide text-amber-800 uppercase">
                  <Clock3 aria-hidden="true" className="size-4" />
                  Estimate
                </dt>
                <dd className="mt-1 font-semibold text-slate-950">
                  {formatApproximateDistance(
                    initialWalkingSegment.estimatedDistanceMeters,
                  )}{" "}
                  ·{" "}
                  {formatDuration(
                    initialWalkingSegment.estimatedDuration.minMinutes,
                    initialWalkingSegment.estimatedDuration.maxMinutes,
                  )}
                </dd>
              </div>
            </dl>
          </article>
        </li>

        {journey.segments.map((segment, index) => (
          <li key={segment.id}>
            <JourneySegmentCard segment={segment} displayPosition={index + 2} />
          </li>
        ))}
      </ol>

      <div className="mt-6 border-t border-slate-200 pt-6">
        <Link
          href={"/journeys/" + journey.slug}
          className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-3 font-semibold text-blue-800 transition hover:bg-blue-50 focus:ring-4 focus:ring-blue-100 focus:outline-none"
        >
          Open standalone transit directions
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </section>
  );
}
