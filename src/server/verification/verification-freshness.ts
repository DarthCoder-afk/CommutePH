export const publicVerificationMaxAgeDays = 90;

const millisecondsPerDay = 24 * 60 * 60 * 1_000;

export function getPublicVerificationCutoff(currentTime: Date) {
  const currentTimestamp = currentTime.getTime();

  if (Number.isNaN(currentTimestamp)) {
    throw new Error("Current time must be a valid date.");
  }

  return new Date(
    currentTimestamp - publicVerificationMaxAgeDays * millisecondsPerDay,
  );
}

export function isPublicVerificationCurrent(
  lastVerifiedAt: Date | null,
  currentTime: Date,
) {
  if (lastVerifiedAt === null) {
    return false;
  }

  const verificationTimestamp = lastVerifiedAt.getTime();
  const currentTimestamp = currentTime.getTime();

  if (Number.isNaN(verificationTimestamp) || Number.isNaN(currentTimestamp)) {
    return false;
  }

  if (verificationTimestamp > currentTimestamp) {
    return false;
  }

  return (
    verificationTimestamp >= getPublicVerificationCutoff(currentTime).getTime()
  );
}
