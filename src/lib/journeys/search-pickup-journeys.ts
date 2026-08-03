type PickupCandidate = {
  location: {
    id: string;
    slug: string;
  };
};

export type PickupJourneyMatch<Candidate extends PickupCandidate, Journey> = {
  candidate: Candidate;
  journeys: Journey[];
};

export async function searchPickupJourneys<
  Candidate extends PickupCandidate,
  Journey,
>({
  candidates,
  destinationSlug,
  searchJourneys,
}: {
  candidates: readonly Candidate[];
  destinationSlug: string;
  searchJourneys: (
    originSlug: string,
    destinationSlug: string,
  ) => Promise<Journey[]>;
}): Promise<PickupJourneyMatch<Candidate, Journey>[]> {
  const eligibleCandidates = candidates.filter(
    (candidate) => candidate.location.slug !== destinationSlug,
  );

  const results = await Promise.all(
    eligibleCandidates.map(async (candidate) => ({
      candidate,
      journeys: await searchJourneys(candidate.location.slug, destinationSlug),
    })),
  );

  return results.filter((result) => result.journeys.length > 0);
}
