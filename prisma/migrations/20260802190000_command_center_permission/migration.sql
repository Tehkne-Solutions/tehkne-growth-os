INSERT INTO "permissions" ("id", "key", "description")
VALUES (
  '7a7c1b7e-8a1c-4c84-b730-8bb8d6e9c301',
  'growth.command_center.read',
  'Read persisted Growth OS Command Center data within an authorized tenant workspace.'
)
ON CONFLICT ("key") DO NOTHING;
