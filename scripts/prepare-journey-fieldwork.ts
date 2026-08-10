import "dotenv/config";

import { asc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  journeySegments,
  journeys,
  locations,
  transportRoutes,
  transportRouteStops,
} from "@/server/db/schema";

const journeySlug = process.argv.slice(2).find((argument) => argument !== "--");
const candidateRadiusMeters = 500;

type CandidateRow = {
  fixtureId: string;
  fixtureName: string;
  fixtureSlug: string;
  candidateName: string;
  candidateSlug: string;
  candidateKind: string;
  candidateSourceType: string;
  candidateSourceExternalId: string | null;
  candidateSourceUrl: string | null;
  distanceMeters: number;
};

async function main() {
  if (!journeySlug) {
    throw new Error(
      "Provide a journey slug. Example: pnpm db:prepare-journey-fieldwork -- one-ayala-to-bgc-high-street-via-bgc-bus",
    );
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined.");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    const [journey] = await db
      .select({
        id: journeys.id,
        title: journeys.title,
        status: journeys.status,
        isActive: journeys.isActive,
        originLocationId: journeys.originLocationId,
        destinationLocationId: journeys.destinationLocationId,
      })
      .from(journeys)
      .where(eq(journeys.slug, journeySlug))
      .limit(1);

    if (!journey) {
      throw new Error(`Journey "${journeySlug}" was not found.`);
    }

    const segments = await db
      .select({
        position: journeySegments.position,
        kind: journeySegments.kind,
        walkingFromLocationId: journeySegments.walkingFromLocationId,
        walkingToLocationId: journeySegments.walkingToLocationId,
        boardingRouteStopId: journeySegments.boardingRouteStopId,
        alightingRouteStopId: journeySegments.alightingRouteStopId,
      })
      .from(journeySegments)
      .where(eq(journeySegments.journeyId, journey.id))
      .orderBy(asc(journeySegments.position));

    const routeStopIds = [
      ...new Set(
        segments
          .flatMap((segment) => [
            segment.boardingRouteStopId,
            segment.alightingRouteStopId,
          ])
          .filter((id): id is string => id !== null),
      ),
    ];
    const routeStops =
      routeStopIds.length === 0
        ? []
        : await db
            .select({
              id: transportRouteStops.id,
              position: transportRouteStops.position,
              locationId: transportRouteStops.locationId,
              routeId: transportRoutes.id,
              routeName: transportRoutes.name,
              routeSlug: transportRoutes.slug,
            })
            .from(transportRouteStops)
            .innerJoin(
              transportRoutes,
              eq(transportRouteStops.transportRouteId, transportRoutes.id),
            )
            .where(inArray(transportRouteStops.id, routeStopIds));

    const locationIds = [
      ...new Set([
        journey.originLocationId,
        journey.destinationLocationId,
        ...segments
          .flatMap((segment) => [
            segment.walkingFromLocationId,
            segment.walkingToLocationId,
          ])
          .filter((id): id is string => id !== null),
        ...routeStops.map((stop) => stop.locationId),
      ]),
    ];
    const locationRows = await db
      .select({
        id: locations.id,
        name: locations.name,
        slug: locations.slug,
        kind: locations.kind,
        city: locations.city,
        sourceType: locations.sourceType,
        sourceExternalId: locations.sourceExternalId,
        verificationStatus: locations.verificationStatus,
        isActive: locations.isActive,
      })
      .from(locations)
      .where(inArray(locations.id, locationIds));
    const locationById = new Map(
      locationRows.map((location) => [location.id, location]),
    );

    const fixtureRows = locationRows.filter(
      (location) => location.sourceType === "development_fixture",
    );
    const fixtureIds = fixtureRows.map((location) => location.id);
    const candidateRows: CandidateRow[] =
      fixtureIds.length === 0
        ? []
        : (
            await db.execute<CandidateRow>(sql`
            SELECT
              fixture.id AS "fixtureId",
              fixture.name AS "fixtureName",
              fixture.slug AS "fixtureSlug",
              candidate.name AS "candidateName",
              candidate.slug AS "candidateSlug",
              candidate.kind AS "candidateKind",
              candidate.source_type AS "candidateSourceType",
              candidate.source_external_id AS "candidateSourceExternalId",
              candidate.source_url AS "candidateSourceUrl",
              ST_Distance(
                fixture.coordinates::geography,
                candidate.coordinates::geography
              ) AS "distanceMeters"
            FROM locations AS fixture
            INNER JOIN locations AS candidate
              ON candidate.id <> fixture.id
              AND candidate.source_type IN ('openstreetmap', 'gtfs')
              AND ST_DWithin(
                fixture.coordinates::geography,
                candidate.coordinates::geography,
                ${candidateRadiusMeters}
              )
            WHERE fixture.id IN (${sql.join(
              fixtureIds.map((id) => sql`${id}::uuid`),
              sql`, `,
            )})
            ORDER BY fixture.name, "distanceMeters", candidate.name
          `)
          ).rows;

    console.log(`Fieldwork preparation: ${journey.title}`);
    console.log(`Journey status: ${journey.status}`);
    console.log(`Currently active: ${journey.isActive}`);
    console.log("Read-only: this command did not change any records.\n");

    console.log("Ordered journey structure");
    console.table(
      segments.map((segment) => {
        const boardingStop = routeStops.find(
          (stop) => stop.id === segment.boardingRouteStopId,
        );
        const alightingStop = routeStops.find(
          (stop) => stop.id === segment.alightingRouteStopId,
        );

        return {
          segment: segment.position,
          kind: segment.kind,
          from:
            locationById.get(segment.walkingFromLocationId ?? "")?.name ??
            locationById.get(boardingStop?.locationId ?? "")?.name ??
            "missing",
          to:
            locationById.get(segment.walkingToLocationId ?? "")?.name ??
            locationById.get(alightingStop?.locationId ?? "")?.name ??
            "missing",
          route: boardingStop?.routeName ?? "walking",
        };
      }),
    );

    console.log("Required location evidence");
    console.table(
      locationRows.map((location) => ({
        name: location.name,
        slug: location.slug,
        kind: location.kind,
        city: location.city,
        source: location.sourceType,
        verification: location.verificationStatus,
        active: location.isActive,
      })),
    );

    if (fixtureRows.length === 0) {
      console.log("No development-fixture location dependencies were found.");
    } else {
      console.log(
        `Sourced candidates within ${candidateRadiusMeters} meters of fixture locations`,
      );
      console.table(
        candidateRows.map((candidate) => ({
          fixture: candidate.fixtureName,
          candidate: candidate.candidateName,
          candidateSlug: candidate.candidateSlug,
          kind: candidate.candidateKind,
          source: `${candidate.candidateSourceType}:${candidate.candidateSourceExternalId ?? "unknown"}`,
          distanceMeters: Math.round(Number(candidate.distanceMeters)),
          sourceUrl: candidate.candidateSourceUrl ?? "",
        })),
      );
      console.log(
        "Candidate proximity is not verification. Confirm identity and coordinates in person before replacing a fixture dependency.",
      );
    }

    console.log("\nRequired verification order:");
    console.log(
      "1. Replace development fixtures with confirmed sourced records.",
    );
    console.log("2. Record and approve every route-stop location observation.");
    console.log(
      "3. Record and approve the transport route and schedule observation.",
    );
    console.log("4. Record and approve the complete journey field test.");
    console.log("5. Run the unified release-readiness report again.");
    console.log(
      "No record should be activated until the final readiness report passes.",
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
