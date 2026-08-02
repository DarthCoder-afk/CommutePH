export function parseDatabaseUrl(value: string | undefined) {
  const databaseUrl = value?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid URL.");
  }

  if (
    parsedUrl.protocol !== "postgresql:" &&
    parsedUrl.protocol !== "postgres:"
  ) {
    throw new Error(
      "DATABASE_URL must use the postgresql: or postgres: protocol.",
    );
  }

  if (!parsedUrl.hostname) {
    throw new Error("DATABASE_URL must include a database host.");
  }

  if (!parsedUrl.pathname || parsedUrl.pathname === "/") {
    throw new Error("DATABASE_URL must include a database name.");
  }

  return databaseUrl;
}
