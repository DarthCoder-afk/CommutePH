export const locationDuplicateReviewDecisions = [
  "distinct",
  "duplicate",
  "needs_field_check",
] as const;

export type LocationDuplicateReviewDecision =
  (typeof locationDuplicateReviewDecisions)[number];

export function canonicalizeLocationPair(firstId: string, secondId: string) {
  if (firstId === secondId) {
    throw new Error("A location cannot be reviewed against itself.");
  }

  return firstId < secondId
    ? { firstLocationId: firstId, secondLocationId: secondId }
    : { firstLocationId: secondId, secondLocationId: firstId };
}

export function validateLocationDuplicateReviewDecision(
  status: string,
  notes: string,
) {
  if (
    !locationDuplicateReviewDecisions.includes(
      status as LocationDuplicateReviewDecision,
    )
  ) {
    throw new Error(
      `Decision must be one of: ${locationDuplicateReviewDecisions.join(", ")}.`,
    );
  }

  const normalizedNotes = notes.trim();

  if (normalizedNotes.length < 10) {
    throw new Error("Review notes must contain at least 10 characters.");
  }

  return {
    status: status as LocationDuplicateReviewDecision,
    notes: normalizedNotes,
  };
}
