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

export function parseServerEnvironment(
  input: NodeJS.ProcessEnv,
): ServerEnvironment {
  return serverEnvironmentSchema.parse(input);
}
