import { CommuteMap } from "@/components/commute-map";
import { CommuteSearchForm } from "@/components/commute-search-form";

const benefits = [
  {
    title: "Clear steps",
    description: "Boarding points, transfers, and landmarks.",
  },
  {
    title: "Useful estimates",
    description: "Expected duration and Philippine peso fare ranges.",
  },
  {
    title: "Verified updates",
    description: "Only reviewed journeys appear publicly.",
  },
];

export default function Home() {
  return (
    <main className="relative isolate flex-1 overflow-hidden px-4 py-12 sm:px-6 sm:py-20">
      <div
        aria-hidden="true"
        className="absolute top-0 left-1/2 -z-10 size-96 -translate-x-1/2 rounded-full bg-blue-100/70 blur-3xl"
      />

      <div className="mx-auto grid max-w-6xl items-start gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)] lg:gap-16">
        <header className="pt-4 lg:pt-10">
          <p className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-800">
            Verified commute guidance
          </p>

          <h1 className="mt-6 max-w-3xl text-4xl font-bold tracking-tight text-balance text-slate-950 sm:text-5xl lg:text-6xl">
            Plan a clearer commute across the Philippines.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            Search reviewed public transport journeys with practical boarding
            guidance, fare estimates, and step-by-step directions.
          </p>

          <dl className="mt-10 grid gap-6 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {benefits.map((benefit) => (
              <div key={benefit.title}>
                <dt className="font-semibold text-slate-950">
                  {benefit.title}
                </dt>
                <dd className="mt-1 text-sm leading-6 text-slate-600">
                  {benefit.description}
                </dd>
              </div>
            ))}
          </dl>
        </header>

        <section
          aria-labelledby="commute-search-heading"
          className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8"
        >
          <p className="text-sm font-semibold text-blue-700">
            Start your journey
          </p>

          <h2
            id="commute-search-heading"
            className="mt-2 text-2xl font-bold tracking-tight"
          >
            Where are you going?
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Choose a verified starting point and destination.
          </p>

          <div className="mt-6">
            <CommuteSearchForm />
          </div>
        </section>
      </div>

      <section
        aria-labelledby="commute-map-heading"
        className="mx-auto mt-14 max-w-6xl sm:mt-16"
      >
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-blue-700">Commute map</p>

          <h2
            id="commute-map-heading"
            className="mt-2 text-3xl font-bold tracking-tight text-slate-950"
          >
            Explore the service area
          </h2>

          <p className="mt-3 leading-7 text-slate-600">
            Search uses curated CommuteMap PH locations. Journey markers and
            paths appear only when matching guidance is available.
          </p>
        </div>

        <div className="mt-6">
          <CommuteMap />
        </div>
      </section>
    </main>
  );
}
