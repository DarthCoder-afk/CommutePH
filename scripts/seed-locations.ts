import "dotenv/config";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { locations, type NewLocation } from "@/server/db/schema";

const seedLocations = [
  {
    name: "Cubao MRT-3 Station",
    slug: "cubao-mrt-3-station",
    kind: "station",
    description: "MRT-3 station serving the Cubao area along EDSA.",
    city: "Quezon City",
    area: "Cubao",
    coordinates: {
      x: 121.0510726,
      y: 14.6194837,
    },
    isActive: true,
  },
  {
    name: "Eastwood City",
    slug: "eastwood-city",
    kind: "area",
    description: "Mixed-use district and commuter destination in Bagumbayan.",
    city: "Quezon City",
    area: "Bagumbayan",
    coordinates: {
      x: 121.0799721,
      y: 14.609613,
    },
    isActive: true,
  },
  {
    name: "BGC High Street",
    slug: "bgc-high-street",
    kind: "landmark",
    description:
      "Major pedestrian and commercial destination in Bonifacio Global City.",
    city: "Taguig",
    area: "Bonifacio Global City",
    coordinates: {
      x: 121.0493256,
      y: 14.5511925,
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
    name: "BGC Bus EDSA Ayala Terminal",
    slug: "bgc-bus-edsa-ayala-terminal",
    kind: "terminal",
    description:
      "BGC Bus terminal beside McKinley Exchange Corporate Center, across EDSA from One Ayala.",
    city: "Makati",
    area: "San Lorenzo",
    coordinates: {
      x: 121.0291028,
      y: 14.5492722,
    },
    isActive: false,
  },
  {
    name: "HSBC BGC Bus Stop",
    slug: "hsbc-bgc-bus-stop",
    kind: "stop",
    description: "BGC Bus stop near HSBC Centre and Bonifacio High Street.",
    city: "Taguig",
    area: "Bonifacio Global City",
    coordinates: {
      x: 121.0485311,
      y: 14.5535091,
    },
    isActive: false,
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
