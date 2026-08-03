const baseUrl = process.env.GROWTH_OS_BASE_URL?.replace(/\/$/, "");
const cronSecret = process.env.CRON_SECRET;
const workspaceId = process.env.WORKSPACE_ID;

for (const [name, value] of [["GROWTH_OS_BASE_URL", baseUrl], ["CRON_SECRET", cronSecret], ["WORKSPACE_ID", workspaceId]]) {
  if (!value) {
    console.error(`RC_SMOKE=FAIL missing=${name}`);
    process.exit(2);
  }
}

const failures = [];

async function checkPublicSurface(path = "/") {
  const response = await fetch(new URL(path, baseUrl), { redirect: "manual" });
  const headers = response.headers;
  const requiredHeaders = [
    ["x-content-type-options", "nosniff"],
    ["x-frame-options", null],
    ["referrer-policy", null],
    ["permissions-policy", null],
  ];

  if (baseUrl.startsWith("https://")) requiredHeaders.push(["strict-transport-security", null]);

  for (const [name, expected] of requiredHeaders) {
    const actual = headers.get(name);
    if (!actual || (expected && actual.toLowerCase() !== expected)) {
      failures.push(`header:${name}`);
    }
  }

  if (response.status >= 500) failures.push(`public-http:${response.status}`);
  console.log(`RC_PUBLIC http=${response.status} headers=${requiredHeaders.length - failures.filter((item) => item.startsWith("header:")).length}/${requiredHeaders.length}`);
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
  const warnings = checks.filter((check) => check.status === "warning");
  if (payload.status === "blocked" || failed.length > 0) failures.push("readiness:blocked");

  console.log(`RC_READINESS status=${payload.status ?? "unknown"} fail=${failed.length} warning=${warnings.length} signature=${payload.signature ?? "unknown"}`);
  for (const check of checks) console.log(`${String(check.status).toUpperCase()} ${check.key} :: ${check.detail}`);
}

await checkPublicSurface();
await checkReadiness();

if (failures.length) {
  console.error(`RC_SMOKE=FAIL failures=${failures.join(",")}`);
  process.exit(1);
}

console.log("RC_SMOKE=PASS");
