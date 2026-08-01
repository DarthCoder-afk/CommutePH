import "dotenv/config";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { locations, type NewLocation } from "@/server/db/schema";

const seedLocations = [
  {
    name: "PITX",
    slug: "pitx",
    kind: "terminal",
    description: "Integrated public transport terminal in Parañaque.",
    city: "Parañaque",
    area: "Tambo",
    coordinates: {
      x: 120.9913732,
      y: 14.5099649,
    },
    isActive: true,
  },
  {
    name: "One Ayala Transport Terminal",
    slug: "one-ayala-terminal",
    kind: "terminal",
    description: "Public transport terminal within One Ayala in Makati.",
    city: "Makati",
    area: "San Lorenzo",
    coordinates: {
      x: 121.0279287,
      y: 14.5504667,
    },
    isActive: true,
  },
  {
    name: "Monumento LRT-1 Station",
    slug: "monumento-lrt-1-station",
    kind: "station",
    description: "LRT-1 station serving the Monumento area in Caloocan.",
    city: "Caloocan",
    area: "Grace Park",
    coordinates: {
      x: 120.9838745,
      y: 14.6543118,
    },
    isActive: true,
  },
] satisfies NewLocation[];

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined.");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const db = drizzle(pool);

  try {
    const seededLocations = await db.transaction(async (transaction) => {
      const results = [];

      for (const location of seedLocations) {
        const [seededLocation] = await transaction
          .insert(locations)
          .values(location)
          .onConflictDoUpdate({
            target: locations.slug,
            set: {
              name: location.name,
              kind: location.kind,
              description: location.description,
              city: location.city,
              area: location.area,
              coordinates: location.coordinates,
              isActive: location.isActive,
              updatedAt: new Date(),
            },
          })
          .returning({
            id: locations.id,
            name: locations.name,
            slug: locations.slug,
            kind: locations.kind,
          });

        if (!seededLocation) {
          throw new Error(`Failed to seed location: ${location.slug}`);
        }

        results.push(seededLocation);
      }

      return results;
    });

    console.table(seededLocations);
    console.log(`Seeded ${seededLocations.length} locations successfully.`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
