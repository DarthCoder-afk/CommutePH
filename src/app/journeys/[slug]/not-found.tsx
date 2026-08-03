import Link from "next/link";

export default function JourneyNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 text-slate-950">
      <section
        aria-labelledby="journey-not-found-heading"
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <p className="text-sm font-semibold text-blue-700">
          Journey unavailable
        </p>

        <h1
          id="journey-not-found-heading"
          className="mt-2 text-3xl font-bold tracking-tight"
        >
          We couldn’t find this journey
        </h1>

        <p className="mt-4 leading-7 text-slate-600">
          This journey may not exist, may be unpublished, or may still require
          verification.
        </p>

        <Link
          href="/"
          className="mt-6 inline-flex rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 focus:ring-4 focus:ring-blue-200 focus:outline-none"
        >
          Back to commute search
        </Link>
      </section>
    </main>
  );
}
