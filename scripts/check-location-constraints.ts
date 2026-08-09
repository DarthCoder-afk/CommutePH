import "dotenv/config";

import { randomUUID } from "node:crypto";

import { like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";

import { locations } from "@/server/db/schema";

function findPostgresErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  if ("code" in error && typeof error.code === "string") {
    return error.code;
  }

  if ("cause" in error) {
    return findPostgresErrorCode(error.cause);
  }

  return undefined;
}

async function expectConstraintError(
  client: PoolClient,
  savepoint: string,
  expectedCode: string,
  operation: () => Promise<void>,
) {
  await client.query(`SAVEPOINT ${savepoint}`);

  try {
    await operation();
  } catch (error) {
    const actualCode = findPostgresErrorCode(error);

    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);

    if (actualCode !== expectedCode) {
      throw error;
    }

    return;
  }

  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);

  throw new Error(
    `Expected PostgreSQL error ${expectedCode}, but the insert succeeded.`,
  );
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined.");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const client = await pool.connect();
  const db = drizzle(client);

  const testSlug = `constraint-test-${randomUUID()}`;
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    await db.insert(locations).values({
      name: "Constraint Test Location",
      slug: testSlug,
      kind: "landmark",
      city: "Test City",
      coordinates: {
        x: 121,
        y: 14.6,
      },
    });

    await expectConstraintError(
      client,
      "duplicate_slug_test",
      "23505",
      async () => {
        await db.insert(locations).values({
          name: "Duplicate Slug Location",
          slug: testSlug,
          kind: "landmark",
          city: "Test City",
          coordinates: {
            x: 121.01,
            y: 14.61,
          },
        });
      },
    );

    console.log("Unique slug constraint passed (23505).");

    await expectConstraintError(
      client,
      "invalid_coordinates_test",
      "23514",
      async () => {
        await db.insert(locations).values({
          name: "Invalid Coordinate Location",
          slug: `${testSlug}-invalid`,
          kind: "landmark",
          city: "Test City",
          coordinates: {
            x: 121,
            y: 95,
          },
        });
      },
    );

    console.log("Coordinate range constraint passed (23514).");

    await expectConstraintError(
      client,
      "active_unverified_test",
      "23514",
      async () => {
        await db.insert(locations).values({
          name: "Active Unverified Location",
          slug: `${testSlug}-active-unverified`,
          kind: "stop",
          city: "Test City",
          coordinates: { x: 121, y: 14.6 },
          verificationStatus: "unverified",
          isActive: true,
        });
      },
    );

    console.log("Active locations require verified status (23514).");

    await expectConstraintError(
      client,
      "external_source_id_test",
      "23514",
      async () => {
        await db.insert(locations).values({
          name: "External Location Without ID",
          slug: `${testSlug}-missing-external-id`,
          kind: "stop",
          city: "Test City",
          coordinates: { x: 121, y: 14.6 },
          sourceType: "openstreetmap",
        });
      },
    );

    console.log("External sources require stable identifiers (23514).");

    await client.query("ROLLBACK");
    transactionStarted = false;

    const remainingRows = await db
      .select({ id: locations.id })
      .from(locations)
      .where(like(locations.slug, `${testSlug}%`));

    if (remainingRows.length !== 0) {
      throw new Error("Constraint test data was not rolled back.");
    }

    console.log("Constraint test data rolled back successfully.");
  } finally {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }

    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
