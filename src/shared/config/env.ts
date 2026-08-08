import { z } from "zod";

const serverEnvironmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z.url(),
    SESSION_SECRET: z.string().min(32).optional(),
    APP_URL: z.url(),
  })
  .superRefine((environment, refinement) => {
    if (environment.NODE_ENV === "production" && !environment.SESSION_SECRET) {
      refinement.addIssue({
        code: "custom",
        message: "SESSION_SECRET is required in production.",
        path: ["SESSION_SECRET"],
      });
    }
  });

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

type ApplicationUrlKey =
  | "APP_URL"
  | "VERCEL_PROJECT_PRODUCTION_URL"
  | "VERCEL_URL";

export function resolveApplicationUrl(input: object): string | undefined {
  const environment = input as Partial<Record<ApplicationUrlKey, unknown>>;

  const explicit = readEnvironmentString(environment.APP_URL);
  if (explicit) return explicit;

  const productionDomain = readEnvironmentString(
    environment.VERCEL_PROJECT_PRODUCTION_URL,
  );
  if (productionDomain) return normalizeHttpsUrl(productionDomain);

  const deploymentDomain = readEnvironmentString(environment.VERCEL_URL);
  if (deploymentDomain) return normalizeHttpsUrl(deploymentDomain);

  return undefined;
}

export function parseServerEnvironment(
  input: NodeJS.ProcessEnv,
): ServerEnvironment {
  return serverEnvironmentSchema.parse({
    ...input,
    APP_URL: resolveApplicationUrl(input),
  });
}

export function requireSessionSecret(environment: ServerEnvironment): string {
  if (!environment.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is required by identity operations.");
  }

  return environment.SESSION_SECRET;
}

function readEnvironmentString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeHttpsUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}
