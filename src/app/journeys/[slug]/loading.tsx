export default function JourneyLoading() {
  return (
    <main
      aria-busy="true"
      aria-labelledby="journey-loading-heading"
      className="flex-1 bg-slate-50 px-4 py-12 text-slate-950"
    >
      <div className="mx-auto max-w-3xl">
        <p
          id="journey-loading-heading"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          Loading journey details
        </p>

        <div
          aria-hidden="true"
          className="h-5 w-36 animate-pulse rounded bg-slate-200"
        />

        <section className="mt-6 animate-pulse rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="h-6 w-52 rounded bg-slate-200" />
            <div className="h-7 w-20 rounded-full bg-emerald-100" />
          </div>

          <div className="mt-3 h-4 w-44 rounded bg-slate-200" />
          <div className="mt-5 h-4 w-full rounded bg-slate-100" />
          <div className="mt-2 h-4 w-4/5 rounded bg-slate-100" />

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-20 rounded-xl bg-slate-100" />
            ))}
          </div>
        </section>

        <section className="mt-8">
          <div
            aria-hidden="true"
            className="h-8 w-40 animate-pulse rounded bg-slate-200"
          />

          <div
            aria-hidden="true"
            className="mt-5 h-80 animate-pulse rounded-2xl bg-slate-200"
          />
        </section>

        <section className="mt-8">
          <div
            aria-hidden="true"
            className="h-8 w-64 animate-pulse rounded bg-slate-200"
          />

          <div className="mt-6 space-y-5">
            {Array.from({ length: 2 }).map((_, index) => (
              <div
                key={index}
                aria-hidden="true"
                className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-4"
              >
                <div className="flex justify-center">
                  <div className="size-10 animate-pulse rounded-full bg-slate-200" />
                </div>

                <div className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
