import { describe, expect, it } from "vitest";

import {
  GuidedActivationConfigurationError,
  guidedActivationEnvironmentFromProcess,
} from "./guided-activation";

describe("guidedActivationEnvironmentFromProcess", () => {
  it("prefers an explicit APP_URL", () => {
    const environment = guidedActivationEnvironmentFromProcess({
      NODE_ENV: "test",
      APP_URL: "https://growth.example.com",
      VERCEL_PROJECT_PRODUCTION_URL: "tehkne-growth-os.vercel.app",
    } as NodeJS.ProcessEnv);

    expect(environment.appUrl).toBe("https://growth.example.com");
  });

  it("uses the canonical Vercel production URL when APP_URL is absent", () => {
    const environment = guidedActivationEnvironmentFromProcess({
      NODE_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "tehkne-growth-os.vercel.app",
    } as NodeJS.ProcessEnv);

    expect(environment.appUrl).toBe("https://tehkne-growth-os.vercel.app");
  });

  it("falls back to the immutable Vercel deployment URL for previews", () => {
    const environment = guidedActivationEnvironmentFromProcess({
      NODE_ENV: "production",
      VERCEL_URL: "tehkne-growth-preview.vercel.app",
    } as NodeJS.ProcessEnv);

    expect(environment.appUrl).toBe("https://tehkne-growth-preview.vercel.app");
  });

  it("fails closed when no application URL can be resolved", () => {
    expect(() => guidedActivationEnvironmentFromProcess({ NODE_ENV: "test" } as NodeJS.ProcessEnv))
      .toThrow(GuidedActivationConfigurationError);
  });
});
