import {
  isPublicVerificationCurrent,
  publicVerificationMaxAgeDays,
} from "@/server/verification/verification-freshness";

export type RawTransportRouteScheduleRecord = {
  id: string;
  transportRouteId: string;
  position: number;
  serviceDays: string;
  operatingHours: string;
  publicNotes: string | null;
  lastVerifiedAt: Date | null;
  isActive: boolean;
};

export type AssembledPublishedRouteSchedule = {
  id: string;
  position: number;
  serviceDays: string;
  operatingHours: string;
  publicNotes: string | null;
  lastVerifiedAt: string;
};

function normalizeRequiredText(value: string, label: string) {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(`${label} cannot be blank.`);
  }

  return normalizedValue;
}

function normalizeOptionalText(value: string | null, label: string) {
  if (value === null) {
    return null;
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(`${label} cannot be blank.`);
  }

  return normalizedValue;
}

export function assemblePublishedRouteSchedules(
  transportRouteId: string,
  schedules: readonly RawTransportRouteScheduleRecord[],
  currentTime = new Date(),
): AssembledPublishedRouteSchedule[] {
  const normalizedRouteId = transportRouteId.trim();

  if (!normalizedRouteId) {
    throw new Error("A transport route ID is required.");
  }

  if (Number.isNaN(currentTime.getTime())) {
    throw new Error("The current time is invalid.");
  }

  const eligibleSchedules = schedules
    .filter(
      (schedule) =>
        schedule.transportRouteId === normalizedRouteId &&
        schedule.isActive &&
        schedule.lastVerifiedAt !== null,
    )
    .sort((first, second) => first.position - second.position);

  for (const [index, schedule] of eligibleSchedules.entries()) {
    const expectedPosition = index + 1;

    if (schedule.position !== expectedPosition) {
      throw new Error(
        `Published schedule positions must be gapless. Expected ${expectedPosition}, received ${schedule.position}.`,
      );
    }
  }

  return eligibleSchedules.map((schedule) => {
    const lastVerifiedAt = schedule.lastVerifiedAt;

    if (lastVerifiedAt === null) {
      throw new Error(
        `Schedule ${schedule.position} has no verification date.`,
      );
    }

    if (Number.isNaN(lastVerifiedAt.getTime())) {
      throw new Error(
        `Schedule ${schedule.position} has an invalid verification date.`,
      );
    }

    if (lastVerifiedAt > currentTime) {
      throw new Error(
        `Schedule ${schedule.position} has a future verification date.`,
      );
    }

    if (!isPublicVerificationCurrent(lastVerifiedAt, currentTime)) {
      throw new Error(
        `Schedule ${schedule.position} verification is older than ${publicVerificationMaxAgeDays} days.`,
      );
    }

    return {
      id: schedule.id,
      position: schedule.position,
      serviceDays: normalizeRequiredText(
        schedule.serviceDays,
        `Schedule ${schedule.position} service days`,
      ),
      operatingHours: normalizeRequiredText(
        schedule.operatingHours,
        `Schedule ${schedule.position} operating hours`,
      ),
      publicNotes: normalizeOptionalText(
        schedule.publicNotes,
        `Schedule ${schedule.position} public notes`,
      ),
      lastVerifiedAt: lastVerifiedAt.toISOString(),
    };
  });
}
