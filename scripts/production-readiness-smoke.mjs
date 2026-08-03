const baseUrl = process.env.GROWTH_OS_BASE_URL?.replace(/\/$/, "");
const cronSecret = process.env.CRON_SECRET;
const workspaceId = process.env.WORKSPACE_ID;

for (const [name, value] of [["GROWTH_OS_BASE_URL", baseUrl], ["CRON_SECRET", cronSecret], ["WORKSPACE_ID", workspaceId]]) {
  if (!value) {
    console.error(`SMOKE=FAIL missing=${name}`);
    process.exit(2);
  }
}

const url = new URL("/api/internal/production-readiness", baseUrl);
url.searchParams.set("workspaceId", workspaceId);
const response = await fetch(url, {
  headers: { Authorization: `Bearer ${cronSecret}` },
});
const payload = await response.json().catch(() => ({}));

if (!response.ok) {
  console.error(`SMOKE=FAIL http=${response.status} error=${payload.error ?? "unknown"}`);
  process.exit(1);
}

const failed = Array.isArray(payload.checks) ? payload.checks.filter((check) => check.status === "fail") : [];
const warnings = Array.isArray(payload.checks) ? payload.checks.filter((check) => check.status === "warning") : [];
console.log(`SMOKE=${payload.status === "blocked" ? "FAIL" : "PASS"} readiness=${payload.status} fail=${failed.length} warning=${warnings.length} signature=${payload.signature ?? "unknown"}`);
for (const check of payload.checks ?? []) {
  console.log(`${String(check.status).toUpperCase()} ${check.key} :: ${check.detail}`);
}

if (payload.status === "blocked") process.exit(1);
