import { describe, expect, it } from "vitest";

import { parseServerEnvironment } from "@/shared/config/env";

const baseEnvironment = {
  APP_URL: "https://growth.tehkne.com.br",
  DATABASE_URL: "postgresql://user:password@localhost:5432/growth_os",
};

describe("server environment", () => {
  it("requires a session secret in production", () => {
    expect(() =>
      parseServerEnvironment({
        ...baseEnvironment,
        NODE_ENV: "production",
      }),
    ).toThrow("SESSION_SECRET is required in production");
  });

  it("accepts a strong production session secret", () => {
    const environment = parseServerEnvironment({
      ...baseEnvironment,
      NODE_ENV: "production",
      SESSION_SECRET: "a-production-secret-with-at-least-32-bytes",
    });

    expect(environment.NODE_ENV).toBe("production");
  });
});
