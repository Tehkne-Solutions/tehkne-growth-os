import { describe, expect, it } from "vitest";

import {
  parseServerEnvironment,
  resolveApplicationUrl,
} from "@/shared/config/env";

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

  it("derives APP_URL from the Vercel production domain when APP_URL is absent", () => {
    const environment = parseServerEnvironment({
      DATABASE_URL: baseEnvironment.DATABASE_URL,
      NODE_ENV: "production",
      SESSION_SECRET: "a-production-secret-with-at-least-32-bytes",
      VERCEL_PROJECT_PRODUCTION_URL: "growth.example.vercel.app",
    });

    expect(environment.APP_URL).toBe("https://growth.example.vercel.app");
  });

  it("prefers explicit APP_URL over Vercel system URLs", () => {
    expect(
      resolveApplicationUrl({
        APP_URL: "https://growth.tehkne.com.br",
        VERCEL_PROJECT_PRODUCTION_URL: "fallback.vercel.app",
      }),
    ).toBe("https://growth.tehkne.com.br");
  });

  it("falls back to the deployment URL when no production project URL exists", () => {
    expect(resolveApplicationUrl({ VERCEL_URL: "preview.vercel.app" })).toBe(
      "https://preview.vercel.app",
    );
  });
});
