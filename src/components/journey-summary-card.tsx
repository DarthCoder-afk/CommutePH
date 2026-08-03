import Link from "next/link";
import { ArrowRight, BadgeCheck, Clock3, Coins, Repeat2 } from "lucide-react";

import type { JourneySummary } from "@/lib/journeys/journey-summary";

type JourneySummaryCardProps = {
  journey: JourneySummary;
  titleElement?: "h1" | "h3";
  showDetailsLink?: boolean;
};

function formatDuration(minMinutes: number, maxMinutes: number) {
  if (minMinutes === maxMinutes) {
    return `${minMinutes} min`;
  }

  return `${minMinutes}–${maxMinutes} min`;
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

  if (minCentavos === maxCentavos) {
    return minimumFare;
  }

  return `${minimumFare}–${maximumFare}`;
}

function formatVerificationDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function formatTransferCount(transferCount: number) {
  if (transferCount === 0) {
    return "No transfers";
  }

  if (transferCount === 1) {
    return "1 transfer";
  }

  return `${transferCount} transfers`;
}

export function JourneySummaryCard({
  journey,
  titleElement = "h3",
  showDetailsLink = true,
}: JourneySummaryCardProps) {
  const Title = titleElement;
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Title className="text-lg font-bold text-slate-950">
            {journey.title}
          </Title>

          <p className="mt-1 text-sm text-slate-600">
            {journey.origin.name} <span aria-hidden="true">→</span>{" "}
            <span className="sr-only">to </span>
            {journey.destination.name}
          </p>
        </div>

        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
          <BadgeCheck aria-hidden="true" className="size-4" />
          Verified
        </span>
      </div>

      <p className="mt-4 leading-7 text-slate-700">{journey.summary}</p>

      <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <Clock3 aria-hidden="true" className="size-4" />
            Duration
          </dt>

          <dd className="mt-1 font-semibold text-slate-950">
            {formatDuration(
              journey.estimatedDuration.minMinutes,
              journey.estimatedDuration.maxMinutes,
            )}
          </dd>
        </div>

        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <Coins aria-hidden="true" className="size-4" />
            Fare
          </dt>

          <dd className="mt-1 font-semibold text-slate-950">
            {formatFare(
              journey.estimatedFare.minCentavos,
              journey.estimatedFare.maxCentavos,
              journey.estimatedFare.currency,
            )}
          </dd>
        </div>

        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <Repeat2 aria-hidden="true" className="size-4" />
            Transfers
          </dt>

          <dd className="mt-1 font-semibold text-slate-950">
            {formatTransferCount(journey.transferCount)}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-slate-500">
        Last verified{" "}
        <time dateTime={journey.lastVerifiedAt}>
          {formatVerificationDate(journey.lastVerifiedAt)}
        </time>
      </p>

      {showDetailsLink ? (
        <Link
          href={`/journeys/${journey.slug}`}
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white transition hover:bg-blue-800 focus:ring-4 focus:ring-blue-200 focus:outline-none"
        >
          View step-by-step directions
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      ) : null}
    </article>
  );
}
