const raw = process.env.DATABASE_URL;

if (!raw) {
  console.error("DATABASE_URL is required");
  process.exit(2);
}

let url;
try {
  url = new URL(raw);
} catch {
  console.error("DATABASE_URL is not a valid URL");
  process.exit(2);
}

if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
  console.error("DATABASE_URL must use postgres:// or postgresql://");
  process.exit(2);
}

// `schema` is a Prisma connection-string option, not a libpq/psql URI option.
// Preserve every PostgreSQL-compatible parameter (sslmode, connect_timeout, etc.).
url.searchParams.delete("schema");

process.stdout.write(url.toString());
