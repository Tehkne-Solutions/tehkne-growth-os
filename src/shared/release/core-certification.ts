export const CORE_RELEASE_CERTIFICATION = Object.freeze({
  product: "Tehkné Growth OS",
  version: "1.0.0-rc.1-core",
  channel: "PRODUCTION_CANDIDATE_CORE",
  coreStatus: "CERTIFIED",
  providerCertification: "PENDING_EXTERNAL",
  signature: "Tehkné Solutions",
} as const);

export type CoreReleaseCertification = typeof CORE_RELEASE_CERTIFICATION;
