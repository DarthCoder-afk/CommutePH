import { ArrowLeft, BusFront, Footprints } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { JourneyMap } from "@/components/journey-map";
import { JourneySegmentCard } from "@/components/journey-segment-card";
import { JourneySummaryCard } from "@/components/journey-summary-card";
import { getPublishedJourneyDetail } from "@/server/journeys/get-published-journey-detail";

export const dynamic = "force-dynamic";

const journeySlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type JourneyPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function JourneyPage({ params }: JourneyPageProps) {
  const { slug } = await params;

  if (slug.length > 200 || !journeySlugPattern.test(slug)) {
    notFound();
  }

  const journey = await getPublishedJourneyDetail(slug);

  if (!journey) {
    notFound();
  }

  return (
    <main className="flex-1 bg-slate-50 px-4 py-12 text-slate-950">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="inline-flex items-center text-sm font-semibold text-blue-700 hover:text-blue-900 hover:underline focus:ring-4 focus:ring-blue-100 focus:outline-none"
        >
          <ArrowLeft aria-hidden="true" className="mr-2 size-4" />
          Back to commute search
        </Link>

        <div className="mt-6">
          <JourneySummaryCard
            journey={journey}
            titleElement="h1"
            showDetailsLink={false}
          />
        </div>

        <section aria-labelledby="journey-map-heading" className="mt-8">
          <h2
            id="journey-map-heading"
            className="text-2xl font-bold tracking-tight"
          >
            Journey map
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            The map shows only verified journey locations and route paths.
            Journeys without verified path geometry remain marker-only.
          </p>

          <div className="mt-5">
            <JourneyMap
              markers={journey.map.markers}
              paths={journey.map.paths}
            />
          </div>
        </section>

        <section aria-labelledby="directions-heading" className="mt-8">
          <h2
            id="directions-heading"
            className="text-2xl font-bold tracking-tight"
          >
            Step-by-step directions
          </h2>

          <ol className="mt-6 space-y-5">
            {journey.segments.map((segment, index) => {
              const isWalking = segment.kind === "walking";
              const isLastSegment = index === journey.segments.length - 1;

              return (
                <li
                  key={segment.id}
                  className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-4"
                >
                  <div className="relative flex justify-center">
                    {!isLastSegment ? (
                      <span
                        aria-hidden="true"
                        className="absolute top-10 -bottom-5 w-0.5 bg-slate-200"
                      />
                    ) : null}

                    <span
                      aria-hidden="true"
                      className={`relative z-10 flex size-10 items-center justify-center rounded-full border ${
                        isWalking
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-blue-200 bg-blue-50 text-blue-700"
                      }`}
                    >
                      {isWalking ? (
                        <Footprints className="size-5" />
                      ) : (
                        <BusFront className="size-5" />
                      )}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <JourneySegmentCard segment={segment} />
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </main>
  );
}
