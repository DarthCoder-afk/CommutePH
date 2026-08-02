import Link from "next/link";
import { notFound } from "next/navigation";

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
                <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                      Segment {segment.position}
                    </span>

                    <span className="text-sm font-semibold text-slate-600">
                      {segment.kind === "walking"
                        ? "Walking"
                        : "Public transport"}
                    </span>
                  </div>

                  <h3 className="mt-4 text-lg font-bold">{segment.summary}</h3>

                  <ol className="mt-5 space-y-4">
                    {segment.steps.map((step) => (
                      <li key={step.id} className="flex items-start gap-3">
                        <span
                          aria-hidden="true"
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white"
                        >
                          {step.position}
                        </span>

                        <p className="pt-0.5 leading-6 text-slate-700">
                          <span className="sr-only">
                            Step {step.position}:{" "}
                          </span>
                          {step.instruction}
                        </p>
                      </li>
                    ))}
                  </ol>
                </article>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
