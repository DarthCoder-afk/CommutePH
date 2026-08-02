import Link from "next/link";
import { notFound } from "next/navigation";

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
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-950">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="inline-flex text-sm font-semibold text-blue-700 hover:text-blue-900 hover:underline focus:ring-4 focus:ring-blue-100 focus:outline-none"
        >
          <span className="mr-2" aria-hidden="true">
            ←
          </span>
          Back to commute search
        </Link>

        <div className="mt-6">
          <JourneySummaryCard
            journey={journey}
            titleElement="h1"
            showDetailsLink={false}
          />
        </div>

        <section aria-labelledby="directions-heading" className="mt-8">
          <h2
            id="directions-heading"
            className="text-2xl font-bold tracking-tight"
          >
            Step-by-step directions
          </h2>

          <ol className="mt-5 space-y-5">
            {journey.segments.map((segment) => (
              <li key={segment.id}>
                <JourneySegmentCard segment={segment} />
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
