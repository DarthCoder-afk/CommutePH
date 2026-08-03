import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Clock3,
  Coins,
  Footprints,
  Sparkles,
} from "lucide-react";

import { formatApproximateDistance } from "@/lib/geolocation/format-distance";
import type { CurrentLocationJourneyOption } from "@/lib/journeys/build-current-location-journey-options";

type CurrentLocationJourneyOptionCardProps = {
  option: CurrentLocationJourneyOption;
  isSelectedPickup: boolean;
};

function formatDuration(minMinutes: number, maxMinutes: number) {
  return minMinutes === maxMinutes
    ? `${minMinutes} min`
    : `${minMinutes}–${maxMinutes} min`;
}

function formatFare(
  minCentavos: number,
  maxCentavos: number,
  currency: string,
) {
  const formatter = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  const minimumFare = formatter.format(minCentavos / 100);
  const maximumFare = formatter.format(maxCentavos / 100);

  return minCentavos === maxCentavos
    ? minimumFare
    : `${minimumFare}–${maximumFare}`;
}

export function CurrentLocationJourneyOptionCard({
  option,
  isSelectedPickup,
}: CurrentLocationJourneyOptionCardProps) {
  return (
    <article
      className={`rounded-2xl border bg-white p-5 shadow-sm ${
        option.isRecommended
          ? "border-blue-300 ring-2 ring-blue-100"
          : "border-slate-200"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {option.isRecommended ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-700 px-2.5 py-1 text-xs font-semibold text-white">
                <Sparkles aria-hidden="true" className="size-3.5" />
                Recommended
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                Option {option.rank}
              </span>
            )}

            {isSelectedPickup ? (
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                Selected pickup
              </span>
            ) : null}
          </div>

          <h3 className="mt-3 text-lg font-bold text-slate-950">
            Via {option.pickup.name}
          </h3>

          <p className="mt-1 text-sm text-slate-600">
            Current location <span aria-hidden="true">→</span>{" "}
            {option.pickup.name} <span aria-hidden="true">→</span>{" "}
            {option.publishedJourney.destination.name}
          </p>
        </div>

        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
          <BadgeCheck aria-hidden="true" className="size-4" />
          Transit verified
        </span>
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <Clock3 aria-hidden="true" className="size-4" />
            Total time
          </dt>
          <dd className="mt-1 font-semibold text-slate-950">
            {formatDuration(
              option.estimatedTotalDuration.minMinutes,
              option.estimatedTotalDuration.maxMinutes,
            )}
          </dd>
        </div>

        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <Coins aria-hidden="true" className="size-4" />
            Transit fare
          </dt>
          <dd className="mt-1 font-semibold text-slate-950">
            {formatFare(
              option.estimatedFare.minCentavos,
              option.estimatedFare.maxCentavos,
              option.estimatedFare.currency,
            )}
          </dd>
        </div>

        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <Footprints aria-hidden="true" className="size-4" />
            Initial walk
          </dt>
          <dd className="mt-1 font-semibold text-slate-950">
            {formatApproximateDistance(
              option.initialWalkingSegment.estimatedDistanceMeters,
            )}
          </dd>
          <dd className="mt-1 text-xs text-slate-500">
            {formatDuration(
              option.initialWalkingSegment.estimatedDuration.minMinutes,
              option.initialWalkingSegment.estimatedDuration.maxMinutes,
            )}
          </dd>
        </div>
      </dl>

      <ol className="mt-5 space-y-3" aria-label="Complete commute overview">
        <li className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
          <span className="font-semibold">1. Estimated initial walk:</span>{" "}
          {option.initialWalkingSegment.summary}
        </li>
        <li className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-950">
          <span className="font-semibold">2. Verified journey:</span>{" "}
          {option.publishedJourney.title}
        </li>
      </ol>

      <p className="mt-4 text-xs leading-5 text-slate-500">
        Total time includes an approximate initial walk. The displayed walking
        distance covers only that initial segment; walking contained within the
        published journey is not included in the distance total yet.
      </p>

      <Link
        href={`/journeys/${option.publishedJourney.slug}`}
        className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white transition hover:bg-blue-800 focus:ring-4 focus:ring-blue-200 focus:outline-none"
      >
        View verified transit directions
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </article>
  );
}
