import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { OperationsLocationMap } from "@/components/operations-location-map";
import {
  isOperationsSessionValid,
  operationsCookieName,
} from "@/server/operations/auth";
import { getOperationsCatalog } from "@/server/operations/get-operations-catalog";

export const metadata: Metadata = { title: "Operations data review" };
export const dynamic = "force-dynamic";

function formatFare(minimum: number | null, maximum: number | null) {
  if (minimum === null || maximum === null) return "Unknown";

  const format = (value: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(value / 100);

  return minimum === maximum
    ? format(minimum)
    : `${format(minimum)}–${format(maximum)}`;
}

export default async function OperationsPage() {
  const cookieStore = await cookies();

  if (!isOperationsSessionValid(cookieStore.get(operationsCookieName)?.value)) {
    redirect("/operations/login");
  }

  const catalog = await getOperationsCatalog();
  const locationsById = new Map(
    catalog.locations.map((location) => [location.id, location]),
  );
  const routeStopsById = new Map(
    catalog.routeStops.map((stop) => [stop.id, stop]),
  );

  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6 lg:px-8"
    >
      <header className="flex flex-col gap-6 border-b border-slate-200 pb-8 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-700">
            Restricted operations
          </p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-950">
            Transport data review
          </h1>
          <p className="mt-3 max-w-3xl leading-7 text-slate-600">
            Inspect imported stops and draft journey structure before field
            verification. Records shown here are not public commuter guidance.
          </p>
        </div>

        <form action="/operations/session?logout=1" method="post">
          <button
            type="submit"
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold hover:bg-slate-50 focus:ring-4 focus:ring-slate-200 focus:outline-none"
          >
            Sign out
          </button>
        </form>
      </header>

      <div
        role="note"
        className="mt-8 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm leading-6 text-amber-950"
      >
        <strong>Unverified operational data.</strong> Orange and red records may
        be incomplete, incorrectly named, outdated, or unsuitable for boarding.
        Never use this view as passenger instructions.
      </div>

      <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Locations", catalog.locations.length],
          [
            "Imported OSM stops",
            catalog.locations.filter(
              (location) => location.sourceType === "openstreetmap",
            ).length,
          ],
          ["Transport routes", catalog.routes.length],
          ["Mapped route candidates", catalog.routeCandidates.length],
          [
            "Draft journeys",
            catalog.journeys.filter((journey) => !journey.isActive).length,
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-slate-200 bg-white p-5"
          >
            <dt className="text-sm font-medium text-slate-600">{label}</dt>
            <dd className="mt-1 text-3xl font-bold text-slate-950">{value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="operations-map-heading" className="mt-12">
        <h2 id="operations-map-heading" className="text-2xl font-bold">
          Imported stops and supported locations
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Click a marker to inspect its source, verification state, and whether
          it is publicly active.
        </p>
        <div className="mt-5">
          <OperationsLocationMap
            locations={catalog.locations}
            routes={catalog.routes.map((route) => ({
              id: route.id,
              name: route.name,
              stops: catalog.routeStops
                .filter((stop) => stop.transportRouteId === route.id)
                .map((stop) => ({
                  locationId: stop.locationId,
                  position: stop.position,
                })),
            }))}
          />
        </div>
      </section>

      <section
        aria-labelledby="operations-route-candidates-heading"
        className="mt-12"
      >
        <h2
          id="operations-route-candidates-heading"
          className="text-2xl font-bold"
        >
          Mapped route candidates
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Source relations are discovery leads only. Their member order, mode,
          signboard, stop access, and current operation require review before a
          stored transport route can be created.
        </p>

        {catalog.routeCandidates.length === 0 ? (
          <p className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
            No mapped route candidates have been imported.
          </p>
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {catalog.routeCandidates.map((candidate) => {
              const stops = catalog.routeCandidateStops.filter(
                (stop) => stop.transportRouteCandidateId === candidate.id,
              );
              const linkedStopCount = stops.filter(
                (stop) => stop.locationId !== null,
              ).length;

              return (
                <details
                  key={candidate.id}
                  className="group rounded-2xl border border-amber-200 bg-white open:shadow-sm"
                >
                  <summary className="cursor-pointer list-none p-5 marker:hidden">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-bold text-slate-950">
                          {candidate.name}
                        </h3>
                        <p className="mt-1 text-sm text-slate-600">
                          {candidate.rawMode.replaceAll("_", " ")} ·{" "}
                          {candidate.operator ?? "Operator unknown"}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          {candidate.originName ?? "Unknown origin"} →{" "}
                          {candidate.destinationName ?? "Unknown destination"}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                        {candidate.status}
                      </span>
                    </div>
                    <p className="mt-3 text-xs font-medium text-amber-800">
                      {linkedStopCount}/{stops.length} member stops linked ·
                      Click to inspect
                    </p>
                  </summary>

                  <div className="border-t border-amber-100 px-5 pt-4 pb-5">
                    <dl className="grid gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-slate-500">Reference</dt>
                        <dd className="font-medium">
                          {candidate.reference ?? "Unknown"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Via</dt>
                        <dd className="font-medium">
                          {candidate.via ?? "Unknown"}
                        </dd>
                      </div>
                    </dl>
                    <a
                      href={candidate.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex text-sm font-semibold text-blue-700 underline-offset-4 hover:underline"
                    >
                      Open source relation
                    </a>

                    {stops.length === 0 ? (
                      <p className="mt-4 text-sm text-slate-500">
                        The mapped relation has no ordered stop members.
                      </p>
                    ) : (
                      <ol className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
                        {stops.map((stop) => {
                          const linkedLocation = stop.locationId
                            ? locationsById.get(stop.locationId)
                            : null;

                          return (
                            <li
                              key={stop.id}
                              className="flex gap-3 rounded-xl bg-slate-50 p-3 text-sm"
                            >
                              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                                {stop.position}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate font-semibold">
                                  {linkedLocation?.name ??
                                    stop.mappedName ??
                                    stop.sourceExternalId}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {stop.rawRole ?? "role missing"} ·{" "}
                                  {linkedLocation
                                    ? "linked to imported stop"
                                    : "unresolved member"}
                                </p>
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="operations-routes-heading" className="mt-12">
        <h2 id="operations-routes-heading" className="text-2xl font-bold">
          Route stop sequences
        </h2>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {catalog.routes.map((route) => {
            const stops = catalog.routeStops.filter(
              (stop) => stop.transportRouteId === route.id,
            );

            return (
              <article
                key={route.id}
                className="rounded-2xl border border-slate-200 bg-white p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold">{route.name}</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {route.mode.replaceAll("_", " ")} ·{" "}
                      {route.operator ?? "Operator unknown"}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                    {route.verificationStatus}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  Signboard: {route.signboard ?? "Unknown"}
                </p>
                {stops.length === 0 ? (
                  <p className="mt-5 text-sm text-slate-500">
                    No stored stops.
                  </p>
                ) : (
                  <ol className="mt-5 space-y-3">
                    {stops.map((stop) => {
                      const location = locationsById.get(stop.locationId);

                      return (
                        <li key={stop.id} className="flex gap-3 text-sm">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-900 font-bold text-white">
                            {stop.position}
                          </span>
                          <div>
                            <p className="font-semibold">
                              {location?.name ?? "Missing location"}
                            </p>
                            <p className="mt-1 text-slate-600">
                              {stop.canBoard ? "Board" : "No boarding"} ·{" "}
                              {stop.canAlight ? "Alight" : "No alighting"}
                            </p>
                            {stop.pickupLandmark || stop.dropoffLandmark ? (
                              <p className="mt-1 text-slate-500">
                                {stop.pickupLandmark ?? stop.dropoffLandmark}
                              </p>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="operations-journeys-heading" className="mt-12">
        <h2 id="operations-journeys-heading" className="text-2xl font-bold">
          Draft ways to get there
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Structural drafts only. Durations, fares, paths, and instructions
          remain unknown until a complete field test is approved.
        </p>
        <div className="mt-5 space-y-6">
          {catalog.journeys.map((journey) => {
            const segments = catalog.segments.filter(
              (segment) => segment.journeyId === journey.id,
            );

            return (
              <article
                key={journey.id}
                className="rounded-2xl border border-slate-200 bg-white p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold">{journey.title}</h3>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                      {journey.summary}
                    </p>
                  </div>
                  <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-900">
                    {journey.status} · {journey.isActive ? "active" : "private"}
                  </span>
                </div>
                <ol className="mt-6 grid gap-4 lg:grid-cols-3">
                  {segments.map((segment) => {
                    const boardingStop = segment.boardingRouteStopId
                      ? routeStopsById.get(segment.boardingRouteStopId)
                      : null;
                    const alightingStop = segment.alightingRouteStopId
                      ? routeStopsById.get(segment.alightingRouteStopId)
                      : null;
                    const from = locationsById.get(
                      segment.walkingFromLocationId ??
                        boardingStop?.locationId ??
                        "",
                    );
                    const to = locationsById.get(
                      segment.walkingToLocationId ??
                        alightingStop?.locationId ??
                        "",
                    );

                    return (
                      <li
                        key={segment.id}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <p className="text-xs font-bold tracking-wide text-slate-500 uppercase">
                          Step {segment.position} · {segment.kind}
                        </p>
                        <p className="mt-2 font-semibold">{segment.summary}</p>
                        <p className="mt-2 text-sm text-slate-600">
                          {from?.name ?? "Unknown start"} →{" "}
                          {to?.name ?? "Unknown end"}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          Duration: {segment.estimatedDurationMin ?? "?"}–
                          {segment.estimatedDurationMax ?? "?"} min · Fare:{" "}
                          {formatFare(
                            segment.estimatedFareMinCentavos,
                            segment.estimatedFareMaxCentavos,
                          )}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
