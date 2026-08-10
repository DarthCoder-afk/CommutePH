import "dotenv/config";

import { and, eq, inArray, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  journeyFieldObservations,
  journeyFixtureLocationReplacements,
  journeySegments,
  journeys,
  locations,
  routeFieldObservations,
  transportRoutes,
  transportRouteStops,
} from "@/server/db/schema";
import {
  assessDraftFixtureReplacement,
  maximumFixtureReplacementDistanceMeters,
} from "@/server/locations/assess-draft-fixture-replacement";

function parseArguments(arguments_: string[]) {
  const values = arguments_.filter((argument) => argument !== "--");
  const apply = values.includes("--apply");
  const metadataFlags = new Set([
    "--apply",
    "--confirmed-by",
    "--notes",
    "--evidence-url",
  ]);
  const positional: string[] = [];
  let confirmedBy = "";
  let notes = "";
  let evidenceUrl: string | null = null;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === "--apply") continue;

    if (
      value === "--confirmed-by" ||
      value === "--notes" ||
      value === "--evidence-url"
    ) {
      const metadataValue = values[index + 1]?.trim();

      if (!metadataValue || metadataFlags.has(metadataValue)) {
        throw new Error(`${value} requires a quoted value.`);
      }

      if (value === "--confirmed-by") confirmedBy = metadataValue;
      if (value === "--notes") notes = metadataValue;
      if (value === "--evidence-url") evidenceUrl = metadataValue;
      index += 1;
      continue;
    }

    positional.push(value);
  }

  const [journeySlug, fixtureSlug, replacementSlug] = positional;

  if (!journeySlug || !fixtureSlug || !replacementSlug) {
    throw new Error(
      "Usage: pnpm db:replace-draft-journey-fixture-location -- <journey-slug> <fixture-slug> <replacement-slug> [--apply]",
    );
  }

  if (positional.length > 3) {
    throw new Error(`Unknown argument: ${positional[3]}.`);
  }

  if (apply) {
    if (confirmedBy.length < 2) {
      throw new Error(
        "--apply requires --confirmed-by with at least 2 characters.",
      );
    }
    if (notes.length < 20) {
      throw new Error("--apply requires --notes with at least 20 characters.");
    }
    if (evidenceUrl) {
      const parsedEvidenceUrl = URL.parse(evidenceUrl);

      if (
        !parsedEvidenceUrl ||
        (parsedEvidenceUrl.protocol !== "https:" &&
          parsedEvidenceUrl.protocol !== "http:")
      ) {
        throw new Error("--evidence-url must be an HTTP or HTTPS URL.");
      }
    }
  }

  return {
    journeySlug,
    fixtureSlug,
    replacementSlug,
    apply,
    confirmedBy,
    notes,
    evidenceUrl,
  };
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(
  first: { x: number; y: number },
  second: { x: number; y: number },
) {
  const earthRadiusMeters = 6_371_000;
  const latitudeDifference = toRadians(second.y - first.y);
  const longitudeDifference = toRadians(second.x - first.x);
  const firstLatitude = toRadians(first.y);
  const secondLatitude = toRadians(second.y);
  const haversine =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDifference / 2) ** 2;

  return (
    2 *
    earthRadiusMeters *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined.");
  }

  const input = parseArguments(process.argv.slice(2));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    const [journey] = await db
      .select({
        id: journeys.id,
        title: journeys.title,
        status: journeys.status,
        isActive: journeys.isActive,
      })
      .from(journeys)
      .where(eq(journeys.slug, input.journeySlug))
      .limit(1);
    if (!journey) {
      throw new Error(`Journey "${input.journeySlug}" was not found.`);
    }

    const locationRows = await db
      .select({
        id: locations.id,
        name: locations.name,
        slug: locations.slug,
        coordinates: locations.coordinates,
        verificationStatus: locations.verificationStatus,
        sourceType: locations.sourceType,
        sourceExternalId: locations.sourceExternalId,
        sourceUrl: locations.sourceUrl,
        isActive: locations.isActive,
      })
      .from(locations)
      .where(
        inArray(locations.slug, [input.fixtureSlug, input.replacementSlug]),
      );
    const fixture = locationRows.find(
      (location) => location.slug === input.fixtureSlug,
    );
    const replacement = locationRows.find(
      (location) => location.slug === input.replacementSlug,
    );
    if (!fixture)
      throw new Error(`Fixture "${input.fixtureSlug}" was not found.`);
    if (!replacement) {
      throw new Error(`Replacement "${input.replacementSlug}" was not found.`);
    }

    const walkingReferences = await db
      .select({ id: journeySegments.id })
      .from(journeySegments)
      .where(
        and(
          eq(journeySegments.journeyId, journey.id),
          or(
            eq(journeySegments.walkingFromLocationId, fixture.id),
            eq(journeySegments.walkingToLocationId, fixture.id),
          ),
        ),
      );
    const transitSegments = await db
      .select({
        boardingRouteStopId: journeySegments.boardingRouteStopId,
        alightingRouteStopId: journeySegments.alightingRouteStopId,
      })
      .from(journeySegments)
      .where(eq(journeySegments.journeyId, journey.id));
    const usedRouteStopIds = [
      ...new Set(
        transitSegments
          .flatMap((segment) => [
            segment.boardingRouteStopId,
            segment.alightingRouteStopId,
          ])
          .filter((id): id is string => id !== null),
      ),
    ];
    const affectedRouteStops =
      usedRouteStopIds.length === 0
        ? []
        : await db
            .select({
              id: transportRouteStops.id,
              routeId: transportRoutes.id,
              routeName: transportRoutes.name,
              routeIsActive: transportRoutes.isActive,
              routeVerificationStatus: transportRoutes.verificationStatus,
            })
            .from(transportRouteStops)
            .innerJoin(
              transportRoutes,
              eq(transportRouteStops.transportRouteId, transportRoutes.id),
            )
            .where(
              and(
                inArray(transportRouteStops.id, usedRouteStopIds),
                eq(transportRouteStops.locationId, fixture.id),
              ),
            );
    const affectedRouteIds = [
      ...new Set(affectedRouteStops.map((stop) => stop.routeId)),
    ];
    const [journeyEvidence] = await db
      .select({ id: journeyFieldObservations.id })
      .from(journeyFieldObservations)
      .where(eq(journeyFieldObservations.journeyId, journey.id))
      .limit(1);
    const [routeEvidence] =
      affectedRouteIds.length === 0
        ? []
        : await db
            .select({ id: routeFieldObservations.id })
            .from(routeFieldObservations)
            .where(
              inArray(
                routeFieldObservations.transportRouteId,
                affectedRouteIds,
              ),
            )
            .limit(1);
    const measuredDistance = distanceMeters(
      fixture.coordinates,
      replacement.coordinates,
    );
    const assessment = assessDraftFixtureReplacement({
      journeyStatus: journey.status,
      journeyIsActive: journey.isActive,
      fixtureId: fixture.id,
      fixtureSourceType: fixture.sourceType,
      fixtureIsActive: fixture.isActive,
      replacementId: replacement.id,
      replacementSourceType: replacement.sourceType,
      replacementSourceExternalId: replacement.sourceExternalId,
      replacementSourceUrl: replacement.sourceUrl,
      distanceMeters: measuredDistance,
      walkingReferenceCount: walkingReferences.length,
      routeStopReferenceCount: affectedRouteStops.length,
      relatedRoutes: affectedRouteStops.map((stop) => ({
        name: stop.routeName,
        isActive: stop.routeIsActive,
        verificationStatus: stop.routeVerificationStatus,
      })),
      hasJourneyFieldEvidence: Boolean(journeyEvidence),
      hasRouteFieldEvidence: Boolean(routeEvidence),
    });

    console.table([
      {
        journey: journey.title,
        fixture: fixture.name,
        replacement: replacement.name,
        replacementSource: `${replacement.sourceType}:${replacement.sourceExternalId ?? "none"}`,
        distanceMeters: Math.round(measuredDistance),
        walkingReferences: walkingReferences.length,
        routeStopReferences: affectedRouteStops.length,
        mode: input.apply ? "APPLY" : "DRY RUN",
      },
    ]);

    if (!assessment.isAllowed) {
      throw new Error(
        `Fixture replacement is blocked:\n${assessment.blockers.map((blocker) => `- ${blocker}`).join("\n")}`,
      );
    }

    if (!input.apply) {
      console.log(
        `Dry run passed. Confirm the replacement identity in person before rerunning with --apply. Maximum allowed distance: ${maximumFixtureReplacementDistanceMeters} meters.`,
      );
      return;
    }

    await db.transaction(async (transaction) => {
      await transaction.insert(journeyFixtureLocationReplacements).values({
        journeyId: journey.id,
        fixtureLocationId: fixture.id,
        replacementLocationId: replacement.id,
        confirmedBy: input.confirmedBy,
        confirmationNotes: input.notes,
        evidenceUrl: input.evidenceUrl,
      });

      await transaction
        .update(journeySegments)
        .set({ walkingFromLocationId: replacement.id, updatedAt: new Date() })
        .where(
          and(
            eq(journeySegments.journeyId, journey.id),
            eq(journeySegments.walkingFromLocationId, fixture.id),
          ),
        );
      await transaction
        .update(journeySegments)
        .set({ walkingToLocationId: replacement.id, updatedAt: new Date() })
        .where(
          and(
            eq(journeySegments.journeyId, journey.id),
            eq(journeySegments.walkingToLocationId, fixture.id),
          ),
        );

      if (affectedRouteStops.length > 0) {
        await transaction
          .update(transportRouteStops)
          .set({ locationId: replacement.id, updatedAt: new Date() })
          .where(
            inArray(
              transportRouteStops.id,
              affectedRouteStops.map((stop) => stop.id),
            ),
          );
      }
    });

    console.log(
      "Fixture references replaced. The replacement, route, and journey retain their existing inactive/unverified state; nothing was published.",
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
