import "dotenv/config";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  transportRouteCandidatePromotions,
  transportRouteCandidates,
  transportRouteCandidateStops,
  transportRoutes,
  transportRouteSchedules,
  transportRouteStops,
} from "@/server/db/schema";
import { validateRouteCandidatePromotion } from "@/server/routes/validate-route-candidate-promotion";

async function main() {
  const arguments_ = process.argv.slice(2).filter((value) => value !== "--");
  const inputPath = arguments_.find((value) => value !== "--apply");
  const shouldApply = arguments_.includes("--apply");

  if (!inputPath) {
    throw new Error(
      "Usage: pnpm db:promote-route-candidate -- <promotion.json> [--apply]",
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined.");
  }

  const input = validateRouteCandidatePromotion(
    JSON.parse(await readFile(resolve(inputPath), "utf8")),
  );
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    const [candidate] = await db
      .select({
        id: transportRouteCandidates.id,
        name: transportRouteCandidates.name,
        status: transportRouteCandidates.status,
        sourceUrl: transportRouteCandidates.sourceUrl,
      })
      .from(transportRouteCandidates)
      .where(
        and(
          eq(transportRouteCandidates.sourceType, input.sourceType),
          eq(transportRouteCandidates.sourceExternalId, input.sourceExternalId),
        ),
      )
      .limit(1);

    if (!candidate) {
      throw new Error(
        `${input.sourceType} route candidate "${input.sourceExternalId}" was not found.`,
      );
    }
    if (candidate.status !== "pending") {
      throw new Error(
        `Route candidate "${input.sourceExternalId}" is already ${candidate.status}.`,
      );
    }

    const candidateStops = await db
      .select({
        position: transportRouteCandidateStops.position,
        locationId: transportRouteCandidateStops.locationId,
        mappedName: transportRouteCandidateStops.mappedName,
        sourceExternalId: transportRouteCandidateStops.sourceExternalId,
      })
      .from(transportRouteCandidateStops)
      .where(
        eq(
          transportRouteCandidateStops.transportRouteCandidateId,
          candidate.id,
        ),
      )
      .orderBy(asc(transportRouteCandidateStops.position));
    const candidateStopByPosition = new Map(
      candidateStops.map((stop) => [stop.position, stop]),
    );
    const selectedStops = input.stops.map((stop, index) => {
      const candidateStop = candidateStopByPosition.get(stop.candidatePosition);

      if (!candidateStop) {
        throw new Error(
          `Candidate stop position ${stop.candidatePosition} was not found.`,
        );
      }
      if (!candidateStop.locationId) {
        throw new Error(
          `Candidate stop position ${stop.candidatePosition} is not linked to an imported location.`,
        );
      }

      return {
        ...stop,
        position: index + 1,
        locationId: candidateStop.locationId,
        mappedName: candidateStop.mappedName ?? candidateStop.sourceExternalId,
      };
    });
    const locationIds = selectedStops.map((stop) => stop.locationId);

    if (new Set(locationIds).size !== locationIds.length) {
      throw new Error("The promoted route cannot repeat a location.");
    }

    console.table([
      {
        candidate: candidate.name,
        draftRoute: input.name,
        mode: input.mode,
        selectedStops: selectedStops.length,
        schedule: `${input.schedule.serviceDays} · ${input.schedule.operatingHours}`,
        action: shouldApply ? "APPLY" : "DRY RUN",
      },
    ]);
    console.table(
      selectedStops.map((stop) => ({
        position: stop.position,
        candidatePosition: stop.candidatePosition,
        location: stop.mappedName,
        board: stop.canBoard,
        alight: stop.canAlight,
      })),
    );

    if (!shouldApply) {
      console.log(
        "Dry run passed. Review every selected stop and schedule value before rerunning with --apply.",
      );
      return;
    }

    const now = new Date();
    const result = await db.transaction(async (transaction) => {
      const [route] = await transaction
        .insert(transportRoutes)
        .values({
          slug: input.slug,
          name: input.name,
          mode: input.mode,
          operator: input.operator,
          signboard: input.signboard,
          description: input.description,
          verificationStatus: "unverified",
          lastVerifiedAt: null,
          isActive: false,
        })
        .returning({ id: transportRoutes.id, slug: transportRoutes.slug });

      if (!route) {
        throw new Error("The inactive draft route could not be created.");
      }

      await transaction.insert(transportRouteStops).values(
        selectedStops.map((stop) => ({
          transportRouteId: route.id,
          locationId: stop.locationId,
          position: stop.position,
          canBoard: stop.canBoard,
          canAlight: stop.canAlight,
          pickupLandmark: stop.pickupLandmark,
          dropoffLandmark: stop.dropoffLandmark,
        })),
      );
      await transaction.insert(transportRouteSchedules).values({
        transportRouteId: route.id,
        position: 1,
        serviceDays: input.schedule.serviceDays,
        operatingHours: input.schedule.operatingHours,
        publicNotes: input.schedule.publicNotes,
        lastVerifiedAt: null,
        isActive: false,
      });
      await transaction.insert(transportRouteCandidatePromotions).values({
        transportRouteCandidateId: candidate.id,
        transportRouteId: route.id,
        promotedBy: input.promotedBy,
        notes: input.notes,
        evidenceUrl: input.evidenceUrl ?? candidate.sourceUrl,
        promotedAt: now,
      });
      await transaction
        .update(transportRouteCandidates)
        .set({ status: "promoted", updatedAt: now })
        .where(eq(transportRouteCandidates.id, candidate.id));

      return route;
    });

    console.log(
      `Created inactive, unverified draft route "${result.slug}". It cannot appear publicly until the full verification workflow passes.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
