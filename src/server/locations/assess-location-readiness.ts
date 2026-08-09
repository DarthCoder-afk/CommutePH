import {
  isPublicVerificationCurrent,
  publicVerificationMaxAgeDays,
} from "@/server/verification/verification-freshness";

export type LocationReadinessRecord = {
  name: string;
  slug: string;
  kind: "area" | "landmark" | "station" | "terminal" | "stop" | "entrance";
  city: string;
  longitude: number;
  latitude: number;
  verificationStatus: "unverified" | "verified" | "outdated";
  lastVerifiedAt: Date | null;
  sourceType: "manual" | "openstreetmap" | "gtfs" | "development_fixture";
  sourceExternalId: string | null;
  sourceUrl: string | null;
  hasApprovedFieldVerification?: boolean;
};

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function assessLocationReadiness(
  location: LocationReadinessRecord,
  currentTime = new Date(),
) {
  const blockers: string[] = [];

  if (!location.name.trim()) {
    blockers.push("The location needs a name.");
  }

  if (!slugPattern.test(location.slug)) {
    blockers.push("The location needs a valid lowercase slug.");
  }

  if (!location.city.trim()) {
    blockers.push("The location needs a city.");
  }

  if (
    !Number.isFinite(location.longitude) ||
    location.longitude < -180 ||
    location.longitude > 180 ||
    !Number.isFinite(location.latitude) ||
    location.latitude < -90 ||
    location.latitude > 90
  ) {
    blockers.push("The location needs valid coordinates.");
  }

  if (location.verificationStatus !== "verified") {
    blockers.push('Verification status must be "verified".');
  }

  if (location.sourceType === "development_fixture") {
    blockers.push("Development fixture data cannot become publicly active.");
  }

  if (
    (location.sourceType === "openstreetmap" ||
      location.sourceType === "gtfs") &&
    !location.sourceExternalId?.trim()
  ) {
    blockers.push("The external source needs a stable identifier.");
  }

  if (
    location.sourceType !== "manual" &&
    (!location.sourceUrl || !isValidHttpUrl(location.sourceUrl))
  ) {
    blockers.push("The external source needs a valid HTTP source URL.");
  }

  if (
    (location.sourceType === "openstreetmap" ||
      location.sourceType === "gtfs") &&
    !location.hasApprovedFieldVerification
  ) {
    blockers.push(
      "The imported location needs an approved field-verification observation.",
    );
  }

  if (!isPublicVerificationCurrent(location.lastVerifiedAt, currentTime)) {
    blockers.push(
      `The location needs verification from within the last ${publicVerificationMaxAgeDays} days.`,
    );
  }

  return {
    isReady: blockers.length === 0,
    blockers,
  };
}
