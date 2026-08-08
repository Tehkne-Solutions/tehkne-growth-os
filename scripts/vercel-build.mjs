import { spawnSync } from "node:child_process";

const migrationConfirmation = process.env.TKN_SCHEMA_MIGRATION_CONFIRMATION;
const targetEnvironment = process.env.VERCEL_TARGET_ENV ?? process.env.VERCEL_ENV;

if (migrationConfirmation) {
  if (migrationConfirmation !== "APPLY_RC_SCHEMA_PRODUCTION") {
    console.error("TKN_SCHEMA_MIGRATION=BLOCKED invalid_confirmation");
    process.exit(2);
  }
  if (targetEnvironment !== "production") {
    console.error(`TKN_SCHEMA_MIGRATION=BLOCKED target=${targetEnvironment ?? "unknown"}`);
    process.exit(2);
  }

  console.log("TKN_SCHEMA_MIGRATION=AUTHORIZED target=production");
  run("npx", ["prisma", "migrate", "deploy"]);
  console.log("TKN_SCHEMA_MIGRATION=APPLIED");
}

run("npx", ["prisma", "generate"]);
run("npx", ["next", "build"]);

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
