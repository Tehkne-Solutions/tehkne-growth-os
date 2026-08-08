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

export function resolveApplicationUrl(input: NodeJS.ProcessEnv): string | undefined {
  const explicit = input.APP_URL?.trim();
  if (explicit) return explicit;

  const productionDomain = input.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionDomain) return normalizeHttpsUrl(productionDomain);

  const deploymentDomain = input.VERCEL_URL?.trim();
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

function normalizeHttpsUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}
