"use client";

import { useEffect } from "react";
import Link from "next/link";

type JourneyErrorProps = {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
};

export default function JourneyError({ error, reset }: JourneyErrorProps) {
  useEffect(() => {
    console.error("Journey detail page failed:", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 text-slate-950">
      <section
        role="alert"
        aria-labelledby="journey-error-heading"
        className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-8 shadow-sm"
      >
        <p className="text-sm font-semibold text-red-700">
          Something went wrong
        </p>

        <h1
          id="journey-error-heading"
          className="mt-2 text-3xl font-bold tracking-tight"
        >
          We couldn’t load this journey
        </h1>

        <p className="mt-4 leading-7 text-slate-600">
          The journey is temporarily unavailable. You can try again or return to
          the commute search.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 focus:ring-4 focus:ring-blue-200 focus:outline-none"
          >
            Try again
          </button>

          <Link
            href="/"
            className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-100 focus:ring-4 focus:ring-slate-200 focus:outline-none"
          >
            Back to search
          </Link>
        </div>
      </section>
    </main>
  );
}
