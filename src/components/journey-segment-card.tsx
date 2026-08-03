import type { AssembledJourneySegment } from "@/server/journeys/assemble-journey-segments";

type JourneySegmentCardProps = {
  segment: AssembledJourneySegment;
};

const transportModeLabels = {
  jeepney: "Jeepney",
  modern_jeepney: "Modern jeepney",
  city_bus: "City bus",
  bgc_bus: "BGC Bus",
} satisfies Record<
  Extract<AssembledJourneySegment, { kind: "transit" }>["route"]["mode"],
  string
>;

function formatDuration(minMinutes: number, maxMinutes: number) {
  if (minMinutes === maxMinutes) {
    return `${minMinutes} min`;
  }

  return `${minMinutes}–${maxMinutes} min`;
}

function formatFare(minCentavos: number, maxCentavos: number) {
  const formatter = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  const minimum = formatter.format(minCentavos / 100);
  const maximum = formatter.format(maxCentavos / 100);

  return minCentavos === maxCentavos ? minimum : `${minimum}–${maximum}`;
}

function formatVerificationDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

export function JourneySegmentCard({ segment }: JourneySegmentCardProps) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
          Segment {segment.position}
        </span>

        <span className="text-sm font-semibold text-slate-600">
          {segment.kind === "walking"
            ? "Walking"
            : transportModeLabels[segment.route.mode]}
        </span>
      </div>

      <h3 className="mt-4 text-lg font-bold text-slate-950">
        {segment.summary}
      </h3>

      {segment.kind === "walking" ? (
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              From
            </dt>
            <dd className="mt-1 font-semibold text-slate-950">
              {segment.from.name}
            </dd>
          </div>

          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              To
            </dt>
            <dd className="mt-1 font-semibold text-slate-950">
              {segment.to.name}
            </dd>
          </div>
        </dl>
      ) : (
        <>
          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Route
            </p>

            <p className="mt-1 font-bold text-slate-950">
              {segment.route.name}
            </p>

            <p className="mt-1 text-sm text-slate-600">
              {transportModeLabels[segment.route.mode]}
              {segment.route.operator ? ` · ${segment.route.operator}` : null}
            </p>

            {segment.route.signboard ? (
              <p className="mt-2 text-sm text-slate-700">
                <span className="font-semibold">Signboard:</span>{" "}
                {segment.route.signboard}
              </p>
            ) : null}

            {segment.route.schedules.length > 0 ? (
              <section
                aria-label={`${segment.route.name} operating schedule`}
                className="mt-4 border-t border-slate-200 pt-4"
              >
                <h4 className="text-sm font-bold text-slate-950">
                  Operating schedule
                </h4>

                <ul className="mt-3 space-y-3">
                  {segment.route.schedules.map((schedule) => (
                    <li
                      key={schedule.id}
                      className="rounded-lg border border-slate-200 bg-white p-3"
                    >
                      <p className="text-sm font-semibold text-slate-950">
                        {schedule.serviceDays}
                      </p>

                      <p className="mt-1 text-sm text-slate-700">
                        {schedule.operatingHours}
                      </p>

                      {schedule.publicNotes ? (
                        <p className="mt-2 text-sm leading-6 text-amber-900">
                          {schedule.publicNotes}
                        </p>
                      ) : null}

                      <p className="mt-2 text-xs text-slate-500">
                        Schedule verified{" "}
                        <time dateTime={schedule.lastVerifiedAt}>
                          {formatVerificationDate(schedule.lastVerifiedAt)}
                        </time>
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4">
              <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Board at
              </dt>

              <dd className="mt-1">
                <p className="font-semibold text-slate-950">
                  {segment.boardingStop.location.name}
                </p>

                {segment.boardingStop.landmark ? (
                  <p className="mt-2 text-sm text-slate-600">
                    <span className="font-semibold">Landmark:</span>{" "}
                    {segment.boardingStop.landmark}
                  </p>
                ) : null}

                {segment.boardingStop.instructions ? (
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {segment.boardingStop.instructions}
                  </p>
                ) : null}
              </dd>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Get off at
              </dt>

              <dd className="mt-1">
                <p className="font-semibold text-slate-950">
                  {segment.alightingStop.location.name}
                </p>

                {segment.alightingStop.landmark ? (
                  <p className="mt-2 text-sm text-slate-600">
                    <span className="font-semibold">Landmark:</span>{" "}
                    {segment.alightingStop.landmark}
                  </p>
                ) : null}

                {segment.alightingStop.instructions ? (
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {segment.alightingStop.instructions}
                  </p>
                ) : null}
              </dd>
            </div>
          </dl>
        </>
      )}

      {segment.estimatedDuration || segment.estimatedFare ? (
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {segment.estimatedDuration ? (
            <div className="flex gap-2">
              <dt className="font-semibold text-slate-600">Duration:</dt>
              <dd className="text-slate-800">
                {formatDuration(
                  segment.estimatedDuration.minMinutes,
                  segment.estimatedDuration.maxMinutes,
                )}
              </dd>
            </div>
          ) : null}

          {segment.estimatedFare ? (
            <div className="flex gap-2">
              <dt className="font-semibold text-slate-600">Fare:</dt>
              <dd className="text-slate-800">
                {formatFare(
                  segment.estimatedFare.minCentavos,
                  segment.estimatedFare.maxCentavos,
                )}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {segment.publicNotes ? (
        <aside
          aria-label={`Important note for segment ${segment.position}`}
          className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950"
        >
          <p className="text-sm font-bold">Important note</p>

          <p className="mt-1 text-sm leading-6">{segment.publicNotes}</p>
        </aside>
      ) : null}

      <ol
        aria-label={`Instructions for segment ${segment.position}`}
        className="mt-5 space-y-4 border-t border-slate-200 pt-5"
      >
        {segment.steps.map((step) => (
          <li key={step.id} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white"
            >
              {step.position}
            </span>

            <p className="pt-0.5 leading-6 text-slate-700">
              <span className="sr-only">Step {step.position}: </span>
              {step.instruction}
            </p>
          </li>
        ))}
      </ol>
    </article>
  );
}
