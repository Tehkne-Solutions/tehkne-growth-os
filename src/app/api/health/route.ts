export function GET() {
  return Response.json({
    service: "tehkne-growth-os",
    status: "ok",
    releaseSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    environment: process.env.VERCEL_ENV ?? null,
  });
}
