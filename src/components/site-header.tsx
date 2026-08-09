import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <a
        href="#main-content"
        className="absolute top-2 left-2 z-50 -translate-y-20 rounded-lg bg-slate-950 px-4 py-3 font-semibold text-white transition-transform focus:translate-y-0 focus:outline-none"
      >
        Skip to main content
      </a>

      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          aria-label="CommuteMap PH home"
          className="inline-flex min-h-11 items-center gap-3 rounded-lg focus:ring-4 focus:ring-blue-100 focus:outline-none"
        >
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-xl bg-blue-700 text-xs font-bold tracking-wide text-white shadow-sm"
          >
            CM
          </span>

          <span className="font-bold tracking-tight text-slate-950">
            CommuteMap <span className="text-blue-700">PH</span>
          </span>
        </Link>

        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
          <span
            aria-hidden="true"
            className="size-2 rounded-full bg-emerald-600"
          />
          Verified data only
        </div>
      </div>
    </header>
  );
}
