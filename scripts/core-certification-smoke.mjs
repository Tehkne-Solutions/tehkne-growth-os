const baseUrl = process.env.GROWTH_OS_BASE_URL?.replace(/\/$/, "");
const cronSecret = process.env.CRON_SECRET;
const workspaceId = process.env.WORKSPACE_ID ?? process.env.RC_WORKSPACE_ID;
const expectedSha = process.env.EXPECTED_RELEASE_SHA?.trim();

for (const [name, value] of [["GROWTH_OS_BASE_URL", baseUrl], ["CRON_SECRET", cronSecret], ["WORKSPACE_ID|RC_WORKSPACE_ID", workspaceId]]) {
  if (!value) {
    console.error(`CORE_CERT=FAIL missing=${name}`);
    process.exit(2);
  }
}

const failures = [];

async function checkHealth() {
  const response = await fetch(new URL("/api/health", baseUrl), { headers: { "Cache-Control": "no-cache" } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status !== "ok") failures.push(`health-http:${response.status}`);

  const release = payload.release ?? {};
  if (release.channel !== "PRODUCTION_CANDIDATE_CORE") failures.push("release-channel");
  if (release.coreStatus !== "CERTIFIED") failures.push("core-status");
  if (release.providerCertification !== "PENDING_EXTERNAL") failures.push("provider-certification-contract");
  if (release.signature !== "Tehkné Solutions") failures.push("signature");
  if (payload.environment && payload.environment !== "production") failures.push(`environment:${payload.environment}`);
  if (expectedSha && payload.releaseSha !== expectedSha) failures.push(`release-sha:${payload.releaseSha ?? "missing"}`);

  console.log(`CORE_HEALTH http=${response.status} version=${release.version ?? "unknown"} channel=${release.channel ?? "unknown"} core=${release.coreStatus ?? "unknown"} providers=${release.providerCertification ?? "unknown"} sha=${payload.releaseSha ?? "unknown"}`);
}

async function checkReadiness() {
  const url = new URL("/api/internal/production-readiness", baseUrl);
  url.searchParams.set("workspaceId", workspaceId);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${cronSecret}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    failures.push(`readiness-http:${response.status}`);
    return;
  }

  const checks = Array.isArray(payload.checks) ? payload.checks : [];
  const failed = checks.filter((check) => check.status === "fail");
  if (payload.status === "blocked" || failed.length > 0) failures.push("readiness:blocked");

  const requiredCore = ["session", "vault", "scheduler-secret", "app-url", "scheduler-pulse", "connector-errors"];
  for (const key of requiredCore) {
    const check = checks.find((item) => item.key === key);
    if (!check || check.status !== "pass") failures.push(`core-check:${key}`);
  }

  const warnings = checks.filter((check) => check.status === "warning");
  console.log(`CORE_READINESS status=${payload.status ?? "unknown"} fail=${failed.length} warning=${warnings.length}`);
  for (const check of checks) console.log(`${String(check.status).toUpperCase()} ${check.key} :: ${check.detail}`);
}

await checkHealth();
await checkReadiness();

if (failures.length) {
  console.error(`CORE_CERT=FAIL failures=${[...new Set(failures)].join(",")}`);
  process.exit(1);
}

console.log("CORE_CERT=PASS core=certified providers=pending-external signature=Tehkné Solutions");
