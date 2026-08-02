import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { parseServerEnvironment } from "@/shared/config/env";

export type DatabaseClient = PrismaClient;

const globalDatabase = globalThis as typeof globalThis & {
  tehkneGrowthDatabase?: PrismaClient;
};

export function getDatabase(): PrismaClient {
  if (globalDatabase.tehkneGrowthDatabase) {
    return globalDatabase.tehkneGrowthDatabase;
  }

  const environment = parseServerEnvironment(process.env);
  const adapter = new PrismaPg({ connectionString: environment.DATABASE_URL });
  const database = new PrismaClient({ adapter });

  if (environment.NODE_ENV !== "production") {
    globalDatabase.tehkneGrowthDatabase = database;
  }

  return database;
}
