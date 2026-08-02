import { CommuteSearchForm } from "@/components/commute-search-form";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-16 text-slate-950">
      <div className="mx-auto max-w-xl">
        <header>
          <p className="text-sm font-semibold tracking-widest text-blue-700 uppercase">
            CommuteMap PH
          </p>

          <h1 className="mt-3 text-4xl font-bold tracking-tight">
            Find your commute
          </h1>

          <p className="mt-4 text-lg leading-8 text-slate-600">
            Choose where you are coming from and where you want to go.
          </p>
        </header>

        <section
          aria-labelledby="commute-search-heading"
          className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 id="commute-search-heading" className="text-lg font-semibold">
            Search verified journeys
          </h2>

          <div className="mt-5">
            <CommuteSearchForm />
          </div>
        </section>
      </div>
    </main>
  );
}
