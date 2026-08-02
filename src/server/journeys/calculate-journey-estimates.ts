export type JourneyEstimateSegment = {
  id: string;
  position: number;
  kind: "walking" | "transit";
  estimatedDurationMin: number | null;
  estimatedDurationMax: number | null;
  estimatedFareMinCentavos: number | null;
  estimatedFareMaxCentavos: number | null;
};

type CompleteRange = {
  minimum: number;
  maximum: number;
};

function requireCompleteRange(
  minimum: number | null,
  maximum: number | null,
  label: string,
  minimumAllowedValue: number,
): CompleteRange {
  if (minimum === null || maximum === null) {
    throw new Error(`${label} must have a complete range.`);
  }

  if (!Number.isInteger(minimum) || !Number.isInteger(maximum)) {
    throw new Error(`${label} values must be integers.`);
  }

  if (minimum < minimumAllowedValue) {
    throw new Error(
      `${label} minimum must be at least ${minimumAllowedValue}.`,
    );
  }

  if (maximum < minimum) {
    throw new Error(
      `${label} maximum must be greater than or equal to its minimum.`,
    );
  }

  return {
    minimum,
    maximum,
  };
}

export function calculateJourneyEstimates(
  segments: readonly JourneyEstimateSegment[],
) {
  if (segments.length === 0) {
    throw new Error("A journey must have at least one segment.");
  }

  const orderedSegments = [...segments].sort(
    (firstSegment, secondSegment) =>
      firstSegment.position - secondSegment.position,
  );

  let durationMinMinutes = 0;
  let durationMaxMinutes = 0;
  let fareMinCentavos = 0;
  let fareMaxCentavos = 0;
  let transitSegmentCount = 0;

  for (const [index, segment] of orderedSegments.entries()) {
    const expectedPosition = index + 1;

    if (segment.position !== expectedPosition) {
      throw new Error(
        `Journey segment positions must be gapless. Expected ${expectedPosition}, received ${segment.position}.`,
      );
    }

    const duration = requireCompleteRange(
      segment.estimatedDurationMin,
      segment.estimatedDurationMax,
      `Segment ${segment.position} duration`,
      1,
    );

    durationMinMinutes += duration.minimum;
    durationMaxMinutes += duration.maximum;

    if (segment.kind === "walking") {
      if (
        segment.estimatedFareMinCentavos !== null ||
        segment.estimatedFareMaxCentavos !== null
      ) {
        throw new Error(
          `Walking segment ${segment.position} must not have a fare.`,
        );
      }

      continue;
    }

    transitSegmentCount += 1;

    const fare = requireCompleteRange(
      segment.estimatedFareMinCentavos,
      segment.estimatedFareMaxCentavos,
      `Transit segment ${segment.position} fare`,
      0,
    );

    fareMinCentavos += fare.minimum;
    fareMaxCentavos += fare.maximum;
  }

  return {
    orderedSegments,
    estimatedDuration: {
      minMinutes: durationMinMinutes,
      maxMinutes: durationMaxMinutes,
    },
    estimatedFare: {
      minCentavos: fareMinCentavos,
      maxCentavos: fareMaxCentavos,
      currency: "PHP" as const,
    },
    transferCount: Math.max(0, transitSegmentCount - 1),
  };
}
